# CRM Data Pipeline Reference

Best practices for importing workshop registrants and enriching with LinkedIn data.

## Overview

The pipeline has four stages:
1. **Import** - Parse CSV registrations into `workshop_leads`
2. **Name Parsing** - Ensure first/last names are populated
3. **LinkedIn Enrichment** - Search for profiles by name
4. **Profile Scraping** - Fill missing company data from profile URLs
5. **Classification** - Categorize as professional/pivoter

---

## 1. Data Import

### Source Data Format
Workshop registration CSVs from Luma have these relevant columns:
```
api_id, name, first_name, last_name, email, ...
```

**Key Issue**: Many registrants only fill out the `name` field, leaving `first_name` and `last_name` empty.

### Best Practice
When importing, always parse the `name` field:
```javascript
function parseName(fullName) {
  if (!fullName) return { first: '', last: '' };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}
```

Run `scripts/fix-names.js` after any new import to catch unparsed names.

---

## 2. LinkedIn Enrichment (by Name)

### Apify Actor
**Use**: `harvestapi/linkedin-profile-search-by-name`

```javascript
const run = await client.actor('harvestapi/linkedin-profile-search-by-name').call({
  firstName,
  lastName,
  profileScraperMode: 'Full',
  maxPages: 1,
});
```

### Requirements
- **Both first and last name required** - Script skips leads missing either
- Rate limit: 1 second between requests
- Cost: ~$0.01-0.02 per search

### What It Returns
```javascript
{
  linkedinUrl: "https://www.linkedin.com/in/...",
  headline: "Job Title at Company",
  currentPosition: [{ companyName, position }],
  experience: [{ companyName, position }],
  location: { linkedinText }
}
```

### Script
`scripts/linkedin-enrichment.js` - Processes all leads where `linkedin_url IS NULL`

```bash
APIFY_TOKEN=your_token node scripts/linkedin-enrichment.js
```

---

## 3. Profile Scraping (by URL)

For leads that have a LinkedIn URL but missing company data (common with sparse profiles).

### Apify Actor
**Use**: `dev_fusion/linkedin-profile-scraper`

```javascript
const run = await client.actor('dev_fusion/linkedin-profile-scraper').call({
  profileUrls: [linkedinUrl],
});
```

**Do NOT use**:
- `harvestapi/linkedin-people-profiles-by-url` - Actor not found
- `supreme_coder/linkedin-profile-scraper` - URL validation errors

### What It Returns
```javascript
{
  companyName: "Company Name",
  headline: "Full headline",
  jobTitle: "Title only",
  addressWithCountry: "City, State, Country",
  firstName, lastName, fullName,
  // ... more fields
}
```

### Script
`scripts/rescrape-profiles.js` - Processes leads where `linkedin_url IS NOT NULL AND linkedin_company IS NULL`

```bash
APIFY_TOKEN=your_token node scripts/rescrape-profiles.js
```

---

## 4. Lead Classification

Categorize leads as `professional` (climate industry) or `pivoter` (career transitioner).

### Keyword Matching
Check `linkedin_title`, `linkedin_headline`, `linkedin_company` for climate keywords:

```javascript
const climateKeywords = [
  'sustainability', 'climate', 'environmental', 'carbon', 'net zero',
  'renewable', 'esg', 'clean energy', 'cleantech', 'decarbonization',
  'circular economy', 'biodiversity', 'conservation', 'emissions',
  'green finance', 'sustainable finance', 'impact investing',
  // ... see full list in scripts/reclassify-leads.js
];
```

### Script
`scripts/reclassify-leads.js` - Reclassifies leads where `lead_type = 'unknown'` and has LinkedIn data

```bash
node scripts/reclassify-leads.js
```

---

## Complete Workflow for New Registrants

```bash
# 1. Import CSV to Supabase (manual or via import script)

# 2. Fix any unparsed names
node scripts/fix-names.js

# 3. Enrich with LinkedIn data
APIFY_TOKEN=your_token node scripts/linkedin-enrichment.js

# 4. Fill missing company data
APIFY_TOKEN=your_token node scripts/rescrape-profiles.js

# 5. Classify leads
node scripts/reclassify-leads.js
```

---

## Expected Results

| Metric | Target |
|--------|--------|
| LinkedIn enriched | 75-80% |
| Company data | 70-75% |
| Unknown lead type | <20% |

### Why Some Leads Aren't Enriched
- **Missing last name** (~14%) - Registration form only collected first name
- **No LinkedIn match** (~7%) - Name too common, international names, or not on LinkedIn
- **Sparse profiles** (~5%) - Students, inactive accounts, no company listed

---

## Costs

| Actor | Cost | Notes |
|-------|------|-------|
| linkedin-profile-search-by-name | ~$0.01/search | Initial enrichment |
| linkedin-profile-scraper | ~$0.01/profile | Re-scraping for company |

Budget ~$5-10 per 500 new registrants.

---

## Troubleshooting

### Script crashes with ECONNRESET
- Normal for long-running scripts
- Just re-run - it will skip already-enriched leads

### Many "Not found" results
- Check if names are properly parsed (first + last)
- International names may need manual lookup

### Actor not found errors
- Verify exact actor name on Apify
- Actor names are case-sensitive and include username prefix

---

## Database Schema

```sql
workshop_leads (
  id UUID PRIMARY KEY,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  company_domain TEXT,
  lead_type TEXT,  -- 'professional', 'pivoter', 'unknown'
  linkedin_url TEXT,
  linkedin_title TEXT,
  linkedin_company TEXT,
  linkedin_headline TEXT,
  linkedin_location TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

---

## Environment Variables

```bash
APIFY_TOKEN=apify_api_xxxxx  # Required for LinkedIn scraping
```

Store in `.env.local` or pass directly to scripts.
