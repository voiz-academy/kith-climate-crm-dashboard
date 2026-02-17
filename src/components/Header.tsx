import Image from 'next/image'
import Link from 'next/link'
import { Navigation } from '@/components/Navigation'
import { UserMenu } from '@/components/UserMenu'
import { auth0 } from '@/lib/auth0'

export async function Header() {
  const session = await auth0.getSession()

  return (
    <header className="border-b border-[var(--color-border)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/">
              <Image
                src="/kith-climate-wordmark.svg"
                alt="Kith Climate"
                width={140}
                height={32}
                priority
              />
            </Link>
            <div className="h-6 w-px bg-[var(--color-border)]" />
            <Navigation />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[var(--color-text-muted)] font-mono">
              {new Date().toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <div className="h-4 w-px bg-[var(--color-border)]" />
            <UserMenu
              userName={session?.user?.name ?? null}
              userEmail={session?.user?.email ?? null}
            />
          </div>
        </div>
      </div>
    </header>
  )
}
