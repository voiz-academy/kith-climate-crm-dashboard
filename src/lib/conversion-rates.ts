import { getSupabase } from './supabase'

/**
 * Conversion rate engine for the Kith Climate enrollment funnel.
 *
 * Computes stage-by-stage rates from historical cohorts (Jan + March),
 * weights by lead type (professional/pivoter) and source (workshop/direct),
 * and projects enrollment from the current pipeline with per-person weighting.
 */

// ---- Types ----

export type StageRates = {
  pipeline_to_applied: number
  applied_to_booked: number
  booked_to_interviewed: number
  interviewed_to_invited: number
  invited_to_enrolled: number
  overall_pipeline_to_enrolled: number
}

export type LeadQuality = {
  professional: { count: number; rate: number }
  pivoter: { count: number; rate: number }
  unknown: { count: number; rate: number }
  workshop_attendee: { count: number; rate: number }
  direct: { count: number; rate: number }
  // Weighted projection from current pipeline composition
  blended_rate: number
}

export type CohortProjection = {
  rates: StageRates
  quality: LeadQuality
  current: {
    total: number
    applied: number
    invited_to_interview: number
    booked: number
    interviewed: number
    invited_to_enrol: number
    enrolled: number
  }
  projected_enrolled: number
  goal: number
  gap: number
  weeks_remaining: number
  weekly_targets: {
    applications: number
    interviews_booked: number
    interviews_conducted: number
    enrollments: number
  }
  total_applications_needed: number
}

// ---- Constants ----

const REFERENCE_COHORTS = ['January 19th 2026', 'March 16th 2026']

// Statuses that indicate someone reached at least this stage
const STAGE_REACHED: Record<string, string[]> = {
  applied: ['applied', 'application_rejected', 'invited_to_interview', 'booked', 'interviewed',
    'interview_rejected', 'invited_to_enrol', 'enrolled', 'no_show', 'offer_expired',
    'requested_discount', 'deferred_next_cohort', 'interview_deferred', 'not_invited'],
  invited_to_interview: ['invited_to_interview', 'booked', 'interviewed', 'interview_rejected',
    'invited_to_enrol', 'enrolled', 'no_show', 'offer_expired', 'requested_discount',
    'deferred_next_cohort', 'interview_deferred'],
  booked: ['booked', 'interviewed', 'interview_rejected', 'invited_to_enrol', 'enrolled',
    'no_show', 'offer_expired', 'requested_discount', 'deferred_next_cohort'],
  interviewed: ['interviewed', 'interview_rejected', 'invited_to_enrol', 'enrolled',
    'offer_expired', 'requested_discount', 'deferred_next_cohort'],
  invited_to_enrol: ['invited_to_enrol', 'enrolled', 'offer_expired', 'requested_discount',
    'deferred_next_cohort'],
  enrolled: ['enrolled'],
}

// Historical per-segment enrollment rates (from SQL analysis of Jan + March combined)
const SEGMENT_RATES = {
  professional: 0.288,
  pivoter: 0.223,
  unknown: 0.091,
  workshop_attendee: 0.476,
  direct_applicant: 0.207,
} as const

// ---- Pipeline customer type for weighted projection ----

type PipelineCustomer = {
  status: string
  lead_type: string | null
  attended_workshop: boolean
}

// ---- Core computation ----

/**
 * Compute stage-by-stage conversion rates from historical cohorts.
 * March weighted 2x over January.
 */
