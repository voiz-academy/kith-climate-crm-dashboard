# Multi-Cohort Funnel System

## Overview

The Kith Climate CRM funnel supports multiple concurrent cohorts. A customer can exist in multiple cohorts simultaneously — for example, deferred from March and re-applying for May. Each cohort tracks its own independent funnel position.

## Data Model

### `cohort_statuses` (JSONB on `customers`)

The per-cohort source of truth:

```json
{
  "March 16th 2026": {
    "status": "deferred_next_cohort",
    "updated_at": "2026-03-16T18:12:39.943Z"
  },
  "May 18th 2026": {
    "status": "invited_to_enrol",
    "updated_at": "2026-04-01T19:26:52.672Z"
  }
}
```

### `funnel_status` (text on `customers`)

Auto-calculated as the highest-ranked status across all cohort entries. Used for the "All Cohorts" view. Not directly writable — always derived by the `advance_funnel` RPC.

## The `advance_funnel` RPC

All funnel transitions go through `kith_climate.advance_funnel(p_customer_id, p_new_status, p_cohort)`:

- **With cohort**: Updates the specific cohort entry, recalculates global `funnel_status` as highest rank across all entries.
- **Without cohort (NULL)**: Legacy path — updates only `funnel_status`. Avoid this.

The RPC handles:
- Forward-only advancement (never backslides within a cohort)
- Lateral overrides for side statuses (application_rejected, no_show, offer_expired, etc.)
- Global recalculation from all cohort entries

## Cohort Assignment Rule

**Every function that assigns a cohort derives it from the customer's `cohort_statuses`** — picking the entry with the most recent `updated_at`. A hardcoded `DEFAULT_COHORT` is only a fallback for brand-new customers.

```typescript
function deriveCohort(cohortStatuses: Record<string, { status: string; updated_at: string }> | null): string {
  if (!cohortStatuses) return DEFAULT_COHORT;
  const entries = Object.entries(cohortStatuses);
  if (entries.length === 0) return DEFAULT_COHORT;
  let latestDate = "";
  let latestCohort = DEFAULT_COHORT;
  for (const [key, val] of entries) {
    if (val.updated_at > latestDate) {
      latestDate = val.updated_at;
      latestCohort = key;
    }
  }
  return latestCohort;
}
```

This pattern exists in every edge function that touches cohort data.

## Flow: How Each Action Updates Cohort

### Application submitted
```
Website form → cohort_applications row
  → trg_cohort_application_sync trigger
    → advance_funnel(customer, 'applied', cohort)
    → cohort_statuses[cohort] = 'applied'
```

### Dashboard action (invite, reject, defer, etc.)
```
User clicks action in CRM while viewing a specific cohort
  → FunnelCRM sends { customer_id, cohort: selectedCohort }
  → API route calls advance_funnel(customer, status, cohort)
  → cohort_statuses[cohort] updated
  → funnel_status recalculated
  → notify_email_on_funnel_change trigger fires
    → diffs OLD vs NEW cohort_statuses to find changed cohort
    → email automation receives cohort context
```

### Calendly booking
```
Calendly webhook → deriveCohort(customer.cohort_statuses)
  → interviews_booked row inserted with derived cohort
  → trg_interview_booked_sync trigger
    → advance_funnel(customer, 'booked', cohort)
```

### Fathom interview recording
```
Fathom webhook → deriveCohort(customer.cohort_statuses)
  → interview row inserted with derived cohort
  → trg_interview_sync trigger
    → advance_funnel(customer, 'interviewed', cohort)
```

### Stripe payment
```
Stripe webhook → determineCohort(customer.cohort_statuses)
  → payment row inserted with cohort
  → advance_funnel(customer, 'enrolled', cohort)
```

### Outlook email sync
```
outlook-daily-sync → detects interview/enrolment invite emails
  → deriveCohort(customer.cohort_statuses)
  → creates pending_funnel_changes with derived cohort
  → user approves in dashboard
  → approve route applies to the correct cohort entry
```

## Cohort-Filtered Dashboard Views

The `CohortSelector` component uses URL param `?cohort=May 18th 2026`.

When a specific cohort is selected:
1. Customers filtered to those with a `cohort_statuses` entry for that cohort
2. `funnel_status` overridden with cohort-specific status for display
3. Applications filtered by customer membership (not application cohort tag, which may be legacy)
4. All dashboard actions include the selected cohort in API calls

When "All Cohorts" is selected:
1. All customers shown
2. Global `funnel_status` used (highest across all cohorts)

## Email Template Personalization

Templates use `{cohort}` placeholder which resolves from the request's cohort parameter (not from the customer record, since customers can be in multiple cohorts). The DB trigger passes the correct cohort by diffing `cohort_statuses` changes.

## Adding a New Cohort

1. Add entry to `COHORT_OPTIONS` in `src/lib/supabase.ts` — all components import from here
2. Update default `??` fallback in `CohortSelector.tsx` and `funnel/page.tsx`
3. Update `DEFAULT_COHORT` / `CURRENT_COHORT` in all edge functions and redeploy:
   - `stripe-kith-climate-webhook`
   - `outlook-daily-sync`
   - `calendly-webhook`
   - `fathom-webhook`
   - `backfill-calendly`
   - `fathom-backfill`

## Multi-Cohort Customer Scenarios

### Deferred to next cohort
- March entry: `deferred_next_cohort`
- Customer applies to May → May entry: `applied`
- Both entries coexist, each tracked independently
- Global `funnel_status` = `deferred_next_cohort` (rank 6 > rank 2)

### Rejected then re-applies
- March entry: `interview_rejected`
- Customer applies to May → May entry: `applied`
- March rejection preserved, May tracked independently

### Enrolled in one, applied to another
- March entry: `enrolled`
- If they also applied to May → May entry: `applied`
- Global = `enrolled` (rank 7)

## Central Source of Truth for Cohort Options

```typescript
// src/lib/supabase.ts — THE canonical list
export const COHORT_OPTIONS = [
  { value: 'all', label: 'All Cohorts' },
  { value: 'May 18th 2026', label: 'May 18th 2026' },
  { value: 'March 16th 2026', label: 'March 16th 2026' },
] as const
```

Components that need cohort options without 'all' import and filter:
```typescript
import { COHORT_OPTIONS as ALL_COHORT_OPTIONS } from '@/lib/supabase'
const COHORT_OPTIONS = ALL_COHORT_OPTIONS.filter(o => o.value !== 'all')
```
