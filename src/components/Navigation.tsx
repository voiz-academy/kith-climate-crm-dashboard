'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/funnel', label: 'Funnel' },
  { href: '/events', label: 'Events' },
  { href: '/traffic', label: 'Traffic' },
]

export function Navigation() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-1">
      {navItems.map((item) => {
        const isActive = item.href === '/'
          ? pathname === '/'
          : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              isActive
                ? 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] font-medium'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-card)]'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
