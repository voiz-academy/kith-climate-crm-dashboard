'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface EventComparisonChartProps {
  data: {
    event: string
    registered: number
    attended: number
    professionals: number
    pivoters: number
    unknown: number
  }[]
}

export function EventComparisonChart({ data }: EventComparisonChartProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Attendance chart */}
      <div className="kith-card p-6">
        <h3 className="kith-label mb-4">Registration vs Attendance</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(232, 230, 227, 0.06)" />
              <XAxis
                dataKey="event"
                tick={{ fill: 'rgba(232, 230, 227, 0.5)', fontSize: 12 }}
                axisLine={{ stroke: 'rgba(232, 230, 227, 0.06)' }}
              />
              <YAxis
                tick={{ fill: 'rgba(232, 230, 227, 0.5)', fontSize: 12 }}
                axisLine={{ stroke: 'rgba(232, 230, 227, 0.06)' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#232629',
                  border: '1px solid rgba(232, 230, 227, 0.06)',
                  borderRadius: '6px',
                  color: '#e8e6e3'
                }}
              />
              <Legend
                formatter={(value) => <span style={{ color: 'rgba(232, 230, 227, 0.5)' }}>{value}</span>}
              />
              <Bar dataKey="registered" fill="rgba(91, 154, 139, 0.4)" name="Registered" radius={[4, 4, 0, 0]} />
              <Bar dataKey="attended" fill="#5B9A8B" name="Attended" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Audience mix stacked chart */}
      <div className="kith-card p-6">
        <h3 className="kith-label mb-4">Audience Composition</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(232, 230, 227, 0.06)" />
              <XAxis
                dataKey="event"
                tick={{ fill: 'rgba(232, 230, 227, 0.5)', fontSize: 12 }}
                axisLine={{ stroke: 'rgba(232, 230, 227, 0.06)' }}
              />
              <YAxis
                tick={{ fill: 'rgba(232, 230, 227, 0.5)', fontSize: 12 }}
                axisLine={{ stroke: 'rgba(232, 230, 227, 0.06)' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#232629',
                  border: '1px solid rgba(232, 230, 227, 0.06)',
                  borderRadius: '6px',
                  color: '#e8e6e3'
                }}
              />
              <Legend
                formatter={(value) => <span style={{ color: 'rgba(232, 230, 227, 0.5)' }}>{value}</span>}
              />
              <Bar dataKey="professionals" stackId="mix" fill="#5B9A8B" name="Professional" radius={[0, 0, 0, 0]} />
              <Bar dataKey="pivoters" stackId="mix" fill="#6B8DD6" name="Pivoter" radius={[0, 0, 0, 0]} />
              <Bar dataKey="unknown" stackId="mix" fill="rgba(232, 230, 227, 0.15)" name="Unknown" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
