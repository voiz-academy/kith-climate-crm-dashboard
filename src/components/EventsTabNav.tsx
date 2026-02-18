'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/events', label: 'Overview' },
  { href: '/events/repeat-attendees', label: 'Repeat Attendees' },
  { href: '/events/companies', label: 'Companies' },
  { href: '/events/locations', label: 'Locations' },
]

export function EventsTabNav() {
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-1 border-b border-[var(--color-border)] mb-8">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
              isActive
                ? 'border-[#5B9A8B] text-[#5B9A8B] font-medium'
                : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
