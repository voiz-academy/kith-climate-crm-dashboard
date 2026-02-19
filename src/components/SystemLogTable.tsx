'use client'

import type { SystemLog } from '@/lib/supabase'

interface SystemLogTableProps {
  logs: SystemLog[]
}

export function SystemLogTable({ logs }: SystemLogTableProps) {
  return (
    <div className="kith-card p-6">
      <h3 className="kith-label mb-4">Recent Invocations</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border-subtle)]">
              <th className="text-left py-2 text-[var(--color-text-muted)] font-medium">Time</th>
              <th className="text-left py-2 text-[var(--color-text-muted)] font-medium">Function</th>
              <th className="text-left py-2 text-[var(--color-text-muted)] font-medium">Type</th>
              <th className="text-left py-2 text-[var(--color-text-muted)] font-medium">Method</th>
              <th className="text-left py-2 text-[var(--color-text-muted)] font-medium">Status</th>
              <th className="text-right py-2 text-[var(--color-text-muted)] font-medium">Duration</th>
              <th className="text-left py-2 text-[var(--color-text-muted)] font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[var(--color-text-muted)]">
                  No invocations recorded yet
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-[var(--color-border-subtle)] last:border-0"
                >
                  <td className="py-2 text-[var(--color-text-muted)] text-xs whitespace-nowrap">
                    {new Date(log.invoked_at).toLocaleString(undefined, {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </td>
                  <td className="py-2 text-[var(--color-text-secondary)] font-mono text-xs">
                    {log.function_name}
                  </td>
                  <td className="py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                      log.function_type === 'api_route'
                        ? 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B]'
                        : 'bg-[rgba(168,130,255,0.15)] text-[#a882ff]'
                    }`}>
                      {log.function_type === 'api_route' ? 'API' : 'Edge'}
                    </span>
                  </td>
                  <td className="py-2 text-[var(--color-text-secondary)] text-xs">
                    {log.http_method || '—'}
                  </td>
                  <td className="py-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs ${
                      log.status === 'success' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                        log.status === 'success' ? 'bg-emerald-400' : 'bg-red-400'
                      }`} />
                      {log.status_code || log.status}
                    </span>
                  </td>
                  <td className="py-2 text-right text-[var(--color-text-secondary)] text-xs">
                    {log.duration_ms != null ? `${log.duration_ms}ms` : '—'}
                  </td>
                  <td className="py-2 text-red-400 text-xs truncate max-w-[200px]" title={log.error_message || ''}>
                    {log.error_message || '—'}
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
