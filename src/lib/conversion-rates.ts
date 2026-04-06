import { getSupabase } from './supabase'

/**
 * Conversion rate engine for the Kith Climate enrollment funnel.
 *
 * Computes stage-by-stage rates from historical cohorts (Jan + March),
 * weights by lead type (professional/pivoter) and source (workshop/direct),
 * and projects enrollment from the current pipeline with per-person weighting.
 *
 * The funnel starts at "applied" — pipeline_to_applied is omitted because
 * by the time a cohort completes, 100% of pipeline members have a post-registered
 * status, making the rate uninformative.
 */

// ---- Types ----

export type StageRates = {
  applied_to_booked: number
  booked_to_interviewed: number
  interviewed_to_invited: number
  invited_to_enrolled: number
  overall_applied_to_enrolled: number
}

export type LeadQuality = {
  professional: { count: number; rate: number }
  pivoter: { count: number; rate: number }
  unknown: { count: number; rate: number }
  workshop_attendee: { count: number; rate: number }
  direct: { count: number; rate: number }
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
    invited_to_enrol: number
    enrollments: number
  }
  total_applications_needed: number
}

// ---- Constants ----

// March only — January had an informal process (no structured applications/interviews)
// and its rates distort the model. March is representative of the current process.
const REFERENCE_COHORTS = ['March 16th 2026']

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
 * Compute stage-by-stage conversion rates from reference cohorts.
 *
 * Starts at "applied" since pipeline→applied is always ~100% in completed cohorts.
 * Rates are computed by summing numerators/denominators across all reference cohorts.
 */
async function computeStageRates(
  customers: { cohort_statuses: Record<string, { status: string }> }[]
): Promise<StageRates> {
  if (customers.length === 0) return defaultRates()

  // Aggregate counts across all reference cohorts
  const totals: Record<string, number> = {}
  for (const [stage] of Object.entries(STAGE_REACHED)) {
    totals[stage] = 0
  }

  for (const cohort of REFERENCE_COHORTS) {
    for (const [stage, statuses] of Object.entries(STAGE_REACHED)) {
      for (const c of customers) {
        const entry = c.cohort_statuses?.[cohort]
        if (!entry) continue
        if (statuses.includes(entry.status)) totals[stage]++
      }
    }
  }

  function rate(numerator: number, denominator: number): number {
    return denominator > 0 ? numerator / denominator : 0
  }

  const rates: StageRates = {
    applied_to_booked: rate(totals.booked, totals.applied),
    booked_to_interviewed: rate(totals.interviewed, totals.booked),
    interviewed_to_invited: rate(totals.invited_to_enrol, totals.interviewed),
    invited_to_enrolled: rate(totals.enrolled, totals.invited_to_enrol),
    overall_applied_to_enrolled: 0,
  }

  rates.overall_applied_to_enrolled =
    rates.applied_to_booked *
    rates.booked_to_interviewed *
    rates.interviewed_to_invited *
    rates.invited_to_enrolled

  return rates
}

/**
 * Compute per-person enrollment probability based on their lead type and source.
 */
function enrollmentProbability(
  leadType: string | null,
  attendedWorkshop: boolean,
  overallRate: number
): number {
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

    // Base probability from their current stage
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
      // Applied or earlier — full funnel conversion
      stageRate = rates.overall_applied_to_enrolled
    }

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

  const { data: allCustomers } = await supabase
    .from('customers')
    .select('id, lead_type, cohort_statuses')
    .not('cohort_statuses', 'is', null)

  const customers = allCustomers ?? []
  const rates = await computeStageRates(customers as { cohort_statuses: Record<string, { status: string }> }[])

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

    for (const [stage, statuses] of Object.entries(STAGE_REACHED)) {
      if (statuses.includes(status)) {
        current[stage as keyof typeof current]++
      }
    }

    if (leadType === 'professional') professionals++
    else if (leadType === 'pivoter') pivoters++
    else unknowns++

    if (attended) workshopAttendees++
    else directApplicants++
  }

  const projected_enrolled = projectWeightedEnrollment(pipeline, rates)

  const blended_rate = current.total > 0 ? projected_enrolled / current.total : rates.overall_applied_to_enrolled

  const quality: LeadQuality = {
    professional: { count: professionals, rate: SEGMENT_RATES.professional },
    pivoter: { count: pivoters, rate: SEGMENT_RATES.pivoter },
    unknown: { count: unknowns, rate: SEGMENT_RATES.unknown },
    workshop_attendee: { count: workshopAttendees, rate: SEGMENT_RATES.workshop_attendee },
    direct: { count: directApplicants, rate: SEGMENT_RATES.direct_applicant },
    blended_rate,
  }

  const gap = Math.max(0, enrollmentGoal - projected_enrolled)

  const now = new Date()
  const weeks_remaining = Math.max(1, Math.ceil(
    (cohortStartDate.getTime() - now.getTime()) / (7 * 86400000)
  ))

  // Applications needed to fill the gap
  const app_to_enrolled = rates.overall_applied_to_enrolled

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
    invited_to_enrol: Math.ceil(
      enrollmentGoal / rates.invited_to_enrolled
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
    applied_to_booked: 0.78,
    booked_to_interviewed: 0.82,
    interviewed_to_invited: 0.89,
    invited_to_enrolled: 0.45,
    overall_applied_to_enrolled: 0.24,
  }
}
