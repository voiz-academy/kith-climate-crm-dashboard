# Conversion & Attribution System

The dashboard homepage (`src/app/page.tsx`) displays a goal-driven system status view that projects enrollment outcomes, calculates dynamic weekly targets, and generates recommendations. This document explains the methodology, data sources, and when to update.

## Architecture

Three modules power the system:

| File | Purpose |
|------|---------|
| `src/lib/conversion-rates.ts` | Computes stage-by-stage conversion rates from historical cohorts, projects enrollment with per-person weighting |
| `src/lib/recommendations.ts` | Generates prioritized recommendations from live pipeline data |
| `src/app/page.tsx` | Assembles everything into the dashboard view |

## Conversion Rate Methodology

### Stage-by-stage rates

Rates are computed dynamically on each page load from the **January 19th 2026** and **March 16th 2026** cohort data. March is weighted 2x because the enrollment process was more mature by then (formal applications, structured interviews, Calendly integration).

The stages and what "reached this stage" means:

| Stage | Statuses that count as "reached" |
|-------|----------------------------------|
| Applied | applied, application_rejected, invited_to_interview, booked, interviewed, ... |
| Booked | booked, interviewed, invited_to_enrol, enrolled, ... |
| Interviewed | interviewed, interview_rejected, invited_to_enrol, enrolled, ... |
| Invited to enrol | invited_to_enrol, enrolled, offer_expired, deferred_next_cohort, ... |
| Enrolled | enrolled |

Each rate = (people who reached stage N+1) / (people who reached stage N), using the weighted average formula: `(jan_count + march_count * 2) / (jan_denominator + march_denominator * 2)`.

### Rates as of April 2026 (from real data)

| Transition | Jan | March | Weighted |
|-----------|-----|-------|----------|
| Pipeline → Applied | 93% | 96% | ~95% |
| Applied → Booked | 100% | 72% | ~78% |
| Booked → Interviewed | 79% | 84% | ~82% |
| Interviewed → Invited to enrol | 100% | 86% | ~89% |
| Invited to enrol → Enrolled | 29% | 52% | ~45% |
| **Overall pipeline → Enrolled** | **21%** | **26%** | **~24%** |

The biggest drop-off is **invited to enrol → enrolled** (payment stage). This is the primary conversion bottleneck.

## Segment-Based Weighting

### Historical segment rates (from Jan + March combined)

These are baked into `conversion-rates.ts` as `SEGMENT_RATES`:

| Segment | Pipeline | Enrolled | Rate | Source |
|---------|----------|----------|------|--------|
| Professional | 73 | 21 | 28.8% | SQL analysis of lead_type across Jan + March cohorts |
| Pivoter | 94 | 21 | 22.3% | Same |
| Unknown | 12 | 1 | 9.1% | Same |
| Workshop attendee | 21 | 10 | 47.6% | Customers who attended any workshop (attended=true) |
| Direct applicant | 87 | 18 | 20.7% | Customers who never attended a workshop |

### Per-person enrollment probability

Instead of applying a flat rate to everyone at a given stage, each person gets an individual probability:

```
probability = stage_base_rate × lead_type_multiplier × source_multiplier
```

- **stage_base_rate**: Conversion from their current stage to enrolled (e.g., invited_to_enrol → enrolled = 45%)
- **lead_type_multiplier**: Their segment rate / average segment rate (professional = 1.2x, pivoter = 0.9x, unknown = 0.4x)
- **source_multiplier**: 2.3x if they attended a workshop, 1.0x otherwise

Capped at 85% to prevent over-optimistic projections.

### When to update segment rates

Update `SEGMENT_RATES` in `src/lib/conversion-rates.ts` after each cohort completes enrollment. Run this SQL to get fresh numbers:

