import { getSupabase, type SystemLog } from '@/lib/supabase'
import { Header } from '@/components/Header'
import { StatCard } from '@/components/StatCard'
import { InvocationChart } from '@/components/InvocationChart'
import { ErrorRateChart } from '@/components/ErrorRateChart'
import { ServiceHealthGrid } from '@/components/ServiceHealthGrid'
import { FunctionBreakdownTable } from '@/components/FunctionBreakdownTable'
import { SystemLogTable } from '@/components/SystemLogTable'

export const dynamic = 'force-dynamic'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function StatusPage() {
  const supabase = getSupabase()
  const now = new Date()
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  // Fetch logs from last 7 days
  const { data: recentLogs } = await supabase
    .from('system_logs')
    .select('*')
    .gte('invoked_at', sevenDaysAgo.toISOString())
    .order('invoked_at', { ascending: false })
    .limit(1000)

  const logs: SystemLog[] = (recentLogs as SystemLog[]) ?? []

  // Fetch last 100 for the detail table
  const { data: detailLogs } = await supabase
    .from('system_logs')
    .select('*')
    .order('invoked_at', { ascending: false })
    .limit(100)

  const recentDetailLogs: SystemLog[] = (detailLogs as SystemLog[]) ?? []

  // --- Stat cards ---
  const todayLogs = logs.filter(
    (l) => new Date(l.invoked_at) >= todayStart
  )
  const callsToday = todayLogs.length
  const errorsToday = todayLogs.filter((l) => l.status === 'error').length
  const errorRate = callsToday > 0
    ? ((errorsToday / callsToday) * 100).toFixed(1)
    : '0.0'

  const uniqueFunctions = new Set(logs.map((l) => l.function_name)).size

  const lastError = logs.find((l) => l.status === 'error')
  const lastErrorLabel = lastError
    ? `${lastError.function_name} — ${new Date(lastError.invoked_at).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })}`
    : 'None'

  // --- Daily invocations chart ---
  const dailyCounts = new Map<string, number>()
  const dailySuccess = new Map<string, number>()
  const dailyErrors = new Map<string, number>()

  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    dailyCounts.set(key, 0)
    dailySuccess.set(key, 0)
    dailyErrors.set(key, 0)
  }

  logs.forEach((l) => {
    const dayKey = l.invoked_at.slice(0, 10)
    if (dailyCounts.has(dayKey)) {
      dailyCounts.set(dayKey, (dailyCounts.get(dayKey) || 0) + 1)
      if (l.status === 'error') {
        dailyErrors.set(dayKey, (dailyErrors.get(dayKey) || 0) + 1)
      } else {
        dailySuccess.set(dayKey, (dailySuccess.get(dayKey) || 0) + 1)
      }
    }
  })

  const invocationChartData = Array.from(dailyCounts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date: formatDate(date), count }))

  const errorChartData = Array.from(dailySuccess.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, success]) => ({
      date: formatDate(date),
      success,
      error: dailyErrors.get(date) || 0,
    }))

  // --- Function breakdown ---
  const functionMap = new Map<string, {
    function_name: string
    function_type: string
    total: number
    errors: number
    totalDuration: number
    last_called: string
  }>()

  logs.forEach((l) => {
    const existing = functionMap.get(l.function_name)
    if (!existing) {
      functionMap.set(l.function_name, {
        function_name: l.function_name,
        function_type: l.function_type,
        total: 1,
        errors: l.status === 'error' ? 1 : 0,
        totalDuration: l.duration_ms ?? 0,
        last_called: l.invoked_at,
      })
    } else {
      existing.total++
      if (l.status === 'error') existing.errors++
      existing.totalDuration += l.duration_ms ?? 0
      if (l.invoked_at > existing.last_called) existing.last_called = l.invoked_at
    }
  })

  const breakdownData = Array.from(functionMap.values())
    .sort((a, b) => b.total - a.total)
    .map((fn) => ({
      function_name: fn.function_name,
      function_type: fn.function_type,
      total: fn.total,
      errors: fn.errors,
      error_rate: fn.total > 0 ? ((fn.errors / fn.total) * 100).toFixed(1) : '0.0',
      avg_duration_ms: fn.total > 0 ? Math.round(fn.totalDuration / fn.total) : 0,
      last_called: fn.last_called,
    }))

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            System Status
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            Monitoring all API routes and edge functions
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Calls Today"
            value={callsToday.toLocaleString()}
            subtitle={`${errorsToday} error${errorsToday !== 1 ? 's' : ''}`}
          />
          <StatCard
            title="Error Rate"
            value={`${errorRate}%`}
            subtitle="Today"
            accent={parseFloat(errorRate) > 5}
          />
          <StatCard
            title="Active Functions"
            value={uniqueFunctions}
            subtitle="Last 7 days"
          />
          <StatCard
            title="Last Error"
            value={lastError ? 'Recent' : 'None'}
            subtitle={lastErrorLabel}
            accent={!!lastError}
          />
        </div>

        {/* Service health grid */}
        <div className="mb-8">
          <ServiceHealthGrid />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <InvocationChart data={invocationChartData} />
          <ErrorRateChart data={errorChartData} />
        </div>

        {/* Function breakdown table */}
        <div className="mb-8">
          <FunctionBreakdownTable data={breakdownData} />
        </div>

        {/* Recent invocations table */}
        <div className="mb-8">
          <SystemLogTable logs={recentDetailLogs} />
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
