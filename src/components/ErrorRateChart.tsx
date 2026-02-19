'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface ErrorRateChartProps {
  data: {
    date: string
    success: number
    error: number
  }[]
}

export function ErrorRateChart({ data }: ErrorRateChartProps) {
  return (
    <div className="kith-card p-6">
      <h3 className="kith-label mb-4">Success vs Errors (Last 7 Days)</h3>
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
            />
            <Legend
              wrapperStyle={{ color: 'rgba(232, 230, 227, 0.7)', fontSize: 12 }}
            />
            <Bar dataKey="success" stackId="a" fill="#5B9A8B" name="Success" radius={[0, 0, 0, 0]} />
            <Bar dataKey="error" stackId="a" fill="#ef4444" name="Errors" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
