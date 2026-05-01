# Kith Climate CRM Dashboard

## Overview

Next.js App Router dashboard for Kith Climate CRM. Deployed on Cloudflare Workers with webhook processing via Supabase Edge Functions. Supabase backend on project `tfcuozmbnnswencikncv` ("AI Context"), schema `kith_climate`. Auth via Auth0. LinkedIn enrichment via Apify.

## Tech Stack

- **Next.js** (App Router) on **Cloudflare Workers**
- **Supabase** (PostgreSQL, Edge Functions, RLS)
- **Auth0** for authentication
- **Stripe** for payments
- **Fathom.ai** for interview recording
- **Calendly** for booking
- **Apify** for LinkedIn enrichment
- **Resend** for email delivery

## Architecture

The system has two runtime environments:

### Next.js Dashboard (Cloudflare Workers)
- Serves the CRM dashboard UI
- API routes: `/api/fathom/backfill`, `/api/outlook/sync`, `/api/leads`, `/api/enrichment/status`, `/api/emails`
- Accesses Fathom API keys via `process.env` (configured in Cloudflare)

### Supabase Edge Functions (Deno)
- `fathom-webhook` — Fathom `new_meeting_content_ready` events → classify, upsert interviews, advance funnel (cohort-aware)
- `fathom-backfill` — Manual backfill: fetches all Fathom meetings, matches to existing interviews or creates new (cohort-aware)
- `calendly-webhook` — Calendly `invitee.created`/`invitee.canceled` → manage bookings and funnel (cohort-aware)
- `backfill-calendly` — Manual backfill: fetches Calendly events, deduplicates, inserts bookings (cohort-aware)
- `outlook-daily-sync` — Daily Outlook email scan → detects interview/enrolment invites → creates pending funnel changes (cohort-aware)
- `stripe-kith-climate-webhook` — Stripe `checkout.session.completed`/`charge.refunded` → manage payments (cohort-aware)
- `kith-climate-email-automation` — DB trigger for funnel changes → queue/send automated emails (receives cohort from trigger)
- `kith-climate-send-email` — Send emails via Resend, personalise with `{cohort}` variable, record in emails table
- `kith-climate-pending-email-review` — Approve/reject pending emails (called from dashboard via proxy)
- `kith-climate-resend-webhook` — Resend delivery/open/click/bounce/complaint events → update emails table engagement columns. Verified via svix signature. Secret: `RESEND_WEBHOOK_SECRET`.

### Architecture Principles
- **Database mutations on RLS-protected tables must go through Supabase Edge Functions**, not Cloudflare Workers API routes. Dashboard uses anon key (subject to RLS); edge functions use service role key (bypasses RLS).
- **Next.js API routes should be thin proxies** for operations requiring service role key. Pattern: fetch to `${SUPABASE_URL}/functions/v1/<function-name>` with anon key auth. See `trigger-sync/route.ts` for reference.
- **Never add SUPABASE_SERVICE_ROLE_KEY to Cloudflare Workers.** Create or extend a Supabase edge function instead.

## Multi-Cohort System

The funnel is **cohort-aware**. Each customer can exist in multiple cohorts simultaneously (e.g., deferred from March, re-applying for May).

### Two status fields on `customers`

- **`cohort_statuses`** (JSONB) — source of truth per cohort: `{"March 16th 2026": {"status": "deferred_next_cohort", "updated_at": "..."}, "May 18th 2026": {"status": "invited_to_enrol", "updated_at": "..."}}`
- **`funnel_status`** (text) — auto-calculated as the highest-ranked status across all cohort entries. Used only for the "All Cohorts" view.

### Cohort assignment rule

**Every function that assigns a cohort must derive it from the customer's `cohort_statuses`**, picking the entry with the most recent `updated_at`. A hardcoded `DEFAULT_COHORT` is only used as a last resort for brand-new customers with no cohort history.

All edge functions, API routes, and frontend components follow this pattern. **Never hardcode a cohort string** except as a fallback constant.

### The `advance_funnel` RPC

All funnel transitions go through the `kith_climate.advance_funnel(p_customer_id, p_new_status, p_cohort)` database RPC:
- When `p_cohort` is provided: updates the specific cohort entry in `cohort_statuses`, then recalculates `funnel_status` as the highest rank across all entries.
- When `p_cohort` is NULL: legacy path — updates only `funnel_status`. **Avoid this.**

### Adding a new cohort

When a new cohort starts, update these locations:

