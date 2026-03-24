import { getSupabase } from '@/lib/supabase'
import { Header } from '@/components/Header'
import { CertificationsTable } from '@/components/CertificationsTable'

export const dynamic = 'force-dynamic'

async function getCertificationsData() {
  const supabase = getSupabase()

  // Fetch all certifications, newest first
  const { data: certifications, error: certError } = await supabase
    .from('certifications')
    .select('*')
    .order('created_at', { ascending: false })

  if (certError) {
    console.error('Failed to fetch certifications:', certError)
  }

  const certs = certifications ?? []

  // Count stats from fetched data
  const totalCount = certs.length
  const sentCount = certs.filter((c: { email_status: string }) => c.email_status === 'sent').length
  const pendingCount = certs.filter((c: { email_status: string }) => c.email_status === 'pending').length

  // Count testimonials (just the total)
  let testimonialCount = 0
  try {
    const { count, error } = await supabase
      .from('testimonials')
      .select('*', { count: 'exact', head: true })
    if (!error && count !== null) testimonialCount = count
  } catch {
    // Non-critical
  }

  return {
    certifications: certs,
    totalCount,
    sentCount,
    pendingCount,
    testimonialCount,
  }
}

export default async function CertificationsPage() {
  const { certifications, totalCount, sentCount, pendingCount, testimonialCount } =
    await getCertificationsData()

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Certifications
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            Manage certificates and send certification emails
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
              Total Certificates
            </p>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)] mt-1">
              {totalCount}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
              Emails Sent
            </p>
            <p className="text-2xl font-semibold text-[#5B9A8B] mt-1">
              {sentCount}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
              Emails Pending
            </p>
            <p className={`text-2xl font-semibold mt-1 ${pendingCount > 0 ? 'text-[#D97706]' : 'text-[var(--color-text-primary)]'}`}>
              {pendingCount}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
              Testimonials Received
            </p>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)] mt-1">
              {testimonialCount}
            </p>
          </div>
        </div>

        {/* Certifications Table */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]">
          <CertificationsTable certifications={certifications} />
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-muted)] text-center">
            Part of Kith AI Lab
          </p>
        </footer>
      </main>
    </div>
  )
}