async function computeStageRates(
  customers: { cohort_statuses: Record<string, { status: string }> }[]
): Promise<StageRates> {
  if (customers.length === 0) return defaultRates()

  const cohortCounts: Record<string, Record<string, number>> = {}

  for (const cohort of REFERENCE_COHORTS) {
    const counts: Record<string, number> = { total: 0 }
    for (const [stage, statuses] of Object.entries(STAGE_REACHED)) {
      counts[stage] = 0
      for (const c of customers) {
        const entry = c.cohort_statuses?.[cohort]
        if (!entry) continue
        if (statuses.includes(entry.status)) counts[stage]++
      }
    }
    counts.total = customers.filter(c => c.cohort_statuses?.[cohort] != null).length
    cohortCounts[cohort] = counts
  }

  const jan = cohortCounts['January 19th 2026'] ?? {}
  const mar = cohortCounts['March 16th 2026'] ?? {}

  function w(jn: number, jd: number, mn: number, md: number): number {
    const num = jn + mn * 2
    const den = jd + md * 2
    return den > 0 ? num / den : 0
  }

  const rates: StageRates = {
    pipeline_to_applied: w(jan.applied ?? 0, jan.total ?? 0, mar.applied ?? 0, mar.total ?? 0),
    applied_to_booked: w(jan.booked ?? 0, jan.applied ?? 0, mar.booked ?? 0, mar.applied ?? 0),
    booked_to_interviewed: w(jan.interviewed ?? 0, jan.booked ?? 0, mar.interviewed ?? 0, mar.booked ?? 0),
    interviewed_to_invited: w(jan.invited_to_enrol ?? 0, jan.interviewed ?? 0, mar.invited_to_enrol ?? 0, mar.interviewed ?? 0),
    invited_to_enrolled: w(jan.enrolled ?? 0, jan.invited_to_enrol ?? 0, mar.enrolled ?? 0, mar.invited_to_enrol ?? 0),
    overall_pipeline_to_enrolled: 0,
  }

  rates.overall_pipeline_to_enrolled =
    rates.pipeline_to_applied *
    rates.applied_to_booked *
    rates.booked_to_interviewed *
    rates.interviewed_to_invited *
    rates.invited_to_enrolled

  return rates
}

/**
 * Compute per-person enrollment probability based on their lead type and source.
 *
 * Uses a simple multiplicative model:
 * - Base rate = overall pipeline-to-enrolled rate
 * - Lead type multiplier = segment rate / average rate
 * - Workshop multiplier = workshop rate / direct rate (if attended)
 *
 * Capped at 0.85 to avoid over-optimistic projections.
 */
function enrollmentProbability(
  leadType: string | null,
  attendedWorkshop: boolean,
  overallRate: number
): number {
  // Average rate across all segments (weighted by historical volume)
  const avgLeadRate = (SEGMENT_RATES.professional * 73 + SEGMENT_RATES.pivoter * 94 + SEGMENT_RATES.unknown * 12) / 179

  let typeMultiplier: number
  switch (leadType) {
    case 'professional': typeMultiplier = SEGMENT_RATES.professional / avgLeadRate; break
    case 'pivoter': typeMultiplier = SEGMENT_RATES.pivoter / avgLeadRate; break
    default: typeMultiplier = SEGMENT_RATES.unknown / avgLeadRate; break
  }

  const sourceMultiplier = attendedWorkshop
    ? SEGMENT_RATES.workshop_attendee / SEGMENT_RATES.direct_applicant
    : 1.0

  return Math.min(0.85, overallRate * typeMultiplier * sourceMultiplier)
}

/**
 * Project enrollment from the current pipeline with per-person weighting.
 *
 * Instead of applying a flat rate to each stage, we calculate each person's
 * probability of enrolling based on:
 * 1. How far they've progressed (later stages = higher base probability)
 * 2. Their lead type (professional > pivoter > unknown)
 * 3. Whether they attended a workshop (2.3x multiplier)
 */
function projectWeightedEnrollment(
  pipeline: PipelineCustomer[],
  rates: StageRates
): number {
  let projected = 0

  for (const person of pipeline) {
    const status = person.status
    if (status === 'enrolled') {
      projected += 1
      continue
    }

    // Base probability from their current stage (what % of people at this stage eventually enroll)
    let stageRate: number
    if (STAGE_REACHED.invited_to_enrol.includes(status)) {
      stageRate = rates.invited_to_enrolled
    } else if (STAGE_REACHED.interviewed.includes(status)) {
      stageRate = rates.interviewed_to_invited * rates.invited_to_enrolled
    } else if (STAGE_REACHED.booked.includes(status)) {
      stageRate = rates.booked_to_interviewed * rates.interviewed_to_invited * rates.invited_to_enrolled
    } else if (STAGE_REACHED.invited_to_interview.includes(status)) {
      stageRate = rates.applied_to_booked * rates.booked_to_interviewed * rates.interviewed_to_invited * rates.invited_to_enrolled
    } else {
      stageRate = rates.overall_pipeline_to_enrolled
    }

    // Apply per-person quality weighting
    const qualityAdjusted = enrollmentProbability(person.lead_type, person.attended_workshop, stageRate)
    projected += qualityAdjusted
  }

  return Math.round(projected)
}

// ---- Public API ----

