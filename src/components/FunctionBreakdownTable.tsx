'use client'

interface FunctionBreakdown {
  function_name: string
  function_type: string
  total: number
  errors: number
  error_rate: string
  avg_duration_ms: number
  last_called: string
}

interface FunctionBreakdownTableProps {
  data: FunctionBreakdown[]
}

export function FunctionBreakdownTable({ data }: FunctionBreakdownTableProps) {
  return (
    <div className="kith-card p-6">
      <h3 className="kith-label mb-4">Function Breakdown</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border-subtle)]">
              <th className="text-left py-2 text-[var(--color-text-muted)] font-medium">Function</th>
              <th className="text-left py-2 text-[var(--color-text-muted)] font-medium">Type</th>
              <th className="text-right py-2 text-[var(--color-text-muted)] font-medium">Calls</th>
              <th className="text-right py-2 text-[var(--color-text-muted)] font-medium">Errors</th>
              <th className="text-right py-2 text-[var(--color-text-muted)] font-medium">Error %</th>
              <th className="text-right py-2 text-[var(--color-text-muted)] font-medium">Avg Duration</th>
              <th className="text-right py-2 text-[var(--color-text-muted)] font-medium">Last Called</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[var(--color-text-muted)]">
                  No invocation data yet
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.function_name}
                  className="border-b border-[var(--color-border-subtle)] last:border-0"
                >
                  <td className="py-2 text-[var(--color-text-secondary)] font-mono text-xs">
                    {row.function_name}
                  </td>
                  <td className="py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                      row.function_type === 'api_route'
                        ? 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B]'
                        : 'bg-[rgba(168,130,255,0.15)] text-[#a882ff]'
                    }`}>
                      {row.function_type === 'api_route' ? 'API' : 'Edge'}
                    </span>
                  </td>
                  <td className="py-2 text-right text-[var(--color-text-primary)] font-medium">
                    {row.total.toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-red-400">
                    {row.errors > 0 ? row.errors.toLocaleString() : '—'}
                  </td>
                  <td className="py-2 text-right">
                    <span className={parseFloat(row.error_rate) > 5 ? 'text-red-400' : 'text-[var(--color-text-muted)]'}>
                      {row.error_rate}%
                    </span>
                  </td>
                  <td className="py-2 text-right text-[var(--color-text-secondary)]">
                    {row.avg_duration_ms}ms
                  </td>
                  <td className="py-2 text-right text-[var(--color-text-muted)] text-xs">
                    {row.last_called
                      ? new Date(row.last_called).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })
                      : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
