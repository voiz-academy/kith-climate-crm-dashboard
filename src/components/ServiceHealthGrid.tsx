'use client'

import { useEffect, useState } from 'react'

type ServiceHealth = {
  name: string
  status: 'healthy' | 'degraded' | 'down' | 'not_configured' | 'no_data'
  latencyMs: number
  error?: string
  detail?: string
}

type HealthResponse = {
  services: ServiceHealth[]
  checked_at: string
}

const statusConfig = {
  healthy: { dot: 'bg-emerald-400', label: 'Healthy', text: 'text-emerald-400' },
  degraded: { dot: 'bg-yellow-400', label: 'Degraded', text: 'text-yellow-400' },
  down: { dot: 'bg-red-400', label: 'Down', text: 'text-red-400' },
  not_configured: { dot: 'bg-gray-500', label: 'Not Configured', text: 'text-gray-400' },
  no_data: { dot: 'bg-gray-400', label: 'No Data', text: 'text-gray-400' },
}

export function ServiceHealthGrid() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/status/health')
      if (res.ok) {
        const data = await res.json()
        setHealth(data)
      }
    } catch {
      // silently fail — grid shows stale data
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="kith-card p-6">
        <h3 className="kith-label mb-4">Service Health</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-[var(--color-border-subtle)] p-4 animate-pulse">
              <div className="h-4 bg-[var(--color-surface)] rounded w-16 mb-3" />
              <div className="h-3 bg-[var(--color-surface)] rounded w-12" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="kith-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="kith-label">Service Health</h3>
        {health?.checked_at && (
          <span className="text-xs text-[var(--color-text-muted)]">
            Last checked: {new Date(health.checked_at).toLocaleTimeString()}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {health?.services.map((svc) => {
          const cfg = statusConfig[svc.status]
          return (
            <div
              key={svc.name}
              className="rounded-lg border border-[var(--color-border-subtle)] p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {svc.name}
                </span>
              </div>
              <p className={`text-xs ${cfg.text}`}>{cfg.label}</p>
              {svc.detail ? (
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {svc.detail}
                </p>
              ) : svc.status !== 'not_configured' && svc.status !== 'no_data' ? (
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {svc.latencyMs}ms
                </p>
              ) : null}
              {svc.error && (
                <p className="text-xs text-red-400 mt-1 truncate" title={svc.error}>
                  {svc.error}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