| Location | What to change |
|----------|---------------|
| `src/lib/supabase.ts` | Add entry to `COHORT_OPTIONS` array (all components import from here) |
| `src/components/CohortSelector.tsx` | Update default `??` fallback |
| `src/app/funnel/page.tsx` | Update default `??` fallback |
| `stripe-kith-climate-webhook/index.ts` | Update `CURRENT_COHORT` fallback + redeploy |
| `outlook-daily-sync/index.ts` | Update `DEFAULT_COHORT` fallback + redeploy |
| `calendly-webhook/index.ts` | Update `DEFAULT_COHORT` fallback + redeploy |
| `fathom-webhook/index.ts` | Update `DEFAULT_COHORT` fallback + redeploy |
| `backfill-calendly/index.ts` | Update `DEFAULT_COHORT` fallback + redeploy |
| `fathom-backfill/index.ts` | Update `DEFAULT_COHORT` fallback + redeploy |

### Cohort-filtered views

The CohortSelector (URL param `?cohort=May 18th 2026`) controls which cohort the dashboard shows. When a cohort is selected:
- Customers are filtered to those with a `cohort_statuses` entry for that cohort
- Their `funnel_status` is overridden with the cohort-specific status
- All dashboard actions send the selected cohort to API routes → `advance_funnel` RPC

### Email automation and cohort

The `notify_email_on_funnel_change` DB trigger diffs `OLD` vs `NEW` `cohort_statuses` to determine which cohort changed, and passes it to the email automation function. Template `{cohort}` variables resolve correctly via the request's cohort parameter.

## Data Model

### customers (Central Hub)
Single source of truth for all leads/customers. Key fields:
- `funnel_status` — lead → registered → attended → applied → invited_to_interview → booked → interviewed → invited_to_enrol → enrolled (plus: application_rejected, interview_rejected, no_show, offer_expired, not_invited)
- `cohort_statuses` — JSONB with per-cohort status entries (see Multi-Cohort System above)
- `enrichment_status` — pending → enriching → enriched → failed → skipped
- `lead_type` — professional, pivoter, unknown
- Funnel advancement uses rank system (registered=1 → attended=2 → enrolled=8) that prevents backsliding

### workshop_registrations
Links customers to workshop events. One customer can have multiple registrations. Fields: customer_id, event_name, event_date, registration_date, attended, source_api_id.

Two triggers tie this table to the funnel:
- `sync_customer_on_workshop_registration` (AFTER INSERT) — advances customer to `registered`; if the inserted row already has `attended = true`, also advances to `attended`.
- `sync_customer_on_workshop_attendance` (AFTER UPDATE OF attended) — when `attended` flips to `true`, advances customer to `attended`. Populated by `luma-webhook` in real time and `luma-attendance-backfill` for historical events.

### cohort_applications
Formal applications for the cohort program. Contains application responses (role, background, ai_view, goals, budget_confirmed), UTM tracking. Status field tracks review.

### interviews_booked
Calendly booking records. Key fields: calendly_event_uri, calendly_invitee_uri, scheduled_at, cancelled_at, cancel_reason, interviewee/interviewer name+email. Booking created → customer advances to `booked`. Cancelled → reverts to `invited_to_interview`.

### interviews
Fathom recordings and outcomes. Key fields: fathom_recording_id, fathom_recording_url, fathom_summary, transcript, outcome (approved/rejected/waitlisted/pending). Interview conducted → `interviewed`. Outcome set → `invited_to_enrol` or `interview_rejected`.

### payments
Stripe payment records. Key fields: stripe_payment_intent_id, stripe_checkout_session_id, amount_cents, currency, status, product, cohort, enrollee_customer_id. Payment succeeds → customer advances to `enrolled`.

### emails
Email communication log. Fields: customer_id, direction (inbound/outbound), from_address, to_addresses[], subject, body_preview, email_type, message_id, conversation_id. Populated via batch sync, NOT displayed in dashboard.

### page_views
Website traffic from kithclimate.com. Fields: page_path, page_title, referrer, user_agent, utm_source/medium/campaign. ~4,800+ rows, NOT displayed in dashboard.

### engagements (B2B pipeline — separate from cohort funnel)

Distinct funnel for B2B opportunities (corporate contracts, partners, regional coaches). **Do not conflate with `customers`** — `customers` is per-individual B2C cohort applicants; `engagements` is per-organisation B2B work.

Key fields: `slug` (unique, matches folder name in `kith-climate/engagements/{stream}/{slug}/`), `stream` (`corporate_contract` / `partner` / `coach`), `stage` (`intro` → `discovery` → `proposal_sent` → `negotiation` → `won` → `live` → `closed`, plus `lost`/`dormant`), `primary_contact_*`, `region`, `next_steps`, `proposals` (text[] of paths in `kith-climate/proposals/`), `folder_path`, `notes_markdown` (mirrors body of `status.md`), `last_synced_at` (timestamp of last sync from a file).

