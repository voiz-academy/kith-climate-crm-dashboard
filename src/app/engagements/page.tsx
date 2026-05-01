import Image from 'next/image'
import Link from 'next/link'
import { fetchAll, Engagement } from '@/lib/supabase'
import { Navigation } from '@/components/Navigation'
import { EngagementsView } from '@/components/EngagementsView'

export const revalidate = 60

async function getEngagements(): Promise<Engagement[]> {
  return await fetchAll<Engagement>('engagements', {
    orderBy: 'organization_name',
    ascending: true,
  })
}

export default async function EngagementsPage() {
  const engagements = await getEngagements()

  return (
    <div className="min-h-screen">
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
            <div className="text-xs text-[var(--color-text-muted)] font-mono">
              {new Date().toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <EngagementsView engagements={engagements} />

        <footer className="mt-12 pt-6 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-muted)] text-center">Part of Kith AI Lab</p>
        </footer>
      </main>
    </div>
  )
}
