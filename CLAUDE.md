# CLAUDE.md — Project Reference for kith-climate-crm-dashboard

## Project Overview
- Next.js App Router dashboard for Kith Climate CRM
- Dashboard deployed on Cloudflare Workers
- Webhooks handled by Supabase Edge Functions (fathom-webhook, calendly-webhook, stripe-kith-climate-webhook)
- Supabase backend on project `tfcuozmbnnswencikncv` ("AI Context"), schema `kith_climate`
- Auth via Auth0
- LinkedIn enrichment via Apify

## Architecture
The system has two runtime environments:

### Next.js Dashboard (Cloudflare Workers)
- Serves the CRM dashboard UI
- Provides `/api/fathom/backfill` for manual Fathom meeting import
- Provides `/api/outlook/sync`, `/api/leads`, `/api/enrichment/status`, `/api/emails`
- Accesses Fathom API keys via `process.env` (configured in Cloudflare)

### Supabase Edge Functions (Deno)
- `fathom-webhook` — Receives Fathom `new_meeting_content_ready` events, upserts interviews, advances funnel
- `calendly-webhook` — Receives Calendly `invitee.created`/`invitee.canceled` events, manages bookings and funnel
- `stripe-kith-climate-webhook` — Receives Stripe `checkout.session.completed`/`charge.refunded` events, manages payments and funnel
- All secrets accessed via `Deno.env.get()` from Supabase Edge Function Secrets

### Secrets
- **Supabase Edge Function Secrets** (primary): FATHOM_API_KEY, FATHOM_API_KEY_DIEGO, FATHOM_WEBHOOK_SECRET, FATHOM_WEBHOOK_SECRET_DIEGO, STRIPE_WEBHOOK_SECRET, STRIPE_KITH_SECRET_KEY, CALENDLY_API_TOKEN
- **Cloudflare Workers env vars** (dashboard only): FATHOM_API_KEY, FATHOM_API_KEY_DIEGO, SUPABASE_URL, SUPABASE_ANON_KEY, Auth0 config

## Out-of-Scope Tables
These tables exist but are NOT managed by this dashboard:
- `affiliates` — Affiliate partner tracking. Managed separately.
- `affiliate_resources` — Resources shared with affiliates. Managed separately.

## In-Scope Tables

### customers (Central Hub)
The single source of truth for all leads/customers. Every person enters as a workshop registrant and gets a customer record. Key fields:
- `funnel_status` — Tracks progression: registered -> applied -> invited_to_interview -> booked -> interviewed -> invited_to_enrol -> enrolled (plus side statuses: application_rejected, interview_rejected, no_show, offer_expired, not_invited)
- `enrichment_status` — LinkedIn enrichment pipeline: pending -> enriching -> enriched -> failed -> skipped
- `lead_type` — Classification: professional, pivoter, unknown
- Funnel advancement uses a rank system (registered=1 through enrolled=7) that prevents backsliding

### workshop_registrations
Links customers to workshop events. One customer can have multiple registrations (different events). Fields: customer_id, event_name, event_date, registration_date, attended, source_api_id.

### cohort_applications
Formal applications for the Kith Climate cohort program. Contains application responses (role, background, ai_view, goals, budget_confirmed), UTM tracking, and links to customer via customer_id. Status field tracks application review.

### interviews_booked
Calendly booking records. Created when a customer books an interview via Calendly. Key fields:
- calendly_event_uri, calendly_invitee_uri — Calendly identifiers for deduplication
- scheduled_at — When the interview is scheduled
- cancelled_at, cancel_reason — Populated if booking is cancelled
- interviewee_name, interviewee_email — Booking contact info
- interviewer_name, interviewer_email — Who's interviewing
- When a booking is created, the customer should advance to `booked`
- When a booking is cancelled, the customer should revert to `invited_to_interview`

### interviews
Interview recordings and outcomes from Fathom.ai. Created/updated via Fathom webhook when recordings are processed. Key fields:
- fathom_recording_id — Unique key for deduplication
- fathom_recording_url, fathom_summary, transcript — Recording data
- outcome — approved, rejected, waitlisted, pending
- interviewer, activity_type, applicant_scoring
- When interview is conducted, the customer advances to `interviewed`
- When outcome is set, the customer advances to `invited_to_enrol` (approved) or `interview_rejected` (rejected)

### payments
Stripe payment records. Key fields:
- stripe_payment_intent_id, stripe_checkout_session_id, stripe_customer_id — Stripe identifiers
- amount_cents, currency, status (pending/succeeded/failed/refunded)
- product, cohort — What was purchased
- paid_at, refunded_at — Timestamps
- enrollee_customer_id — The actual customer being enrolled (may differ from payer)
- When payment succeeds, the customer advances to `enrolled`

### emails
Email communication log between Kith team and customers. Key fields:
- customer_id — Links to customer
- direction — inbound or outbound
- from_address, to_addresses[], cc_addresses[] — Routing
- subject, body_preview — Content
- email_type — Classification: invite_to_interview, enrolment_confirmation, general, etc.
- message_id, conversation_id — Outlook identifiers for deduplication
- Currently populated via batch sync but NOT displayed in the dashboard

### page_views
Website traffic tracking from kithclimate.com. Key fields:
- page_path, page_title — What page was viewed
- referrer — Where the visitor came from
- user_agent — Browser info
- utm_source, utm_medium, utm_campaign — Campaign tracking
- created_at — When the view occurred
- Actively receiving data (~4,800+ rows) but NOT displayed in the dashboard

## API Endpoints (Next.js)
- `POST /api/outlook/sync` — Receives pre-fetched email data, advances funnel statuses for interview/enrollment invites
- `POST /api/fathom/backfill` — Backfills all Fathom meetings from all accounts (uses Fathom API keys)
- `GET /api/enrichment/status` — Returns enrichment status counts
- `GET /api/leads` — Returns enriched customers with workshop attendance

## Webhook Endpoints (Supabase Edge Functions)
- `fathom-webhook` — Receives Fathom recording events, upserts interviews
- `calendly-webhook` — Receives Calendly booking/cancellation events
- `stripe-kith-climate-webhook` — Receives Stripe payment/refund events

## Funnel Rank System
The funnel uses a numeric rank to prevent backsliding:
- registered: 1
- applied: 2 (application_rejected: 2)
- invited_to_interview: 3
- booked: 4
- interviewed: 5 (no_show: 5, interview_rejected: 5)
- invited_to_enrol: 6 (offer_expired: 6)
- enrolled: 7

## Key Patterns
- `fetchAll<T>()` — Paginated fetch (PAGE_SIZE=500) to bypass Supabase 1000-row limit
- `getSecret()` / `getSecrets()` — Read API keys from process.env
- Lazy Supabase singleton via `getSupabase()` for Cloudflare Workers compatibility
- Multi-account Fathom support (Ben + Diego API keys)