No relationships to `customers`, `interviews`, or any cohort-funnel table. Single flat table by design — multi-contact / interaction history live in the dated markdown files alongside `status.md`.

**RLS is OFF** on this table. Anon-key updates work directly because the dashboard is gated by Auth0. If exposing this table outside the gated dashboard, enable RLS first.

### Engagement sync flow

`status.md` files are the source of truth. The sync action mirrors them into the DB.

- **Route:** `POST /api/engagements/sync` — `{ slug, markdown }`
- **Parser:** `src/lib/engagement-frontmatter.ts` — minimal YAML subset (key:value, key:[items], unquote, inline `# comment` strip). Body = everything after the closing `---`.
- **UI:** `SyncEngagementButton` on `/engagements/[slug]`. Paste markdown OR upload `.md` file. On success → `router.refresh()`.
- **Validation:** frontmatter `slug` (if present) must equal URL slug. `organization_name`, `stream`, `stage` required. Stage and stream values constrained to the enums above.
- **Tracked fields written from frontmatter:** `organization_name`, `stream`, `stage`, `primary_contact_name`, `primary_contact_email`, `primary_contact_role`, `region`, `owner`, `source`, `expected_value_cents`, `expected_close_date`, `last_interaction_at`, `proposals`. Body → `notes_markdown`. `last_synced_at` set to `now()`.
- **Frontmatter-only:** `next_steps` and `folder_path` are NOT overwritten by the sync — manage them outside the file (or via a separate edit action later).

### Out-of-Scope Tables
- `affiliates` — Managed by partner-hub
- `affiliate_resources` — Managed by partner-hub

## Funnel Rank System

| Status | Rank |
|--------|------|
| lead | 0 |
| registered | 1 |
| attended | 2 |
| applied (application_rejected) | 3 |
| invited_to_interview (not_invited, interview_deferred) | 4 |
| booked | 5 |
| interviewed (no_show, interview_rejected) | 6 |
| invited_to_enrol (offer_expired, requested_discount, deferred_next_cohort) | 7 |
| enrolled | 8 |

Canonical source: `kith_climate.funnel_rank(status text)` Postgres function. The TS mirror lives in `src/lib/supabase.ts` (`FUNNEL_RANK`) — keep the two in sync when adding a status.

## Key Patterns

- `fetchAll<T>()` — Paginated fetch (PAGE_SIZE=500) to bypass Supabase 1000-row limit
- `getSecret()` / `getSecrets()` — Read API keys from process.env
- Lazy Supabase singleton via `getSupabase()` for Cloudflare Workers compatibility
- Multi-account Fathom support (Ben + Diego API keys)

## Secrets

- **Supabase Edge Function Secrets**: FATHOM_API_KEY, FATHOM_API_KEY_DIEGO, FATHOM_WEBHOOK_SECRET, FATHOM_WEBHOOK_SECRET_DIEGO, STRIPE_WEBHOOK_SECRET, STRIPE_KITH_SECRET_KEY, CALENDLY_API_TOKEN
- **Cloudflare Workers env vars**: FATHOM_API_KEY, FATHOM_API_KEY_DIEGO, SUPABASE_URL, SUPABASE_ANON_KEY, Auth0 config

## Conversion & Attribution System

The dashboard homepage is a goal-driven status view with dynamic enrollment projections, per-person weighted conversion rates, and a recommendations engine. See `_reference/conversion-attribution-system.md` for full methodology, segment rates, attribution findings, and update procedures.

Key files: `src/lib/conversion-rates.ts` (rates + projections), `src/lib/recommendations.ts` (action items), `src/app/page.tsx` (dashboard).

When a cohort completes: update `REFERENCE_COHORTS`, refresh `SEGMENT_RATES`, and update `TARGET_COHORT` / `ENROLLMENT_GOAL` / `COHORT_START_DATE` in `page.tsx`.

## Deployment

- Dashboard deployed automatically via GitHub Actions on push to `main`
- Supabase edge functions must be deployed manually: `supabase functions deploy <function-name>`
- **CRITICAL: `verify_jwt` settings are defined in `supabase/config.toml`.** External webhook functions (Stripe, Calendly, Fathom) MUST have `verify_jwt = false` — their callers do not send JWTs. When deploying via MCP (`deploy_edge_function`), always check `config.toml` for the correct `verify_jwt` value. Never default to `true` for webhook functions.
