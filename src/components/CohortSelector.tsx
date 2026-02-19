'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { COHORT_OPTIONS, type CohortFilter } from '@/lib/supabase'

export function CohortSelector() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = (searchParams.get('cohort') ?? 'all') as CohortFilter

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete('cohort')
    } else {
      params.set('cohort', value)
    }
    const qs = params.toString()
    router.push(qs ? `?${qs}` : '?', { scroll: false })
  }

  return (
    <div className="flex items-center gap-1.5">
      {COHORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => handleChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
            current === opt.value
              ? 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border-[rgba(91,154,139,0.3)]'
              : 'bg-transparent text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text-secondary)] hover:border-[var(--color-text-muted)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
