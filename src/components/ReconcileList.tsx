'use client'

import { useState, useEffect, useRef } from 'react'

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

interface CustomerResult {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  funnel_status: string
  linkedin_company: string | null
  linkedin_title: string | null
}

interface RowState {
  query: string
  results: CustomerResult[]
  showDropdown: boolean
  selected: CustomerResult | null
  cohort: string
  submitting: boolean
  result: { ok: boolean; message: string } | null
}

const initialRow = (): RowState => ({
  query: '',
  results: [],
  showDropdown: false,
  selected: null,
  cohort: '',
  submitting: false,
  result: null,
})

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatAmount(cents: number, currency: string): string {
  return `${currency.toUpperCase()} ${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function ReconcileList({ payments }: { payments: UnmatchedPayment[] }) {
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(payments.map((p) => [p.id, initialRow()]))
  )

  function updateRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  return (
    <div className="space-y-4">
      {payments.map((payment) => (
        <PaymentRow
          key={payment.id}
          payment={payment}
          state={rows[payment.id]}
          onChange={(patch) => updateRow(payment.id, patch)}
        />
      ))}
    </div>
  )
}

function PaymentRow({
  payment,
  state,
  onChange,
}: {
  payment: UnmatchedPayment
  state: RowState
  onChange: (patch: Partial<RowState>) => void
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stripeEmail =
    (payment.metadata?.stripe_email as string | undefined) || '—'
  const piId = payment.stripe_payment_intent_id

  // Debounced customer search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!state.query || state.query.length < 2) {
      onChange({ results: [], showDropdown: false })
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/customers/search?q=${encodeURIComponent(state.query)}`
        )
        if (res.ok) {
          const data: CustomerResult[] = await res.json()
          onChange({ results: data, showDropdown: data.length > 0 })
        }
      } catch {
        onChange({ results: [], showDropdown: false })
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.query])

  async function handleReconcile() {
    if (!state.selected) return
    onChange({ submitting: true, result: null })
    try {
      const res = await fetch('/api/payments/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: payment.id,
          customer_id: state.selected.id,
          cohort: state.cohort.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        onChange({
          submitting: false,
          result: {
            ok: true,
            message: `Linked to ${data.customer_name} (${data.customer_email}) — enrolled in ${data.cohort}. Welcome email queued.`,
          },
        })
      } else {
        onChange({
          submitting: false,
          result: {
            ok: false,
            message: data.error || data.details || 'Reconcile failed',
          },
        })
      }
    } catch (err) {
      onChange({
        submitting: false,
        result: { ok: false, message: String(err) },
      })
    }
  }

  // Reconciled state — show success, hide form
  if (state.result?.ok) {
    return (
      <div className="rounded-lg border border-[#5B9A8B] bg-[var(--color-card)] p-5 opacity-90">
        <div className="flex items-start gap-3">
          <div className="text-[#5B9A8B] text-xl leading-6">✓</div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              {formatAmount(payment.amount_cents, payment.currency)} from{' '}
              <span className="font-mono">{stripeEmail}</span>
            </p>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {state.result.message}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: payment details */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="text-lg font-semibold text-[var(--color-text-primary)]">
              {formatAmount(payment.amount_cents, payment.currency)}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {payment.product || 'Kith Climate'} · {formatDate(payment.paid_at)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
              Stripe billing email
            </p>
            <p className="text-sm font-mono text-[var(--color-text-primary)] break-all">
              {stripeEmail}
            </p>
          </div>
          {piId && (
            <div>
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                Payment intent
              </p>
              <a
                href={`https://dashboard.stripe.com/payments/${piId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-[#5B9A8B] hover:underline break-all"
              >
                {piId}
              </a>
            </div>
          )}
        </div>

        {/* Right: reconcile form */}
        <div className="space-y-3">
          <div className="relative">
            <label className="block text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
              Link to customer
            </label>
            {state.selected ? (
              <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                <div>
                  <p className="text-sm text-[var(--color-text-primary)]">
                    {state.selected.first_name} {state.selected.last_name}
                  </p>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    {state.selected.email} · {state.selected.funnel_status}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      selected: null,
                      query: '',
                      results: [],
                      showDropdown: false,
                    })
                  }
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={state.query}
                  onChange={(e) => onChange({ query: e.target.value })}
                  onFocus={() =>
                    state.results.length > 0 && onChange({ showDropdown: true })
                  }
                  onBlur={() =>
                    setTimeout(() => onChange({ showDropdown: false }), 150)
                  }
                  placeholder="Search by name or email…"
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[#5B9A8B]"
                />
                {state.showDropdown && state.results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-card)] shadow-lg">
                    {state.results.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          onChange({
                            selected: c,
                            query: '',
                            results: [],
                            showDropdown: false,
                          })
                        }
                        className="block w-full text-left px-3 py-2 hover:bg-[var(--color-surface)] border-b border-[var(--color-border)] last:border-b-0"
                      >
                        <p className="text-sm text-[var(--color-text-primary)]">
                          {c.first_name} {c.last_name}
                        </p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          {c.email} · {c.funnel_status}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="block text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
              Cohort{' '}
              <span className="text-[var(--color-text-muted)] normal-case">
                (optional — defaults to current)
              </span>
            </label>
            <input
              type="text"
              value={state.cohort}
              onChange={(e) => onChange({ cohort: e.target.value })}
              placeholder="e.g. May 18th 2026"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[#5B9A8B]"
            />
          </div>

          <button
            type="button"
            onClick={handleReconcile}
            disabled={!state.selected || state.submitting}
            className="w-full rounded-md bg-[#5B9A8B] px-4 py-2 text-sm font-medium text-white hover:bg-[#6FB3A2] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {state.submitting ? 'Reconciling…' : 'Reconcile & Enrol'}
          </button>

          {state.result && !state.result.ok && (
            <p className="text-xs text-[#D97706]">{state.result.message}</p>
          )}
        </div>
      </div>
    </div>
  )
}
