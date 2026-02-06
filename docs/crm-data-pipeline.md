# CRM Data Pipeline Reference

Procedure for importing workshop registrants, enriching with LinkedIn data, and classifying as professional vs pivoter.

---

## Pipeline Overview

```
1. EXPORT       Luma → CSV download
2. IMPORT       CSV → Supabase (dedup by email)
3. NAME REPAIR  Fix missing names from CSV + parse emails for last names
4. ENRICH       LinkedIn profile search (by name) + email lookup (fallback)
5. RE-SCRAPE    Fill missing company data from LinkedIn URLs
6. CLASSIFY     Keyword match → professional / pivoter
7. AUDIT        Data quality check + misclassification fix
```

---

## Prerequisites

| Dependency | Purpose |
|-----------|---------|
| Node.js | Run pipeline scripts |
| `@supabase/supabase-js` | Database access |
| `apify-client` | LinkedIn scraping |
| Apify account + token | API access for LinkedIn actors |

```bash
cd crm-dashboard && npm install
```

**Environment variable:**
```bash
# Add to crm-dashboard/.env.local (persists across sessions):
APIFY_TOKEN=apify_api_xxxxx
```

**⚠️ Token must be in `.env.local`** — `export APIFY_TOKEN=...` in a shell only works for that session. Background processes, Claude Code agents, and `nohup` scripts won't inherit it. All scripts in this pipeline read from `.env.local` using inline env parsing (no `dotenv` dependency needed).

---

## Step 1: Export from Luma

1. Go to Luma event → Guests → Export CSV
2. Save to `Workshop Registrants/` folder
3. Note the **actual event date** — the CSV filename timestamp may differ from the event date

### CSV columns used
```
api_id, name, first_name, last_name, email, has_joined_event, created_at
```

**Key issue:** Many registrants fill `name` but leave `first_name` / `last_name` empty. The import script handles this, but some still end up first-name-only.

---

## Step 2: Import to Supabase

```bash
node scripts/import-registrants.js "<csv-filename>" <YYYY-MM-DD>
```

Example:
```bash
node scripts/import-registrants.js "Claude Code for Climate Work - Guests - 2026-02-03-20-14-28.csv" 2026-02-05
```

**What it does:**
- Creates new leads (deduped by email against existing DB)
- Parses `name` → `first_name` + `last_name` when fields are empty
- Creates registration records with attendance status (`has_joined_event`)
- Skips already-imported registrations (by `source_api_id`)
- Extracts `company_domain` from email

**Output:** Stats report showing new leads, updated leads, new registrations, and count needing enrichment.

**⚠️ Event name:** The script hardcodes `event_name`. For different workshop titles, edit the script or update the DB after import. Also update `EVENT_LABELS` in `src/lib/supabase.ts` when adding a new event to the dashboard.

---

## Step 3: Fix Missing Names

### 3a. Parse names from CSV source data

```bash
node scripts/fix-names.js
```

Scans original CSV files for unparsed names and updates the DB. Only fixes cases where the CSV `name` field has a parseable first + last name.

### 3b. Email-based name recovery (via Claude Code)

After import + fix-names, you'll typically have three groups:

| Group | % of leads | Can do |
|-------|-----------|--------|
| Full name (first + last) | ~75-80% | LinkedIn name search |
| First name only | ~15-20% | Parse email → recover last name, then search |
| No name | ~1-3% | Email-to-LinkedIn lookup only |

**For leads with first name only** — extract last names from email addresses. This recovers ~60% of first-name-only leads.

Parse email prefixes using separator heuristics:
```
john.smith@company.com      → John Smith     (dot separator)
jane_doe@gmail.com          → Jane Doe       (underscore separator)
mjohnson@company.com        → M Johnson      (first initial + known first name)
sarahconnor123@gmail.com    → Sarah Connor   (strip trailing numbers)
```

**Validation rules** to avoid bad parses:
- Both parts must be ≥ 2 characters
- Parsed last name must differ from first name
- No numbers in the parsed name
- Skip non-name words (info, admin, hello, contact, etc.)
- Cross-check: if existing `first_name` matches email prefix start, use remainder as last name

After parsing, update the leads in Supabase — they're now eligible for name-based LinkedIn search.

---

## Step 4: LinkedIn Enrichment (by Name)