```sql
WITH cohort_data AS (
  SELECT c.lead_type, key as cohort, (value->>'status') as status
  FROM kith_climate.customers c, jsonb_each(c.cohort_statuses)
  WHERE key IN ('January 19th 2026', 'March 16th 2026', 'May 18th 2026')
)
SELECT lead_type,
  count(*) as total,
  count(*) FILTER (WHERE status = 'enrolled') as enrolled,
  round(count(*) FILTER (WHERE status = 'enrolled') * 100.0 / NULLIF(count(*), 0), 1) as rate
FROM cohort_data
GROUP BY lead_type ORDER BY enrolled DESC;
```

Also update `REFERENCE_COHORTS` in the same file to include the newly completed cohort.

## Attribution Findings (as of April 2026)

### How March enrollees entered the funnel

| Path | Count (of 28) | Pattern |
|------|--------------|---------|
| Workshop first → applied later | 7 | Registered, attended, came back days/weeks later to apply |
| Applied at workshop (same day) | 9 | Applied during/immediately after the event |
| Direct application (no workshop) | 8 | Never touched a workshop |
| Workshop only (no formal application) | 3 | Went straight from workshop → interview → enrolled |

**19 of 28 enrolled (68%) touched a workshop.** The dominant path is events → applications, not the reverse.

### Untapped warm leads

As of April 2026: **514 people** attended a past workshop but are not in any cohort pipeline. These convert at 48% historically (vs 21% for cold leads). Re-engaging this group is the highest-ROI action available.

## Recommendations Engine

`src/lib/recommendations.ts` generates prioritized recommendations based on these triggers:

| Trigger | Priority | Threshold |
|---------|----------|-----------|
| Untapped workshop attendees | High | >20 warm leads not in target cohort |
| Event registrations low | High | <200 total upcoming registrations AND gap >10 |
| Invited-to-enrol backlog | High | >5 people stuck at offer stage |
| Applications behind pace | Medium | This week's apps < weekly target AND gap >5 |
| Low workshop representation | Medium | <5 workshop attendees in pipeline AND pipeline >10 |
| Interview booking backlog | Medium | >5 people invited but not booked |
| Pipeline on track | Low | Gap <= 0 |

Recommendations are generated fresh on each page load from live data. They sort by priority (high → medium → low).

## Dashboard Sections (top to bottom)

1. **Enrollment Goal** — progress bars, 7-stage waterfall, projected outcome, gap analysis
2. **Conversion Rates** — visual rate bars from historical data
3. **Weekly Targets** — dynamic targets with on-track/behind indicators
4. **Lead Quality** — pipeline composition by lead type and source
5. **Recommendations** — prioritized action items from live data
6. **Weekly Activity Cards** — traffic (trend only), applications, bookings, interviews, enrollments, emails
7. **Upcoming Events + System Health** — event registrations, 24h API health

## Adding a New Cohort (dashboard-specific)

In addition to the locations listed in CLAUDE.md, update these for the dashboard:

| Location | What to change |
|----------|---------------|
| `src/app/page.tsx` | Update `TARGET_COHORT`, `ENROLLMENT_GOAL`, `COHORT_START_DATE` |
| `src/app/community/page.tsx` | Update `CURRENT_COHORT` |
| `src/lib/conversion-rates.ts` | Add completed cohort to `REFERENCE_COHORTS`, update `SEGMENT_RATES` with fresh data |

## Key Design Decisions

- **Website traffic has no target.** It's a lagging context metric, not a leading indicator. Many enrollees never showed up in page_views — they came from workshops or direct referrals. The funnel starts at applications.
- **March weighted 2x over January.** The January process was informal (no structured applications). March had formal applications, Calendly bookings, and Fathom-recorded interviews. March data is more representative of the current process.
- **Projections are conservative.** Per-person probabilities are capped at 85%. The model doesn't account for people who might enter the pipeline in the future — it only projects from existing pipeline members.
- **Segment rates are static constants, stage rates are dynamic.** Segment rates (professional/pivoter/workshop) need manual refresh after each cohort. Stage-by-stage rates recompute on every load from the database. This is intentional — segment rates need more data to be meaningful, while stage rates can safely recalculate from whatever cohorts are configured.
