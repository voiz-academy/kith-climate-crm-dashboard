'use client'

import { useEffect, useState } from 'react'

type EnrichmentCounts = {
  pending: number
  enriching: number
  enriched: number
  failed: number
  skipped: number
}

export function EnrichmentStatus() {
  const [counts, setCounts] = useState<EnrichmentCounts | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/enrichment/status')
        if (!res.ok) throw new Error()
        setCounts(await res.json())
      } catch {
        setError(true)
      }
    }
    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [])

  if (error) return null
  if (!counts) {
    return (
      <div className="kith-card p-6">
        <h3 className="kith-label">Enrichment Pipeline</h3>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">Loading...</p>
      </div>
    )
  }

  const total = counts.pending + counts.enriching + counts.enriched + counts.failed + counts.skipped
  const enrichedPct = total > 0 ? Math.round((counts.enriched / total) * 100) : 0
  const isProcessing = counts.pending > 0 || counts.enriching > 0

  return (
    <div className="kith-card p-6">
      <div className="flex items-center justify-between">
        <h3 className="kith-label">Enrichment Pipeline</h3>
        {isProcessing && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[#5B9A8B]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#5B9A8B] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#5B9A8B]" />
            </span>
            Processing
          </span>
        )}
      </div>

      <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">
        {enrichedPct}%
      </p>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        {counts.enriched} of {total} enriched
      </p>

      {/* Progress bar */}
      <div className="mt-4 h-2 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
        <div className="h-full flex">
          <div
            className="bg-[#5B9A8B] transition-all duration-500"
            style={{ width: `${total > 0 ? (counts.enriched / total) * 100 : 0}%` }}
          />
          <div
            className="bg-[#6B8DD6] transition-all duration-500"
            style={{ width: `${total > 0 ? (counts.enriching / total) * 100 : 0}%` }}
          />
          <div
            className="bg-amber-500/60 transition-all duration-500"
            style={{ width: `${total > 0 ? (counts.pending / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Status breakdown */}
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-lg font-medium text-[var(--color-text-primary)]">{counts.pending}</p>
          <p className="text-xs text-[var(--color-text-muted)]">Pending</p>
        </div>
        <div>
          <p className="text-lg font-medium text-[var(--color-text-primary)]">{counts.failed}</p>
          <p className="text-xs text-[var(--color-text-muted)]">Failed</p>
        </div>
        <div>
          <p className="text-lg font-medium text-[var(--color-text-primary)]">{counts.skipped}</p>
          <p className="text-xs text-[var(--color-text-muted)]">Skipped</p>
        </div>
      </div>
    </div>
  )
}
