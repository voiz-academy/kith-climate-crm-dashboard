'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { FunnelStatus, FUNNEL_LABELS } from '@/lib/supabase'

interface FunnelChartProps {
  data: { stage: FunnelStatus; count: number; percentage: number }[]
  sideData: { stage: FunnelStatus; count: number }[]
}

const STAGE_COLORS: Record<string, string> = {
  applied: '#52907F',
  invited_to_interview: '#498573',
  interviewed: '#376F5B',
  invited_to_enrol: '#2E644F',
  enrolled: '#255943',
}

const SIDE_COLORS: Record<string, string> = {
  no_show: '#D97706',
  offer_expired: 'rgba(232, 230, 227, 0.35)',
  not_invited: 'rgba(232, 230, 227, 0.25)',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const { stage, count, percentage } = payload[0].payload
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded px-3 py-2 shadow-lg">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">
        {FUNNEL_LABELS[stage as FunnelStatus]}
      </p>
      <p className="text-sm text-[var(--color-text-secondary)]">
        {count} customers ({percentage}%)
      </p>
    </div>
  )
}

export function FunnelChart({ data, sideData }: FunnelChartProps) {
  return (
    <div className="kith-card p-6">
      <h3 className="kith-label mb-6">Pipeline</h3>

      {/* Main funnel stages */}
      <div style={{ width: '100%', height: data.length * 52 + 20 }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 40, bottom: 0, left: 140 }}
            barSize={32}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="stage"
              tickFormatter={(v: string) => FUNNEL_LABELS[v as FunnelStatus] || v}
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 13 }}
              axisLine={false}
              tickLine={false}
              width={140}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.stage}
                  fill={STAGE_COLORS[entry.stage] || '#5B9A8B'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Count labels overlaid on bars */}
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 pl-[140px]">
        {data.map((d) => (
          <span key={d.stage} className="text-xs text-[var(--color-text-muted)]">
            {FUNNEL_LABELS[d.stage as FunnelStatus]}: <span className="text-[var(--color-text-secondary)] font-medium">{d.count}</span>
          </span>
        ))}
      </div>

      {/* Side statuses */}
      {sideData.some(s => s.count > 0) && (
        <div className="mt-6 pt-4 border-t border-[var(--color-border-subtle)]">
          <span className="kith-label">Other Statuses</span>
          <div className="flex gap-4 mt-3">
            {sideData.map((s) => (
              <div
                key={s.stage}
                className="flex items-center gap-2 px-3 py-2 rounded bg-[var(--color-surface)]"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: SIDE_COLORS[s.stage] || 'rgba(232,230,227,0.25)' }}
                />
                <span className="text-sm text-[var(--color-text-secondary)]">
                  {FUNNEL_LABELS[s.stage as FunnelStatus]}
                </span>
                <span className="text-sm font-medium text-[var(--color-text-primary)]">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
