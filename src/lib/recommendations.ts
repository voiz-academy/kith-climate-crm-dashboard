import { getSupabase } from './supabase'

/**
 * Generates dynamic, data-driven recommendations for hitting the enrollment goal.
 *
 * Each recommendation has:
 * - A priority (high/medium/low) based on expected impact
 * - A label and description
 * - A supporting metric from the data
 */

export type Recommendation = {
  priority: 'high' | 'medium' | 'low'
  label: string
  detail: string
  metric: string
}

type RecommendationInput = {
  targetCohort: string
  enrollmentGoal: number
  currentEnrolled: number
  currentInvitedToEnrol: number
  currentInterviewed: number
  currentTotal: number
  workshopAttendeesInPipeline: number
  weeksRemaining: number
  gap: number
  weeklyAppTarget: number
  appsThisWeek: number
}

export async function generateRecommendations(input: RecommendationInput): Promise<Recommendation[]> {
  const supabase = getSupabase()
  const recs: Recommendation[] = []

  // 1. Untapped workshop attendees (warm leads not in any cohort)
  const { count: untappedCount } = await supabase
    .from('workshop_registrations')
    .select('customer_id', { count: 'exact', head: true })
    .eq('attended', true)
    .not('customer_id', 'in', `(${
      // Subquery not available via JS client, so we fetch separately
      ''
    })`)

  // Fetch attended customers not in May cohort and not enrolled
  const { data: attendedCustomers } = await supabase
    .from('customers')
    .select('id, funnel_status, cohort_statuses')

  const allCustomers = attendedCustomers ?? []

  const { data: attendedRegs } = await supabase
    .from('workshop_registrations')
    .select('customer_id')
    .eq('attended', true)

  const attendedIds = new Set((attendedRegs ?? []).map((r: { customer_id: string }) => r.customer_id))

  const untappedWarm = allCustomers.filter(c => {
    if (!attendedIds.has(c.id)) return false
    if (c.funnel_status === 'enrolled') return false
    const cohortStatuses = c.cohort_statuses as Record<string, { status: string }> | null
    if (cohortStatuses?.[input.targetCohort]) return false
    return true
  }).length

  if (untappedWarm > 20) {
    recs.push({
      priority: 'high',
      label: 'Re-engage past workshop attendees',
      detail: `${untappedWarm} people attended a past workshop but aren't in the ${input.targetCohort} pipeline. Workshop attendees convert at 48% vs 21% for direct applicants. A targeted email campaign to this group is your highest-ROI action.`,
      metric: `${untappedWarm} warm leads available`,
    })
  }

  // 2. Upcoming events — are registrations strong enough?
  const today = new Date().toISOString().slice(0, 10)
  const { data: upcomingRegs } = await supabase
    .from('workshop_registrations')
    .select('event_date')
    .gte('event_date', today)

  const upcomingTotal = upcomingRegs?.length ?? 0

  if (upcomingTotal < 200 && input.gap > 10) {
    recs.push({
      priority: 'high',
      label: 'Boost event registrations',
      detail: `Only ${upcomingTotal} registrations for upcoming events. The Feb 5 workshop (967 registrations → 337 attended) was the primary driver of 28 March enrollments. Events are the #1 source of enrollees — 19 of 28 March enrolled touched a workshop.`,
      metric: `${upcomingTotal} registered vs 967 benchmark`,
    })
  } else if (upcomingTotal >= 200) {
    recs.push({
      priority: 'medium',
      label: 'Maximize event conversion',
      detail: `${upcomingTotal} registrations for upcoming events. Focus on show rate (historical: 35%) and on-the-spot applications. 9 of 28 March enrollees applied the same day as a workshop.`,
      metric: `${upcomingTotal} registered`,
    })
  }

  // 3. Invited-to-enrol conversion — people stuck at the offer stage
  if (input.currentInvitedToEnrol > 5) {
    recs.push({
      priority: 'high',
      label: 'Convert invited-to-enrol candidates',
      detail: `${input.currentInvitedToEnrol} people are invited to enrol but haven't paid. Historical conversion from this stage is ~45%. Personal follow-up, deadline reminders, or addressing objections could lift this.`,
      metric: `${input.currentInvitedToEnrol} awaiting enrollment`,
    })
  }

  // 4. Application pace
  if (input.appsThisWeek < input.weeklyAppTarget && input.gap > 5) {
    const deficit = input.weeklyAppTarget - input.appsThisWeek
    recs.push({
      priority: 'medium',
      label: 'Accelerate pipeline entries',
      detail: `${input.appsThisWeek} pipeline entries this week vs target of ${input.weeklyAppTarget}. ${deficit} behind pace. Pipeline entries come from: formal applications, workshop direct-invites, and re-engagement of previous cohort candidates. Top drivers: workshop attendance, LinkedIn outreach, and email campaigns to registered leads.`,
      metric: `${deficit} behind weekly target`,
    })
  }

  // 5. Pipeline quality — low workshop attendees
  if (input.workshopAttendeesInPipeline < 5 && input.currentTotal > 10) {
    const pct = Math.round((input.workshopAttendeesInPipeline / input.currentTotal) * 100)
    recs.push({
      priority: 'medium',
      label: 'Pipeline quality: low workshop representation',
      detail: `Only ${input.workshopAttendeesInPipeline} of ${input.currentTotal} pipeline customers (${pct}%) attended a workshop. March cohort had 19/28 enrolled from workshops. The April 16 event is a key opportunity to add higher-converting leads.`,
      metric: `${pct}% workshop-sourced vs 68% in March`,
    })
  }

  // 6. Interviews backlog — people invited but not yet booked
  const invitedNotBooked = input.currentTotal - input.currentEnrolled - input.currentInvitedToEnrol
  const interviewedOrBeyond = input.currentInterviewed
  const stuckAtInvite = invitedNotBooked - interviewedOrBeyond
  if (stuckAtInvite > 5) {
    recs.push({
      priority: 'medium',
      label: 'Clear interview booking backlog',
      detail: `Multiple candidates are invited to interview but haven't booked yet. Sending Calendly links with a specific suggested time window tends to increase booking rates. Each interviewed candidate has a 92% chance of being invited to enrol.`,
      metric: `${stuckAtInvite} awaiting interview booking`,
    })
  }

  // 7. On track?
  if (input.gap <= 0) {
    recs.push({
      priority: 'low',
      label: 'Pipeline projects to meet goal',
      detail: `Current pipeline of ${input.currentTotal} is projected to yield ${input.enrollmentGoal}+ enrollments at historical conversion rates. Focus on moving people through stages rather than adding new pipeline.`,
      metric: 'On track',
    })
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 }
  recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  return recs
}
