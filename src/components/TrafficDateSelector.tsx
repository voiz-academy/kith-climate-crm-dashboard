'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const DATE_RANGES = [
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All time' },
] as const

export function TrafficDateSelector() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = searchParams.get('range') ?? '30'

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === '30') {
      params.delete('range')
    } else {
      params.set('range', value)
    }
    const qs = params.toString()
    router.push(qs ? `/traffic?${qs}` : '/traffic')
  }

  return (
    <div className="flex items-center gap-1">
      {DATE_RANGES.map((opt) => (
        <button
          key={opt.value}
          onClick={() => handleChange(opt.value)}
          className={`px-3 py-1.5 rounded text-sm transition-colors ${
            current === opt.value
              ? 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] font-medium'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-card)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