export async function computeCohortProjection(
  targetCohort: string,
  enrollmentGoal: number,
  cohortStartDate: Date
): Promise<CohortProjection> {
  const supabase = getSupabase()

  // Fetch customers with enrichment data for quality scoring
  const { data: allCustomers } = await supabase
    .from('customers')
    .select('id, lead_type, cohort_statuses')
    .not('cohort_statuses', 'is', null)

  const customers = allCustomers ?? []
  const rates = await computeStageRates(customers as { cohort_statuses: Record<string, { status: string }> }[])

  // Get workshop attendance for pipeline customers
  const { data: workshopRegs } = await supabase
    .from('workshop_registrations')
    .select('customer_id')
    .eq('attended', true)

  const attendedSet = new Set((workshopRegs ?? []).map((r: { customer_id: string }) => r.customer_id))

  // Build pipeline for target cohort
  const pipeline: PipelineCustomer[] = []
  const current = {
    total: 0, applied: 0, invited_to_interview: 0,
    booked: 0, interviewed: 0, invited_to_enrol: 0, enrolled: 0,
  }

  // Quality counters
  let professionals = 0, pivoters = 0, unknowns = 0
  let workshopAttendees = 0, directApplicants = 0

  for (const c of customers) {
    const entry = (c.cohort_statuses as Record<string, { status: string }>)?.[targetCohort]
    if (!entry) continue

    const status = entry.status
    const leadType = (c as { lead_type: string | null }).lead_type
    const attended = attendedSet.has((c as { id: string }).id)

    current.total++
    pipeline.push({ status, lead_type: leadType, attended_workshop: attended })

    // Stage counts
    for (const [stage, statuses] of Object.entries(STAGE_REACHED)) {
      if (statuses.includes(status)) {
        current[stage as keyof typeof current]++
      }
    }

    // Quality counts
    if (leadType === 'professional') professionals++
    else if (leadType === 'pivoter') pivoters++
    else unknowns++

    if (attended) workshopAttendees++
    else directApplicants++
  }

  // Weighted projection
  const projected_enrolled = projectWeightedEnrollment(pipeline, rates)

  // Blended enrollment rate for the current pipeline mix
  const blended_rate = current.total > 0 ? projected_enrolled / current.total : rates.overall_pipeline_to_enrolled

  const quality: LeadQuality = {
    professional: { count: professionals, rate: SEGMENT_RATES.professional },
    pivoter: { count: pivoters, rate: SEGMENT_RATES.pivoter },
    unknown: { count: unknowns, rate: SEGMENT_RATES.unknown },
    workshop_attendee: { count: workshopAttendees, rate: SEGMENT_RATES.workshop_attendee },
    direct: { count: directApplicants, rate: SEGMENT_RATES.direct_applicant },
    blended_rate,
  }

  // Gap and targets
  const gap = Math.max(0, enrollmentGoal - projected_enrolled)

  const now = new Date()
  const weeks_remaining = Math.max(1, Math.ceil(
    (cohortStartDate.getTime() - now.getTime()) / (7 * 86400000)
  ))

  // Applications needed: gap ÷ blended conversion from application to enrolled
  // Use the blended rate (which accounts for pipeline quality) rather than flat rate
  const app_to_enrolled = rates.applied_to_booked * rates.booked_to_interviewed *
    rates.interviewed_to_invited * rates.invited_to_enrolled

  const total_applications_needed = app_to_enrolled > 0
    ? Math.ceil(gap / app_to_enrolled)
    : gap

  const weekly_targets = {
    applications: Math.ceil(total_applications_needed / weeks_remaining),
    interviews_booked: Math.ceil(
      (total_applications_needed * rates.applied_to_booked) / weeks_remaining
    ),
    interviews_conducted: Math.ceil(
      (total_applications_needed * rates.applied_to_booked * rates.booked_to_interviewed) / weeks_remaining
    ),
    enrollments: Math.ceil(gap / weeks_remaining),
  }

  return {
    rates, quality, current,
    projected_enrolled, goal: enrollmentGoal, gap, weeks_remaining,
    weekly_targets, total_applications_needed,
  }
}

function defaultRates(): StageRates {
  return {
    pipeline_to_applied: 0.95,
    applied_to_booked: 0.78,
    booked_to_interviewed: 0.82,
    interviewed_to_invited: 0.89,
    invited_to_enrolled: 0.45,
    overall_pipeline_to_enrolled: 0.24,
  }
}
