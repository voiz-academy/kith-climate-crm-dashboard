import {
  getSupabase, fetchAll, Email,
  CohortApplication, InterviewBooking, Interview, Payment,
  type SystemLog
} from '@/lib/supabase'
import { computeCohortProjection } from '@/lib/conversion-rates'
import { generateRecommendations } from '@/lib/recommendations'
import { Header } from '@/components/Header'

export const dynamic = 'force-dynamic'

const TARGET_COHORT = 'May 18th 2026'
const ENROLLMENT_GOAL = 30
const COHORT_START_DATE = new Date('2026-05-18')

// ---- helpers ----

function daysAgo(d: Date, n: number): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  c.setDate(c.getDate() - n)
  return c
}

function inRange(dateStr: string | null | undefined, from: Date, to: Date): boolean {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return d >= from && d < to
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null
  if (previous === 0) return 100
  return Math.round(((current - previous) / previous) * 100)
}

function weeklyAvg(count: number, weeks: number): number {
  return weeks > 0 ? Math.round((count / weeks) * 10) / 10 : 0
}

// ---- data fetching ----

async function getDashboardData() {
  const supabase = getSupabase()
  const now = new Date()
  // Rolling 7-day windows (not calendar weeks) so data is always meaningful
  const thisWeekStart = daysAgo(now, 7)   // last 7 days
  const lastWeekStart = daysAgo(now, 14)  // 7-14 days ago
  const fourWeeksAgo = daysAgo(now, 35)   // 7-35 days ago (4 weeks before "this week")

  // Fetch all data in parallel
  const [applications, interviews, bookings, payments, emails, projection] = await Promise.all([
    fetchAll<CohortApplication>('cohort_applications'),
    fetchAll<Interview>('interviews'),
    fetchAll<InterviewBooking>('interviews_booked'),
    fetchAll<Payment>('payments'),
    fetchAll<Email>('emails'),
    computeCohortProjection(TARGET_COHORT, ENROLLMENT_GOAL, COHORT_START_DATE),
  ])

  // Page views — last 5 weeks only (efficient)
  const fiveWeeksAgo = new Date(thisWeekStart)
  fiveWeeksAgo.setDate(fiveWeeksAgo.getDate() - 35)

  const { data: pvRaw } = await supabase
    .from('page_views')
    .select('created_at')
    .gte('created_at', fiveWeeksAgo.toISOString())
    .order('created_at', { ascending: true })
    .limit(5000)

  const pageViews = (pvRaw ?? []) as { created_at: string }[]

  // System logs — last 24h
  const oneDayAgo = new Date(now)
  oneDayAgo.setDate(oneDayAgo.getDate() - 1)
  const { data: logsRaw } = await supabase
    .from('system_logs')
    .select('status, function_name, invoked_at')
    .gte('invoked_at', oneDayAgo.toISOString())
    .order('invoked_at', { ascending: false })
    .limit(500)

  const logs = (logsRaw ?? []) as Pick<SystemLog, 'status' | 'function_name' | 'invoked_at'>[]

  // ---- Traffic ----
  const trafficThisWeek = pageViews.filter(pv => inRange(pv.created_at, thisWeekStart, now)).length
  const trafficLastWeek = pageViews.filter(pv => inRange(pv.created_at, lastWeekStart, thisWeekStart)).length
  const trafficMonthly = pageViews.filter(pv => inRange(pv.created_at, fourWeeksAgo, thisWeekStart)).length
  const trafficMonthlyAvg = weeklyAvg(trafficMonthly, 4)

  // ---- Applications ----
  const appsThisWeek = applications.filter(a => inRange(a.created_at, thisWeekStart, now)).length
  const appsLastWeek = applications.filter(a => inRange(a.created_at, lastWeekStart, thisWeekStart)).length
  const appsMonthly = applications.filter(a => inRange(a.created_at, fourWeeksAgo, thisWeekStart)).length
  const appsMonthlyAvg = weeklyAvg(appsMonthly, 4)

  // ---- Interviews booked ----
  const bookingsThisWeek = bookings.filter(b => !b.cancelled_at && inRange(b.created_at, thisWeekStart, now)).length
  const bookingsLastWeek = bookings.filter(b => !b.cancelled_at && inRange(b.created_at, lastWeekStart, thisWeekStart)).length
  const bookingsMonthly = bookings.filter(b => !b.cancelled_at && inRange(b.created_at, fourWeeksAgo, thisWeekStart)).length
  const bookingsMonthlyAvg = weeklyAvg(bookingsMonthly, 4)

  // ---- Interviews conducted ----
  const interviewsThisWeek = interviews.filter(i => inRange(i.conducted_at || i.created_at, thisWeekStart, now)).length
  const interviewsLastWeek = interviews.filter(i => inRange(i.conducted_at || i.created_at, lastWeekStart, thisWeekStart)).length
  const interviewsMonthly = interviews.filter(i => inRange(i.conducted_at || i.created_at, fourWeeksAgo, thisWeekStart)).length
  const interviewsMonthlyAvg = weeklyAvg(interviewsMonthly, 4)

  // ---- Payments (enrollments) ----
  const succeededPayments = payments.filter(p => p.status === 'succeeded')
  const enrollmentsThisWeek = succeededPayments.filter(p => inRange(p.paid_at || p.created_at, thisWeekStart, now)).length
  const enrollmentsLastWeek = succeededPayments.filter(p => inRange(p.paid_at || p.created_at, lastWeekStart, thisWeekStart)).length
  const enrollmentsMonthly = succeededPayments.filter(p => inRange(p.paid_at || p.created_at, fourWeeksAgo, thisWeekStart)).length
  const enrollmentsMonthlyAvg = weeklyAvg(enrollmentsMonthly, 4)

  // ---- Emails sent ----
  const outboundEmails = emails.filter(e => e.direction === 'outbound')
  const emailsThisWeek = outboundEmails.filter(e => inRange(e.sent_at, thisWeekStart, now)).length
  const emailsLastWeek = outboundEmails.filter(e => inRange(e.sent_at, lastWeekStart, thisWeekStart)).length
  const emailsMonthly = outboundEmails.filter(e => inRange(e.sent_at, fourWeeksAgo, thisWeekStart)).length
  const emailsMonthlyAvg = weeklyAvg(emailsMonthly, 4)

  // ---- System health ----
  const totalCalls = logs.length
  const errorCalls = logs.filter(l => l.status === 'error').length
  const errorRate = totalCalls > 0 ? Math.round((errorCalls / totalCalls) * 100) : 0
  const uniqueFunctions = new Set(logs.map(l => l.function_name)).size

  // ---- Upcoming events ----
  const today = now.toISOString().slice(0, 10)
  const { data: upcomingRegsRaw } = await supabase
    .from('workshop_registrations')
    .select('event_date')
    .gte('event_date', today)

  const upcomingRegs = upcomingRegsRaw ?? []
  const upcomingEventMap = new Map<string, number>()
  upcomingRegs.forEach((r: { event_date: string }) => {
    upcomingEventMap.set(r.event_date, (upcomingEventMap.get(r.event_date) || 0) + 1)
  })
  const upcomingEvents = Array.from(upcomingEventMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  // ---- Recommendations ----
  const recommendations = await generateRecommendations({
    targetCohort: TARGET_COHORT,
    enrollmentGoal: ENROLLMENT_GOAL,
    currentEnrolled: projection.current.enrolled,
    currentInvitedToEnrol: projection.current.invited_to_enrol,
    currentInterviewed: projection.current.interviewed,
    currentTotal: projection.current.total,
    workshopAttendeesInPipeline: projection.quality.workshop_attendee.count,
    weeksRemaining: projection.weeks_remaining,
    gap: projection.gap,
    weeklyAppTarget: projection.weekly_targets.applications,
    appsThisWeek,
  })

  return {
    projection, recommendations,
    trafficThisWeek, trafficLastWeek, trafficMonthlyAvg,
    appsThisWeek, appsLastWeek, appsMonthlyAvg,
    bookingsThisWeek, bookingsLastWeek, bookingsMonthlyAvg,
    interviewsThisWeek, interviewsLastWeek, interviewsMonthlyAvg,
    enrollmentsThisWeek, enrollmentsLastWeek, enrollmentsMonthlyAvg,
    emailsThisWeek, emailsLastWeek, emailsMonthlyAvg,
    totalCalls, errorCalls, errorRate, uniqueFunctions,
    upcomingEvents,
  }
}

// ---- UI components ----

function TrendLine({ current, previous, monthlyAvg, label }: {
  current: number
  previous: number
  monthlyAvg: number
  label: string
}) {
  const vsLastWeek = pctChange(current, previous)
  return (
    <div className="mt-3 space-y-1">
      {vsLastWeek !== null && (
        <p className={`text-xs ${vsLastWeek >= 0 ? 'text-[#5B9A8B]' : 'text-red-400'}`}>
          {vsLastWeek >= 0 ? '↑' : '↓'} {Math.abs(vsLastWeek)}% vs prior 7 days
          <span className="text-[var(--color-text-muted)] ml-1">({previous} {label})</span>
        </p>
      )}
      <p className="text-xs text-[var(--color-text-muted)]">
        Monthly avg: {monthlyAvg}/week
      </p>
    </div>
  )
}

function GoalBar({ current, goal, label }: { current: number; goal: number; label: string }) {
  const pct = Math.min(Math.round((current / goal) * 100), 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-[var(--color-text-secondary)]">{label}</span>
        <span className="text-[var(--color-text-primary)] font-medium">{current} / {goal}</span>
      </div>
      <div className="h-2.5 rounded-full bg-[var(--color-surface)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#5B9A8B] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function TargetIndicator({ current, target, label }: { current: number; target: number; label: string }) {
  const onTrack = current >= target
  return (
    <p className={`text-xs mt-1 ${onTrack ? 'text-[#5B9A8B]' : 'text-[var(--color-text-muted)]'}`}>
      {onTrack ? '✓' : '→'} Target: {target}/{label}
    </p>
  )
}

function RateBar({ label, rate }: { label: string; rate: number }) {
  const pct = Math.round(rate * 100)
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--color-text-secondary)] w-36 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[var(--color-surface)] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#5B9A8B] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-[var(--color-text-primary)] font-medium w-10 text-right">{pct}%</span>
    </div>
  )
}

