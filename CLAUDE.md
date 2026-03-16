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
- `fathom-webhook` — Fathom `new_meeting_content_ready` events → upsert interviews, advance funnel
- `calendly-webhook` — Calendly `invitee.created`/`invitee.canceled` → manage bookings and funnel
- `stripe-kith-climate-webhook` — Stripe `checkout.session.completed`/`charge.refunded` → manage payments
- `kith-climate-email-automation` — DB trigger for funnel changes → queue/send automated emails
- `kith-climate-send-email` — Send emails via Resend, record in emails table
- `kith-climate-pending-email-review` — Approve/reject pending emails (called from dashboard via proxy)

### Architecture Principles
- **Database mutations on RLS-protected tables must go through Supabase Edge Functions**, not Cloudflare Workers API routes. Dashboard uses anon key (subject to RLS); edge functions use service role key (bypasses RLS).
- **Next.js API routes should be thin proxies** for operations requiring service role key. Pattern: fetch to `${SUPABASE_URL}/functions/v1/<function-name>` with anon key auth. See `trigger-sync/route.ts` for reference.
- **Never add SUPABASE_SERVICE_ROLE_KEY to Cloudflare Workers.** Create or extend a Supabase edge function instead.

## Data Model

### customers (Central Hub)
Single source of truth for all leads/customers. Key fields:
- `funnel_status` — registered → applied → invited_to_interview → booked → interviewed → invited_to_enrol → enrolled (plus: application_rejected, interview_rejected, no_show, offer_expired, not_invited)
- `enrichment_status` — pending → enriching → enriched → failed → skipped
- `lead_type` — professional, pivoter, unknown
- Funnel advancement uses rank system (registered=1 → enrolled=7) that prevents backsliding

### workshop_registrations
Links customers to workshop events. One customer can have multiple registrations. Fields: customer_id, event_name, event_date, registration_date, attended, source_api_id.

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

### Out-of-Scope Tables
- `affiliates` — Managed by partner-hub
- `affiliate_resources` — Managed by partner-hub

## Funnel Rank System

| Status | Rank |
|--------|------|
| registered | 1 |
| applied (application_rejected) | 2 |
| invited_to_interview | 3 |
| booked | 4 |
| interviewed (no_show, interview_rejected) | 5 |
| invited_to_enrol (offer_expired) | 6 |
| enrolled | 7 |

## Key Patterns

- `fetchAll<T>()` — Paginated fetch (PAGE_SIZE=500) to bypass Supabase 1000-row limit
- `getSecret()` / `getSecrets()` — Read API keys from process.env
- Lazy Supabase singleton via `getSupabase()` for Cloudflare Workers compatibility
- Multi-account Fathom support (Ben + Diego API keys)

## Secrets

- **Supabase Edge Function Secrets**: FATHOM_API_KEY, FATHOM_API_KEY_DIEGO, FATHOM_WEBHOOK_SECRET, FATHOM_WEBHOOK_SECRET_DIEGO, STRIPE_WEBHOOK_SECRET, STRIPE_KITH_SECRET_KEY, CALENDLY_API_TOKEN
- **Cloudflare Workers env vars**: FATHOM_API_KEY, FATHOM_API_KEY_DIEGO, SUPABASE_URL, SUPABASE_ANON_KEY, Auth0 config

## Deployment

- Dashboard deployed automatically via GitHub Actions on push to `main`
- Supabase edge functions must be deployed manually: `supabase functions deploy <function-name>`
