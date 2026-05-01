import { getSupabase } from '@/lib/supabase'
import { Header } from '@/components/Header'
import { ReconcileList } from '@/components/ReconcileList'

export const dynamic = 'force-dynamic'

interface UnmatchedPayment {
  id: string
  amount_cents: number
  currency: string
  paid_at: string | null
  created_at: string
  product: string | null
  stripe_payment_intent_id: string | null
  stripe_checkout_session_id: string | null
  stripe_customer_id: string | null
  metadata: Record<string, unknown> | null
  reconciliation_status: string
}

async function getUnmatchedPayments(): Promise<UnmatchedPayment[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, amount_cents, currency, paid_at, created_at, product, ' +
        'stripe_payment_intent_id, stripe_checkout_session_id, stripe_customer_id, ' +
        'metadata, reconciliation_status'
    )
    .eq('reconciliation_status', 'unmatched_email')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch unmatched payments:', error)
    return []
  }

  return (data || []) as UnmatchedPayment[]
}

export default async function ReconcilePage() {
  const payments = await getUnmatchedPayments()
  const totalCents = payments.reduce((sum, p) => sum + (p.amount_cents || 0), 0)

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Reconcile Unmatched Payments
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            Stripe charges that arrived without a CRM customer match — usually
            because the billing email differs from the customer&apos;s contact
            email. Link each payment to the right customer to enrol them and
            queue the welcome email.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
              Unmatched Payments
            </p>
            <p
              className={`text-2xl font-semibold mt-1 ${
                payments.length > 0
                  ? 'text-[#D97706]'
                  : 'text-[var(--color-text-primary)]'
              }`}
            >
              {payments.length}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
              Total Amount
            </p>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)] mt-1">
              ${(totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-12 text-center">
            <p className="text-[var(--color-text-secondary)]">
              No unmatched payments. Every Stripe charge is linked to a customer.
            </p>
          </div>
        ) : (
          <ReconcileList payments={payments} />
        )}

        <footer className="mt-12 pt-6 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-muted)] text-center">
            Part of Kith AI Lab
          </p>
        </footer>
      </main>
    </div>
  )
}
