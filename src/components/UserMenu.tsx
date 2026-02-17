'use client'

interface UserMenuProps {
  userName: string | null
  userEmail: string | null
}

export function UserMenu({ userName, userEmail }: UserMenuProps) {
  const displayName = userName || userEmail || 'User'

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--color-text-secondary)] font-mono">
        {displayName}
      </span>
      <a
        href="/auth/logout"
        className="text-xs px-2.5 py-1 rounded transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-card)]"
      >
        Logout
      </a>
    </div>
  )
}
