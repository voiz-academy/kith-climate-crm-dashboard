'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Engagement,
  EngagementStream,
  ENGAGEMENT_STREAM_LABELS,
  ENGAGEMENT_STAGE_LABELS,
  ENGAGEMENT_STAGE_RANK,
  engagementStageBadgeClasses,
} from '@/lib/supabase'

const STREAM_ORDER: EngagementStream[] = ['corporate_contract', 'partner', 'coach']

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(cents: number | null): string | null {
  if (cents === null || cents === undefined) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function EngagementsView({ engagements }: { engagements: Engagement[] }) {
  const [streamFilter, setStreamFilter] = useState<'all' | EngagementStream>('all')

  const filtered = useMemo(() => {
    if (streamFilter === 'all') return engagements
    return engagements.filter((e) => e.stream === streamFilter)
  }, [engagements, streamFilter])

  const grouped = useMemo(() => {
    const map = new Map<EngagementStream, Engagement[]>()
    for (const stream of STREAM_ORDER) map.set(stream, [])
    for (const e of filtered) {
      map.get(e.stream)?.push(e)
    }
    // Sort within stream: stage rank desc (further along = top), then organization name
    for (const list of map.values()) {
      list.sort((a, b) => {
        const ra = ENGAGEMENT_STAGE_RANK[a.stage] ?? 0
        const rb = ENGAGEMENT_STAGE_RANK[b.stage] ?? 0
        if (rb !== ra) return rb - ra
        return a.organization_name.localeCompare(b.organization_name)
      })
    }
    return map
  }, [filtered])

  const counts = useMemo(() => {
    const c: Record<EngagementStream | 'all', number> = {
      all: engagements.length,
      corporate_contract: 0,
      partner: 0,
      coach: 0,
    }
    for (const e of engagements) c[e.stream]++
    return c
  }, [engagements])

  return (
    <>
      {/* Filter bar */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Engagements</h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            B2B pipeline — corporate contracts, partners, coaches
          </p>
        </div>
        <div className="flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded p-1">
          <FilterButton
            active={streamFilter === 'all'}
            onClick={() => setStreamFilter('all')}
            label={`All (${counts.all})`}
          />
          {STREAM_ORDER.map((stream) => (
            <FilterButton
              key={stream}
              active={streamFilter === stream}
              onClick={() => setStreamFilter(stream)}
              label={`${ENGAGEMENT_STREAM_LABELS[stream]} (${counts[stream]})`}
            />
          ))}
        </div>
      </div>

      {/* Streams */}
      <div className="space-y-8">
        {STREAM_ORDER.map((stream) => {
          const list = grouped.get(stream) ?? []
          if (streamFilter !== 'all' && streamFilter !== stream) return null
          if (list.length === 0 && streamFilter === 'all') return null

          return (
            <section key={stream}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
                {ENGAGEMENT_STREAM_LABELS[stream]}{' '}
                <span className="text-[var(--color-text-muted)] normal-case font-normal">
                  · {list.length}
                </span>
              </h2>
              <div className="space-y-2">
                {list.length === 0 ? (
                  <div className="kith-card p-6 text-center text-sm text-[var(--color-text-muted)]">
                    No engagements in this stream yet
                  </div>
                ) : (
                  list.map((e) => <EngagementRow key={e.id} engagement={e} />)
                )}
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}

function FilterButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        active
          ? 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B]'
          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-card)]'
      }`}
    >
      {label}
    </button>
  )
}

function EngagementRow({ engagement }: { engagement: Engagement }) {
  const value = formatCurrency(engagement.expected_value_cents)
  const hasNextSteps = !!engagement.next_steps?.trim()

  return (
    <Link
      href={`/engagements/${engagement.slug}`}
      className="kith-card block p-4 hover:bg-[rgba(91,154,139,0.03)] transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              {engagement.organization_name}
            </h3>
            <span
              className={`px-1.5 py-0.5 inline-flex text-[10px] leading-4 font-medium rounded ${engagementStageBadgeClasses(
                engagement.stage
              )}`}
            >
              {ENGAGEMENT_STAGE_LABELS[engagement.stage]}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-[var(--color-text-secondary)]">
            {engagement.primary_contact_name && (
              <span>
                <span className="text-[var(--color-text-muted)]">Contact:</span>{' '}
                {engagement.primary_contact_name}
                {engagement.primary_contact_role && (
                  <span className="text-[var(--color-text-muted)]">
                    {' '}
                    — {engagement.primary_contact_role}
                  </span>
                )}
              </span>
            )}
            {engagement.last_interaction_at && (
              <span>
                <span className="text-[var(--color-text-muted)]">Last touched:</span>{' '}
                {formatDate(engagement.last_interaction_at)}
              </span>
            )}
            {value && (
              <span className="text-[#5B9A8B]">
                <span className="text-[var(--color-text-muted)]">Value:</span> {value}
              </span>
            )}
          </div>
          {hasNextSteps && (
            <div className="mt-2 text-xs text-[var(--color-text-muted)] line-clamp-1">
              <span className="text-[var(--color-text-secondary)]">Next:</span>{' '}
              {engagement.next_steps?.split('\n')[0].replace(/^[-*]\s*/, '')}
            </div>
          )}
        </div>
        <svg
          className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0 mt-1"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}
