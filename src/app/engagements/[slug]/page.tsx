import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSupabase, Engagement, ENGAGEMENT_STAGE_LABELS, ENGAGEMENT_STREAM_LABELS, engagementStageBadgeClasses } from '@/lib/supabase'
import { Navigation } from '@/components/Navigation'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { SyncEngagementButton } from '@/components/SyncEngagementButton'

export const revalidate = 60

async function getEngagement(slug: string): Promise<Engagement | null> {
  const client = getSupabase()
  const { data, error } = await client
    .from('engagements')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error(`Error fetching engagement ${slug}:`, error)
    return null
  }
  return data as Engagement | null
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRelative(value: string | null): string {
  if (!value) return '—'
  const then = new Date(value).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatCurrency(cents: number | null): string {
  if (cents === null || cents === undefined) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export default async function EngagementDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const engagement = await getEngagement(slug)

  if (!engagement) {
    notFound()
  }

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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <Link
          href="/engagements"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors mb-4"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Engagements
        </Link>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
                {engagement.organization_name}
              </h1>
              <span
                className={`px-2 py-0.5 inline-flex text-[11px] leading-4 font-medium rounded ${engagementStageBadgeClasses(
                  engagement.stage
                )}`}
              >
                {ENGAGEMENT_STAGE_LABELS[engagement.stage]}
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 uppercase tracking-wider">
              {ENGAGEMENT_STREAM_LABELS[engagement.stream]}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
              Synced{' '}
              <span className="text-[var(--color-text-secondary)]">
                {formatRelative(engagement.last_synced_at)}
              </span>
            </span>
            <SyncEngagementButton
              slug={engagement.slug}
              organizationName={engagement.organization_name}
            />
          </div>
        </div>

        {/* Metadata grid */}
        <div className="kith-card p-5 mb-6">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 text-xs">
            <MetaField label="Primary contact" value={engagement.primary_contact_name} />
            <MetaField label="Role" value={engagement.primary_contact_role} />
            <MetaField label="Email" value={engagement.primary_contact_email} email />
            <MetaField label="LinkedIn" value={engagement.primary_contact_linkedin} link />
            <MetaField label="Region" value={engagement.region} />
            <MetaField label="Owner" value={engagement.owner} />
            <MetaField label="Source" value={engagement.source} />
            <MetaField label="Last interaction" value={formatDate(engagement.last_interaction_at)} />
            <MetaField label="Expected close" value={formatDate(engagement.expected_close_date)} />
            <MetaField label="Expected value" value={formatCurrency(engagement.expected_value_cents)} />
            <MetaField label="Folder" value={engagement.folder_path} mono />
            <MetaField label="Slug" value={engagement.slug} mono />
            <MetaField label="Last synced" value={formatRelative(engagement.last_synced_at)} />
            <MetaField label="Updated" value={formatDate(engagement.updated_at)} />
          </dl>
        </div>

        {/* Proposals */}
        {engagement.proposals && engagement.proposals.length > 0 && (
          <div className="kith-card p-5 mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
              Proposal artifacts
            </h2>
            <ul className="space-y-1.5 text-sm">
              {engagement.proposals.map((path, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-[#5B9A8B] flex-shrink-0 mt-0.5">▸</span>
                  <code className="text-xs font-mono text-[var(--color-text-secondary)] break-all">
                    {path}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Markdown body */}
        {engagement.notes_markdown ? (
          <div className="kith-card p-6">
            <MarkdownRenderer source={engagement.notes_markdown} />
          </div>
        ) : (
          <div className="kith-card p-6 text-sm text-[var(--color-text-muted)]">
            No notes synced yet. Update <code className="font-mono text-xs">status.md</code> in the
            engagement folder, then sync to populate this view.
          </div>
        )}

        <footer className="mt-12 pt-6 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-muted)] text-center">Part of Kith AI Lab</p>
        </footer>
      </main>
    </div>
  )
}

function MetaField({
  label,
  value,
  email,
  link,
  mono,
}: {
  label: string
  value: string | null | undefined
  email?: boolean
  link?: boolean
  mono?: boolean
}) {
  function renderLinkLabel(url: string): string {
    // Pretty-print LinkedIn URLs: show the handle, not the full URL
    const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i)
    if (m) return `in/${m[1]}`
    try {
      const u = new URL(url)
      return u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '')
    } catch {
      return url
    }
  }

  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-[var(--color-text-primary)] ${
          mono ? 'font-mono text-[11px] break-all' : ''
        }`}
      >
        {value ? (
          email ? (
            <a
              href={`mailto:${value}`}
              className="text-[#5B9A8B] hover:text-[#6FB3A2] transition-colors"
            >
              {value}
            </a>
          ) : link ? (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#5B9A8B] hover:text-[#6FB3A2] transition-colors"
            >
              {renderLinkLabel(value)}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-[var(--color-text-muted)]">—</span>
        )}
      </dd>
    </div>
  )
}
