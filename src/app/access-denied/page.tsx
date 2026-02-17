import Image from 'next/image'
import { auth0 } from '@/lib/auth0'

export default async function AccessDeniedPage() {
  const session = await auth0.getSession()

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
      <div className="max-w-md w-full text-center space-y-6 px-4">
        <Image
          src="/kith-climate-wordmark.svg"
          alt="Kith Climate"
          width={160}
          height={36}
          className="mx-auto"
        />

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">
            Access Denied
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Your account{' '}
            <span className="font-mono text-[var(--color-text)]">
              {session?.user?.email ?? 'unknown'}
            </span>{' '}
            is not authorised to access the Kith Climate CRM.
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            If you believe this is an error, please contact the Kith team.
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 pt-4">
          <a
            href="/auth/logout"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md
                       bg-[var(--color-surface)] text-[var(--color-text)]
                       border border-[var(--color-border)]
                       hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            Sign out
          </a>
        </div>
      </div>
    </div>
  )
}
