import { getSupabase } from '@/lib/supabase'
import { Header } from '@/components/Header'
import { TestimonialsTable } from '@/components/TestimonialsTable'

export const dynamic = 'force-dynamic'

async function getTestimonialsData() {
  const supabase = getSupabase()

  // Fetch all testimonials ordered by submitted_at desc (nulls last — pending ones at the end)
  const { data: testimonials, error } = await supabase
    .from('testimonials')
    .select('*')
    .order('submitted_at', { ascending: false, nullsFirst: false })

  if (error) {
    console.error('Failed to fetch testimonials:', error)
  }

  const allTestimonials = testimonials ?? []

  // Count by status
  const counts = {
    total: allTestimonials.length,
    pending: allTestimonials.filter(t => t.status === 'pending').length,
    submitted: allTestimonials.filter(t => t.status === 'submitted').length,
    approved: allTestimonials.filter(t => t.status === 'approved').length,
    rejected: allTestimonials.filter(t => t.status === 'rejected').length,
  }

  return { testimonials: allTestimonials, counts }
}

export default async function TestimonialsPage() {
  const { testimonials, counts } = await getTestimonialsData()

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Testimonials
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            Review and approve testimonials from certified graduates
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Total</p>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)] mt-1">{counts.total}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Awaiting Submission</p>
            <p className="text-2xl font-semibold text-[var(--color-text-secondary)] mt-1">{counts.pending}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Needs Review</p>
            <p className={`text-2xl font-semibold mt-1 ${counts.submitted > 0 ? 'text-[#D97706]' : 'text-[var(--color-text-primary)]'}`}>
              {counts.submitted}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Approved</p>
            <p className="text-2xl font-semibold text-[#5B9A8B] mt-1">{counts.approved}</p>
          </div>
        </div>

        {/* Testimonials Table */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]">
          <div className="px-6 py-4 border-b border-[var(--color-border)]">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              All Testimonials
            </h2>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              Click a row to expand and read the full testimonial
            </p>
          </div>
          <TestimonialsTable testimonials={testimonials} />
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
