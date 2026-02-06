'use client'

import { useState, useEffect } from 'react'
import { LeadWithAttendance } from '@/lib/supabase'
import { LeadTable } from './LeadTable'

interface LeadTableContainerProps {
  eventDates: string[]
  leadCount: number
}

export function LeadTableContainer({ eventDates, leadCount }: LeadTableContainerProps) {
  const [leads, setLeads] = useState<LeadWithAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchLeads() {
      try {
        const res = await fetch('/api/leads')
        if (!res.ok) throw new Error('Failed to fetch leads')
        const data = await res.json()
        setLeads(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load leads')
      } finally {
        setLoading(false)
      }
    }
    fetchLeads()
  }, [])

  if (error) {
    return (
      <div className="px-6 py-12 text-center text-red-400">
        {error}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="px-6 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-10 w-72 bg-[var(--color-surface)] rounded animate-pulse" />
          <div className="h-10 w-32 bg-[var(--color-surface)] rounded animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-24 bg-[var(--color-surface)] rounded animate-pulse" />
          <div className="h-8 w-24 bg-[var(--color-surface)] rounded animate-pulse" />
          <div className="h-8 w-24 bg-[var(--color-surface)] rounded animate-pulse" />
        </div>
        <div className="space-y-1 mt-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-14 bg-[var(--color-surface)] rounded animate-pulse" style={{ opacity: 1 - i * 0.08 }} />
          ))}
        </div>
        <p className="text-xs text-[var(--color-text-muted)] text-center pt-2">
          Loading {leadCount} leads...
        </p>
      </div>
    )
  }

  return <LeadTable leads={leads} eventDates={eventDates} />
}
