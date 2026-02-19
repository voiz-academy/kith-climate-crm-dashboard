'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface InvocationChartProps {
  data: {
    date: string
    count: number
  }[]
}

export function InvocationChart({ data }: InvocationChartProps) {
  return (
    <div className="kith-card p-6">
      <h3 className="kith-label mb-4">Daily Invocations (Last 7 Days)</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(232, 230, 227, 0.06)" />
            <XAxis
              dataKey="date"
              tick={{ fill: 'rgba(232, 230, 227, 0.5)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(232, 230, 227, 0.06)' }}
            />
            <YAxis
              tick={{ fill: 'rgba(232, 230, 227, 0.5)', fontSize: 12 }}
              axisLine={{ stroke: 'rgba(232, 230, 227, 0.06)' }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#232629',
                border: '1px solid rgba(232, 230, 227, 0.06)',
                borderRadius: '6px',
                color: '#e8e6e3',
              }}
              labelStyle={{ color: 'rgba(232, 230, 227, 0.7)' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [value, 'Invocations']}
            />
            <Bar dataKey="count" fill="#5B9A8B" name="Invocations" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
