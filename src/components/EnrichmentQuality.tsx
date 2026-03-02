'use client'

import { useEffect, useState } from 'react'

type QualityData = {
  confidence: {
    high: number
    medium: number
    low: number
    likely_wrong: number
  }
  fields: {
    enriched_total: number
    has_title: number
    has_company: number
    has_location: number
    placeholder_titles: number
  }
  names: {
    full_name: number
    first_only: number
    no_name: number
  }
}

function pct(n: number, total: number): string {
  if (total === 0) return '0'
  return Math.round((n / total) * 100).toString()
}

function BarSegment({ value, total, color, label }: {
  value: number
  total: number
  color: string
  label: string
}) {
  const width = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-20 text-[var(--color-text-muted)] text-xs truncate">{label}</span>
      <div className="flex-1 h-4 bg-[var(--color-bg-secondary)] rounded overflow-hidden">
        <div
          className="h-full rounded transition-all duration-500"
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-14 text-right text-xs text-[var(--color-text-secondary)]">
        {pct(value, total)}%
      </span>
    </div>
  )
}

export function EnrichmentQuality() {
  const [data, setData] = useState<QualityData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/enrichment/quality')
        if (!res.ok) throw new Error()
        setData(await res.json())
      } catch {
        setError(true)
      }
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (error) return null
  if (!data) {
    return (
      <div className="kith-card p-6">
        <h3 className="kith-label">Enrichment Quality</h3>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">Loading...</p>
      </div>
    )
  }

  const { confidence, fields, names } = data
  const totalConfidence = confidence.high + confidence.medium + confidence.low + confidence.likely_wrong
  const totalNames = names.full_name + names.first_only + names.no_name
  const enriched = fields.enriched_total

  // Overall quality score: weighted average of high (100), medium (70), low (40), wrong (0)
  const qualityScore = totalConfidence > 0
    ? Math.round(
        (confidence.high * 100 + confidence.medium * 70 + confidence.low * 40) / totalConfidence
      )
    : 0

  return (
    <div className="kith-card p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="kith-label">Enrichment Quality</h3>
        <span className="text-xs text-[var(--color-text-muted)]">
          {enriched} enriched profiles
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Quality Score */}
        <div>
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Quality Score
          </p>
          <p className="text-3xl font-semibold text-[var(--color-text-primary)]">
            {qualityScore}
            <span className="text-lg text-[var(--color-text-muted)]">/100</span>
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            Based on match confidence
          </p>
        </div>

        {/* Match Confidence */}
        <div>
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Match Confidence
          </p>
          <div className="space-y-1.5">
            <BarSegment value={confidence.high} total={enriched} color="#5B9A8B" label="High" />
            <BarSegment value={confidence.medium} total={enriched} color="#6B8DD6" label="Medium" />
            <BarSegment value={confidence.low} total={enriched} color="#D97706" label="Low" />
            <BarSegment value={confidence.likely_wrong} total={enriched} color="#DC2626" label="Wrong" />
          </div>
        </div>

        {/* Profile Completeness */}
        <div>
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Profile Completeness
          </p>
          <div className="space-y-1.5">
            <BarSegment value={fields.has_title} total={enriched} color="#5B9A8B" label="Title" />
            <BarSegment value={fields.has_company} total={enriched} color="#5B9A8B" label="Company" />
            <BarSegment value={fields.has_location} total={enriched} color="#5B9A8B" label="Location" />
          </div>
          {fields.placeholder_titles > 0 && (
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              {fields.placeholder_titles} placeholder title{fields.placeholder_titles !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* Name Status */}
        <div>
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Name Status
          </p>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-[var(--color-text-secondary)]">Full name</span>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                {names.full_name}
                <span className="text-xs text-[var(--color-text-muted)] ml-1">
                  ({pct(names.full_name, totalNames)}%)
                </span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[var(--color-text-secondary)]">First only</span>
              <span className="text-sm font-medium text-[#D97706]">
                {names.first_only}
                <span className="text-xs text-[var(--color-text-muted)] ml-1">
                  ({pct(names.first_only, totalNames)}%)
                </span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[var(--color-text-secondary)]">No name</span>
              <span className="text-sm font-medium text-[#DC2626]">
                {names.no_name}
                <span className="text-xs text-[var(--color-text-muted)] ml-1">
                  ({pct(names.no_name, totalNames)}%)
                </span>
              </span>
            </div>
          </div>
          {/* Name completeness bar */}
          <div className="mt-3 h-2 bg-[var(--color-bg-secondary)] rounded-full overflow-hidden">
            <div className="h-full flex">
              <div
                className="bg-[#5B9A8B]"
                style={{ width: `${pct(names.full_name, totalNames)}%` }}
              />
              <div
                className="bg-[#D97706]"
                style={{ width: `${pct(names.first_only, totalNames)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