```bash
APIFY_TOKEN=xxx node scripts/linkedin-enrichment.js
```

### Apify Actor
**Use:** `harvestapi/linkedin-profile-search-by-name`

```javascript
const run = await client.actor('harvestapi/linkedin-profile-search-by-name').call({
  firstName,
  lastName,
  profileScraperMode: 'Full',
  maxPages: 1,
});
```

### Requirements
- **Both first and last name required** — script skips leads missing either
- Rate limit: 1 second between requests
- Cost: ~$0.004-0.01 per search

### What it returns
```javascript
{
  linkedinUrl: "https://www.linkedin.com/in/...",
  headline: "Job Title at Company",
  currentPosition: [{ companyName, position }],
  experience: [{ companyName, position }],
  location: { linkedinText }
}
```

### Fields populated in DB
- `linkedin_url` — Profile URL
- `linkedin_title` — Headline text (used as title)
- `linkedin_company` — Current company (from `currentPosition[0].companyName`)
- `linkedin_headline` — Full headline
- `linkedin_location` — Geographic location

**The script is idempotent** — re-running skips already-enriched leads (`linkedin_url IS NULL`).

### Running at scale with Claude Code

For large batches (500+ leads), the sequential script is slow (~2+ hours). Use standalone scripts launched via `nohup`:

```bash
nohup node scripts/enrich-remaining.js > /tmp/enrich-remaining.log 2>&1 &
echo "PID: $!"
```

**Key learnings from production runs:**

1. **Use `nohup` + standalone script files** — don't use inline `node -e` or piped commands for long-running enrichment. Pipes break when Apify actor logs flood stderr, and background shell processes get cleaned up unpredictably.

2. **Scripts must load their own env** — background processes don't inherit shell `export` variables. Use inline env loading in every script:
   ```javascript
   const fs = require('fs');
   const envPath = require('path').join(__dirname, '..', '.env.local');
   fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
     const [key, ...val] = line.split('=');
     if (key && val.length) process.env[key.trim()] = val.join('=').trim();
   });
   ```

3. **Don't use `dotenv`** — it's not in the project dependencies. Use the inline parser above.

4. **Parallel agents via Claude Code Task tool are unreliable** — they often fail silently (output files disappear, processes get reaped). Prefer a single `nohup` process that runs sequentially. At ~8 sec/lead, 60 leads takes ~8 min.

5. **Expect ~10 min runtime per batch** — processes may get killed by system timeouts. Design for resumability: the script queries `linkedin_url IS NULL` each time, so re-running picks up where it left off.

6. **Monitor with Supabase count, not log files** — log output is unreliable with background processes. Instead:
   ```bash
   node -e "/* count enriched leads from supabase */"
   ```

7. **Keep laptop awake** — background processes stop if the machine sleeps.

8. **Name search has a ceiling** — after processing all leads with full names, expect ~10-15% to return 0 LinkedIn results (unusual names, non-Western names, not on platform). These won't improve with re-runs.

### Fallback: Email-to-LinkedIn lookup

For leads that still can't be searched by name (no last name after all parsing), use email lookup:

**Apify Actor:** `enrichmentlabs/linkedin-data-enrichment-api`

**⚠️ Correct input format** — this actor does NOT use `urls`. It uses `mode` + `bulkEmails`:

```javascript
const run = await client.actor('enrichmentlabs/linkedin-data-enrichment-api').call({
  mode: 'bulk-email-lookup',
  bulkEmails: emails,  // array of email strings, max 5 per request
}, { timeout: 120 });
```

**Wrong (will silently fail with Turkish error message):**
```javascript
// DON'T DO THIS:
{ urls: emails.map(e => ({ url: e })) }
```

**Available modes:** `email-lookup`, `bulk-email-lookup`, `social-url-lookup`, `bulk-social-url-lookup`, `company-lookup`, `email-finder`, `person-match`, `email-verification`

- Cost: ~$0.01 per result
- **Max 5 emails per request** — batch accordingly
- Match rate: very low for personal emails (Gmail, Hotmail etc.) — in our run, 0/119 matched. Works better with corporate email domains.
- Returns LinkedIn profile URL, name, and company if found

**Standalone script:** `scripts/enrich-email-lookup.js`

---

## Step 5: Re-Scrape Sparse Profiles

```bash
APIFY_TOKEN=xxx node scripts/rescrape-profiles.js
```