// ---- Page ----

export default async function Dashboard() {
  const d = await getDashboardData()
  const p = d.projection

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            System Status
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            Weekly performance across all systems — {TARGET_COHORT} cohort
          </p>
        </div>

        {/* ── Goal Tracker ── */}
        <div className="kith-card p-6 mb-8">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                Enrollment Goal — {TARGET_COHORT}
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                {p.weeks_remaining} weeks remaining · Projected {p.projected_enrolled} enrolled from current pipeline
                {p.gap > 0 && (
                  <> · Need {p.total_applications_needed} more pipeline entries ({p.weekly_targets.applications}/week)</>

                )}
              </p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-semibold text-[#5B9A8B]">{p.current.enrolled}</span>
              <span className="text-3xl font-semibold text-[var(--color-text-muted)]"> / {p.goal}</span>
            </div>
          </div>

          <div className="space-y-3">
            <GoalBar current={p.current.enrolled} goal={p.goal} label="Enrolled" />
            <GoalBar
              current={p.current.invited_to_enrol}
              goal={p.current.invited_to_enrol + Math.ceil(p.gap / p.rates.invited_to_enrolled)}
              label={`Invited to Enrol (need ${Math.ceil(p.gap / p.rates.invited_to_enrolled)} more at ${Math.round(p.rates.invited_to_enrolled * 100)}% conv.)`}
            />
            <GoalBar
              current={p.current.applied}
              goal={p.current.applied + p.total_applications_needed}
              label={`Pipeline Entries (need ${p.total_applications_needed} more at ${Math.round(p.rates.overall_applied_to_enrolled * 100)}% conv.)`}
            />
          </div>

          {/* Pipeline waterfall */}
          <div className="grid grid-cols-7 gap-2 mt-5 pt-4 border-t border-[var(--color-border-subtle)]">
            {[
              { label: 'Pipeline', value: p.current.total },
              { label: 'Applied', value: p.current.applied },
              { label: 'Inv. Interview', value: p.current.invited_to_interview },
              { label: 'Booked', value: p.current.booked },
              { label: 'Interviewed', value: p.current.interviewed },
              { label: 'Inv. Enrol', value: p.current.invited_to_enrol, accent: true },
              { label: 'Enrolled', value: p.current.enrolled, accent: true },
            ].map((stage) => (
              <div key={stage.label} className="text-center">
                <div className={`text-lg font-semibold ${stage.accent ? 'text-[#5B9A8B]' : 'text-[var(--color-text-primary)]'}`}>
                  {stage.value}
                </div>
                <div className="text-[10px] text-[var(--color-text-muted)] leading-tight">{stage.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Conversion Rates + Weekly Targets ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Conversion rates */}
          <div className="kith-card p-6">
            <h3 className="kith-label mb-4">Historical Conversion Rates</h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              Event stages: all registrations ({p.event_funnel.total_registrations} regs, {p.event_funnel.unique_attendees} unique attendees).
              Cohort funnel: March 16th 2026 (108 pipeline → 28 enrolled).
            </p>
            <div className="space-y-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">Top of Funnel (Events)</div>
              <RateBar label="Registered → Attended" rate={p.rates.registered_to_attended} />
              <RateBar label="Attended → Applied" rate={p.rates.attended_to_applied} />
              <RateBar label="Reg. only → Applied" rate={p.rates.registered_only_to_applied} />
              <div className="pt-3 border-t border-[var(--color-border-subtle)]">
                <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Cohort Funnel</div>
                <div className="space-y-3">
                  <RateBar label="Applied → Booked" rate={p.rates.applied_to_booked} />
                  <RateBar label="Booked → Interviewed" rate={p.rates.booked_to_interviewed} />
                  <RateBar label="Interviewed → Invited" rate={p.rates.interviewed_to_invited} />
                  <RateBar label="Invited → Enrolled" rate={p.rates.invited_to_enrolled} />
                </div>
              </div>
              <div className="pt-2 border-t border-[var(--color-border-subtle)]">
                <RateBar label="Overall Applied → Enrolled" rate={p.rates.overall_applied_to_enrolled} />
              </div>
            </div>
          </div>

          {/* Weekly targets */}
          <div className="kith-card p-6">
            <h3 className="kith-label mb-4">Weekly Targets to Close Gap</h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              {p.gap > 0
                ? `Current pipeline projects ${Math.round(p.projected_enrolled)} enrolled. Need ${p.gap} more over ${p.weeks_remaining} weeks to hit goal of ${p.goal}.`
                : `On track — current pipeline projects ${Math.round(p.projected_enrolled)} of ${p.goal} enrolled.`
              }
            </p>
            <div className="space-y-4">
              {[
                { label: 'Pipeline Entries', target: p.weekly_targets.applications, current: d.appsThisWeek },
                { label: 'Interviews Booked', target: p.weekly_targets.interviews_booked, current: d.bookingsThisWeek },
                { label: 'Interviews Done', target: p.weekly_targets.interviews_conducted, current: d.interviewsThisWeek },
                { label: 'Enrollments', target: p.weekly_targets.enrollments, current: d.enrollmentsThisWeek },
              ].map((t) => {
                const onTrack = t.current >= t.target
                return (
                  <div key={t.label} className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-[var(--color-text-primary)]">{t.label}</span>
                      <span className="text-xs text-[var(--color-text-muted)] ml-2">target: {t.target}/week</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-semibold ${onTrack ? 'text-[#5B9A8B]' : 'text-[var(--color-text-primary)]'}`}>
                        {t.current}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        onTrack
                          ? 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B]'
                          : 'bg-[rgba(232,230,227,0.06)] text-[var(--color-text-muted)]'
                      }`}>
                        {onTrack ? 'on track' : `${t.target - t.current} behind`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-4 pt-3 border-t border-[var(--color-border-subtle)]">
              Targets recalculate each load based on current pipeline and historical rates
            </p>
          </div>
        </div>

        {/* ── Lead Quality (current May pipeline) ── */}
        <div className="kith-card p-6 mb-8">
          <h3 className="kith-label mb-1">Pipeline Quality — {TARGET_COHORT}</h3>
          <p className="text-xs text-[var(--color-text-muted)] mb-5">
            Blended conversion rate: {Math.round(p.quality.blended_rate * 100)}% (vs {Math.round(p.rates.overall_applied_to_enrolled * 100)}% average)
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By lead type */}
            <div>
              <h4 className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-3">By Lead Type</h4>
              <div className="space-y-3">
                {[
                  { label: 'Professional', ...p.quality.professional, color: '#5B9A8B' },
                  { label: 'Pivoter', ...p.quality.pivoter, color: '#6B8DD6' },
                  { label: 'Unknown', ...p.quality.unknown, color: 'rgba(232,230,227,0.3)' },
                ].map((seg) => (
                  <div key={seg.label} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                    <span className="text-sm text-[var(--color-text-primary)] w-24">{seg.label}</span>
                    <span className="text-sm font-semibold text-[var(--color-text-primary)] w-8">{seg.count}</span>
                    <div className="flex-1 h-2 rounded-full bg-[var(--color-surface)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.round(seg.rate * 100)}%`, backgroundColor: seg.color }} />
                    </div>
                    <span className="text-xs text-[var(--color-text-secondary)] w-16 text-right">{Math.round(seg.rate * 100)}% conv.</span>
                  </div>
                ))}
              </div>
            </div>

            {/* By source */}
            <div>
              <h4 className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-3">By Source</h4>
              <div className="space-y-3">
                {[
                  { label: 'Workshop attendee', ...p.quality.workshop_attendee, color: '#5B9A8B' },
                  { label: 'Direct applicant', ...p.quality.direct, color: 'rgba(232,230,227,0.3)' },
                ].map((seg) => (
                  <div key={seg.label} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                    <span className="text-sm text-[var(--color-text-primary)] w-32">{seg.label}</span>
                    <span className="text-sm font-semibold text-[var(--color-text-primary)] w-8">{seg.count}</span>
                    <div className="flex-1 h-2 rounded-full bg-[var(--color-surface)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.round(seg.rate * 100)}%`, backgroundColor: seg.color }} />
                    </div>
                    <span className="text-xs text-[var(--color-text-secondary)] w-16 text-right">{Math.round(seg.rate * 100)}% conv.</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-4 pt-3 border-t border-[var(--color-border-subtle)]">
                Workshop attendees convert at {Math.round((p.quality.workshop_attendee.rate / p.quality.direct.rate) * 10) / 10}x the rate of direct applicants.
                {p.quality.workshop_attendee.count < 5 && (
                  <> Only {p.quality.workshop_attendee.count} in the May pipeline — events are the lever.</>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* ── Recommendations ── */}
        {d.recommendations.length > 0 && (
          <div className="kith-card p-6 mb-8">
            <h3 className="kith-label mb-4">Recommendations</h3>
            <div className="space-y-4">
              {d.recommendations.map((rec, i) => {
                const priorityStyles = {
                  high: { border: 'border-l-[#5B9A8B]', badge: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B]' },
                  medium: { border: 'border-l-[#6B8DD6]', badge: 'bg-[rgba(107,141,214,0.15)] text-[#6B8DD6]' },
                  low: { border: 'border-l-[var(--color-border)]', badge: 'bg-[rgba(232,230,227,0.06)] text-[var(--color-text-muted)]' },
                }
                const style = priorityStyles[rec.priority]
                return (
                  <div key={i} className={`border-l-2 ${style.border} pl-4`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-[var(--color-text-primary)]">{rec.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${style.badge}`}>
                            {rec.priority}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{rec.detail}</p>
                      </div>
                      <span className="text-xs text-[var(--color-text-muted)] whitespace-nowrap shrink-0">{rec.metric}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-4 pt-3 border-t border-[var(--color-border-subtle)]">
              Recommendations generated from live pipeline data and historical cohort conversion patterns
            </p>
          </div>
        )}

        {/* ── Weekly Activity Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Traffic (trend only — not a direct enrollment predictor) */}
          <div className="kith-card p-6">
            <h3 className="kith-label">Website Traffic</h3>
            <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">
              {d.trafficThisWeek.toLocaleString()}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">page views (last 7 days)</p>
            <TrendLine current={d.trafficThisWeek} previous={d.trafficLastWeek} monthlyAvg={d.trafficMonthlyAvg} label="views" />
          </div>

          {/* Pipeline Entries */}
          <div className="kith-card p-6">
            <h3 className="kith-label">Pipeline Entries</h3>
            <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">
              {d.appsThisWeek}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">new entries (last 7 days)</p>
            <TrendLine current={d.appsThisWeek} previous={d.appsLastWeek} monthlyAvg={d.appsMonthlyAvg} label="apps" />
            <TargetIndicator current={d.appsThisWeek} target={p.weekly_targets.applications} label="week" />
          </div>

          {/* Interviews Booked */}
          <div className="kith-card p-6">
            <h3 className="kith-label">Interviews Booked</h3>
            <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">
              {d.bookingsThisWeek}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">booked (last 7 days)</p>
            <TrendLine current={d.bookingsThisWeek} previous={d.bookingsLastWeek} monthlyAvg={d.bookingsMonthlyAvg} label="booked" />
            <TargetIndicator current={d.bookingsThisWeek} target={p.weekly_targets.interviews_booked} label="week" />
          </div>

          {/* Interviews Conducted */}
          <div className="kith-card p-6">
            <h3 className="kith-label">Interviews Conducted</h3>
            <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">
              {d.interviewsThisWeek}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">completed (last 7 days)</p>
            <TrendLine current={d.interviewsThisWeek} previous={d.interviewsLastWeek} monthlyAvg={d.interviewsMonthlyAvg} label="interviews" />
            <TargetIndicator current={d.interviewsThisWeek} target={p.weekly_targets.interviews_conducted} label="week" />
          </div>

          {/* Enrollments */}
          <div className="kith-card p-6 border-[var(--color-border-hover)]">
            <h3 className="kith-label">Enrollments</h3>
            <p className="mt-3 text-3xl font-semibold text-[#5B9A8B]">
              {d.enrollmentsThisWeek}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">enrolled (last 7 days)</p>
            <TrendLine current={d.enrollmentsThisWeek} previous={d.enrollmentsLastWeek} monthlyAvg={d.enrollmentsMonthlyAvg} label="enrolled" />
            <TargetIndicator current={d.enrollmentsThisWeek} target={p.weekly_targets.enrollments} label="week" />
          </div>

          {/* Emails */}
          <div className="kith-card p-6">
            <h3 className="kith-label">Emails Sent</h3>
            <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">
              {d.emailsThisWeek}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">outbound (last 7 days)</p>
            <TrendLine current={d.emailsThisWeek} previous={d.emailsLastWeek} monthlyAvg={d.emailsMonthlyAvg} label="emails" />
          </div>
        </div>

        {/* ── Bottom row: Events + System Health ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Upcoming Events */}
          <div className="kith-card p-6">
            <h3 className="kith-label mb-4">Upcoming Events</h3>
            {d.upcomingEvents.length > 0 ? (
              <div className="space-y-3">
                {d.upcomingEvents.map((evt) => (
                  <div key={evt.date} className="flex items-center justify-between">
                    <span className="text-sm text-[var(--color-text-primary)] font-medium">
                      {new Date(evt.date + 'T12:00:00').toLocaleDateString('en-US', {
                        month: 'long', day: 'numeric', year: 'numeric'
                      })}
                    </span>
                    <div className="text-right">
                      <span className="text-lg font-semibold text-[#5B9A8B]">{evt.count}</span>
                      <span className="text-xs text-[var(--color-text-muted)] ml-1">registered</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">No upcoming events</p>
            )}
            <p className="text-xs text-[var(--color-text-muted)] mt-4 pt-3 border-t border-[var(--color-border-subtle)]">
              March benchmark: 967 registrations (Feb 5) drove 28 enrollments
            </p>
          </div>

          {/* System Health */}
          <div className="kith-card p-6">
            <h3 className="kith-label mb-4">System Health (24h)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-semibold text-[var(--color-text-primary)]">{d.totalCalls}</div>
                <div className="text-xs text-[var(--color-text-muted)]">API calls</div>
              </div>
              <div>
                <div className={`text-2xl font-semibold ${d.errorRate > 5 ? 'text-red-400' : 'text-[#5B9A8B]'}`}>
                  {d.errorRate}%
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">Error rate</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-[var(--color-text-primary)]">{d.uniqueFunctions}</div>
                <div className="text-xs text-[var(--color-text-muted)]">Active functions</div>
              </div>
              <div>
                <div className={`text-2xl font-semibold ${d.errorCalls > 0 ? 'text-red-400' : 'text-[#5B9A8B]'}`}>
                  {d.errorCalls}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">Errors</div>
              </div>
            </div>
            <a
              href="/status"
              className="text-xs text-[#5B9A8B] hover:underline mt-4 pt-3 border-t border-[var(--color-border-subtle)] block"
            >
              View full status dashboard →
            </a>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-muted)] text-center">
            Part of Kith AI Lab
          </p>
        </footer>
      </main>
    </div>
  )
}