For leads that have a LinkedIn URL but missing company data (common with sparse/student profiles).

### Apify Actor
**Use:** `dev_fusion/linkedin-profile-scraper`

```javascript
const run = await client.actor('dev_fusion/linkedin-profile-scraper').call({
  profileUrls: [linkedinUrl],
});
```

**Do NOT use** (tested, don't work):
- `harvestapi/linkedin-people-profiles-by-url` — actor not found
- `supreme_coder/linkedin-profile-scraper` — URL validation errors

### What it returns
```javascript
{
  companyName: "Company Name",
  headline: "Full headline",
  jobTitle: "Title only",
  addressWithCountry: "City, State, Country",
}
```

---

## Step 6: Classification

```bash
node scripts/reclassify-leads.js
```

Classifies enriched leads as `professional` (climate industry) or `pivoter` (career transitioner).

### How it works
Checks `linkedin_title`, `linkedin_headline`, `linkedin_company` for climate keywords:

```javascript
const climateKeywords = [
  'sustainability', 'sustainable', 'climate', 'environmental', 'environment',
  'carbon', 'net zero', 'net-zero', 'renewable', 'energy transition',
  'esg', 'green', 'circular economy', 'decarbonization', 'decarbonisation',
  'clean energy', 'cleantech', 'solar', 'wind energy', 'biodiversity',
  'conservation', 'ecology', 'emissions', 'ghg',
  'sustainability manager', 'sustainability director', 'sustainability officer',
  'cso', 'chief sustainability', 'climate change', 'climate action',
  'impact investing', 'social impact', 'green finance', 'sustainable finance',
  'hydrogen', 'battery storage', 'electric vehicle', 'ev',
  'leed', 'breeam', 'carbon footprint', 'carbon neutral', 'carbon offset',
  'csrd', 'tcfd', 'gri', 'sasb', 'cdp', 'sdg',
  // ... see full list in scripts/reclassify-leads.js
];
```

**Logic:**
- Any keyword match → `professional`
- No match but has LinkedIn data → `pivoter`
- No LinkedIn data → stays `unknown`

### Post-classification fix

```bash
node scripts/fix-issues.js
```

Catches edge cases:
- Pivoters with climate keywords → reclassify as professional
- Email addresses stuck in `first_name` field → extract real name from email prefix

---

## Step 7: Audit

```bash
node scripts/audit-data.js
```

Reports:
- **Completeness** — % with email, name, LinkedIn, company, title, location
- **Lead type breakdown** — professional / pivoter / unknown counts and %
- **Why missing LinkedIn** — no last name vs. no match found
- **Why still unknown** — no LinkedIn data vs. no keywords matched
- **Spot checks** — professionals without keywords, pivoters with keywords
- **Data quality** — emails in name fields, placeholder titles (`--`), sparse profiles
- **Fully enriched & classified** — the final quality score

---

## Quick Reference: Full Pipeline

```bash
# 1. Import new CSV
node scripts/import-registrants.js "<filename>.csv" YYYY-MM-DD

# 2. Fix names from CSV data
node scripts/fix-names.js

# 3. (Via Claude Code) Email name recovery for first-name-only leads
#    Parse emails → update last names → enables LinkedIn search

# 4. LinkedIn enrichment by name
APIFY_TOKEN=xxx node scripts/linkedin-enrichment.js

# 5. (Via Claude Code) Email-to-LinkedIn lookup for remaining nameless leads
#    Actor: enrichmentlabs/linkedin-data-enrichment-api, max 5 per batch

# 6. Re-scrape sparse profiles
APIFY_TOKEN=xxx node scripts/rescrape-profiles.js

# 7. Classify leads
node scripts/reclassify-leads.js

# 8. Fix misclassifications
node scripts/fix-issues.js

# 9. Audit
node scripts/audit-data.js
```

### Scripted one-liner (steps 2, 4, 6-9 — skips Claude Code steps)
```bash
node scripts/fix-names.js && \
APIFY_TOKEN=xxx node scripts/linkedin-enrichment.js && \
APIFY_TOKEN=xxx node scripts/rescrape-profiles.js && \
node scripts/reclassify-leads.js && \
node scripts/fix-issues.js && \
node scripts/audit-data.js
```

---

## Expected Results

| Metric | Target | Actual (Feb 2026) | Notes |
|--------|--------|-------------------|-------|
| LinkedIn enriched | 75-85% | **90%** (1,113/1,232) | Email name recovery pushed it above target |
| Company data | 70-75% | TBD | Re-scrape fills gaps |
| Classified (non-unknown) | 75-85% | **83%** (1,023/1,232) | 423 professional + 600 pivoter |
| Fully enriched & classified | 65-75% | TBD | Has LinkedIn + company + title + lead type |

### Why some leads aren't enriched

| Reason | % of total | Actual | Mitigation |
|--------|-----------|--------|------------|
| Missing last name | ~10-15% | 52 (4%) | Email parsing recovered most; remainder have ambiguous emails |
| No LinkedIn match (name search) | ~5-10% | 67 (5%) | Non-Western/unusual names, not on platform. Re-runs won't help. |
| No LinkedIn match (email lookup) | varies | 119 (10%) attempted, 0 matched | Personal email domains (Gmail etc.) have near-zero match rate |
| Sparse profiles | ~3-5% | TBD | Re-scrape fills some; students/inactive accounts |
| Email-only signup (no name at all) | ~1-3% | ~1% | Very few after email name recovery |

---

## Costs

| Actor | Cost | Use |
|-------|------|-----|
| `harvestapi/linkedin-profile-search-by-name` | ~$0.004/search | Primary enrichment |
| `dev_fusion/linkedin-profile-scraper` | ~$0.01/profile | Re-scraping for company |
| `enrichmentlabs/linkedin-data-enrichment-api` | ~$0.01/email | Email-to-LinkedIn lookup |

**Budget:** ~$5-10 per 500 new registrants (all enrichment passes).

---

## Database

### Connection
- **Supabase project:** `zvllsngvdkmnsjydoymq.supabase.co`
- **Schema:** `diego` (not public)
- **Credentials:** in `.env.local`

### Schema

```sql
workshop_leads (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                     TEXT UNIQUE NOT NULL,
  first_name                TEXT,
  last_name                 TEXT,
  company_domain            TEXT,
  lead_type                 TEXT DEFAULT 'unknown',  -- 'professional' | 'pivoter' | 'unknown'
  classification_confidence TEXT,                     -- 'high' | 'medium' | 'low'
  linkedin_url              TEXT,
  linkedin_title            TEXT,
  linkedin_company          TEXT,
  linkedin_headline         TEXT,
  linkedin_industry         TEXT,
  linkedin_location         TEXT,
  climate_signals           JSONB,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
)

workshop_registrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID REFERENCES diego.workshop_leads(id),
  event_name        TEXT NOT NULL,
  event_date        DATE NOT NULL,
  registration_date TIMESTAMPTZ,
  attended          BOOLEAN DEFAULT false,
  source_api_id     TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
)
```

### Event registry

When adding a new event, update `EVENT_LABELS` in `src/lib/supabase.ts`:

```typescript
export const EVENT_LABELS: Record<string, string> = {
  '2025-12-04': 'Build a Climate Solution — Dec 4',
  '2025-12-17': 'Build a Climate Solution — Dec 17',
  '2026-01-13': 'Build a Climate Solution — Jan 13',
  '2026-02-05': 'Claude Code for Climate Work — Feb 5',
}
```

---

## Troubleshooting

### Script crashes with ECONNRESET
Normal for long-running scripts. Re-run — all scripts are idempotent.

### Background process dies silently
Check these in order:
1. **APIFY_TOKEN not loaded** — most common. Verify with `node -e "console.log(process.env.APIFY_TOKEN)"` inside the script. Must be in `.env.local`, not just shell `export`.
2. **Pipe broken** — if you launched with `| grep` or `| head`, Apify actor logs to stderr can break the pipe and kill the process. Always redirect: `> /tmp/log.log 2>&1`.
3. **System timeout** — macOS may reap long-running background processes. Use `nohup` and design scripts to be re-runnable.
4. **Apify usage limits** — check your Apify dashboard. The actor will throw auth errors if you hit plan limits.

### Many "Not found" results
- Check names are properly parsed (need both first + last)
- International/non-Western names often return 0 results — this is a known limitation of the name search actor
- Try email-to-LinkedIn lookup as fallback (works better with corporate emails than personal)

### Supabase returns only 1000 rows
Default page size limit. **This silently truncates results** — aggregations on fetched data will be wrong. Use count queries instead:
```javascript
// WRONG — only counts first 1000
const { data } = await supabase.schema('diego').from('workshop_leads').select('lead_type');
data.length; // ← capped at 1000

// RIGHT — true count
const { count } = await supabase.schema('diego').from('workshop_leads')
  .select('*', { count: 'exact', head: true }).eq('lead_type', 'professional');
```

### Actor not found errors
Verify exact actor name on Apify — case-sensitive, includes `username/` prefix.

### Email lookup actor wrong input format
The `enrichmentlabs/linkedin-data-enrichment-api` actor requires `mode: 'bulk-email-lookup'` and `bulkEmails: [...]`. Using `urls: [{ url: email }]` will fail with a Turkish error message ("Bu işlem için Email adresi zorunludur!").

### New schema not accessible via API
If tables were created in a new Supabase schema:
1. Dashboard → Settings → API → Exposed schemas → add schema name
2. Run SQL:
```sql
GRANT USAGE ON SCHEMA diego TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA diego TO anon, authenticated;
```

---

## Dashboard

Next.js app at `crm-dashboard/`.

**Pages:**
| Route | Description |
|-------|-------------|
| `/` | Dashboard — stat cards, segment pie chart, attendance bar chart, lead table with search/filter/sort |
| `/events` | Event comparison — audience mix, attendance rates, new vs returning, top companies per event |
| `/repeat-attendees` | Multi-event attendees |
| `/companies` | Company breakdown with lead counts |
| `/locations` | Geographic distribution by LinkedIn location |

**Lead table features:** Search, type filter (professional/pivoter/unknown), event filter, company filter, location filter, sortable columns, pagination, CSV export, click-to-open detail modal.

```bash
npm run dev    # http://localhost:3000
npm run build  # Production build
```

---

## File Map

```
crm-dashboard/
├── docs/
│   └── crm-data-pipeline.md          ← this file
├── scripts/
│   ├── import-registrants.js          Step 2: CSV → Supabase
│   ├── fix-names.js                   Step 3a: Parse names from CSV
│   ├── linkedin-enrichment.js         Step 4: Name → LinkedIn profile (sequential)
│   ├── enrich-remaining.js            Step 4b: Name search for remaining leads (nohup-friendly)
│   ├── enrich-email-lookup.js         Step 4c: Email → LinkedIn lookup (nohup-friendly)
│   ├── rescrape-profiles.js           Step 5: URL → company data
│   ├── reclassify-leads.js            Step 6: Keyword classification
│   ├── fix-issues.js                  Step 6b: Misclassification fixes
│   └── audit-data.js                  Step 7: Quality audit
├── Workshop Registrants/
│   ├── *.csv                          Source CSVs from Luma exports
│   └── *.json                         Intermediary working files (enrichment batches, parsed names)
├── src/
│   ├── lib/supabase.ts                Types, event labels, shared constants
│   ├── app/                           Next.js pages (dashboard, events, companies, locations, repeat-attendees)
│   └── components/                    UI components (LeadTable, TableControls, charts, modals, etc.)
└── .env.local                         Supabase URL + anon key + APIFY_TOKEN
```

---

## Run History

| Date | Event | Registrants | New leads | Enrichment rate |
|------|-------|------------|-----------|-----------------|
| 2025-12 | Build a Climate Solution — Dec 4 | 174 | 174 | ~82% |
| 2025-12 | Build a Climate Solution — Dec 17 | 265 | ~200 | ~82% |
| 2026-01 | Build a Climate Solution — Jan 13 | 261 | ~250 | ~82% |
| 2026-02 | Claude Code for Climate Work — Feb 5 | 742 | 605 | 90% |
| **Total** | | **1,442** | **1,232** | **90%** |

### Feb 2026 Run Notes
- Name search enriched 1,113 leads (90%). Remaining 119 exhausted both name search and email lookup.
- Email lookup (`bulk-email-lookup` mode) returned 0 matches on 119 personal email addresses — this actor is ineffective for Gmail/Hotmail/personal domains.
- Classification: 423 professional (34%), 600 pivoter (49%), 209 unknown (17%). Unknowns are mostly leads without LinkedIn data.
- Total Apify spend for this run: ~$8-10 across all actors.
