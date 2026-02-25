import { getSupabase } from '@/lib/supabase'
import { Header } from '@/components/Header'
import { TemplateAutomationTable } from '@/components/TemplateAutomationTable'
import { PendingEmailsButton } from '@/components/PendingEmailsButton'

export const dynamic = 'force-dynamic'

async function getMailingData() {
  const supabase = getSupabase()

  // Fetch all email templates
  const { data: templates, error: templatesError } = await supabase
    .from('email_templates')
    .select('id, name, subject, funnel_trigger, is_active')
    .order('name', { ascending: true })

  if (templatesError) {
    console.error('Failed to fetch templates:', templatesError)
  }

  // Count pending emails (head-only query)
  let pendingCount = 0
  try {
    const { count, error } = await supabase
      .from('pending_emails')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    if (!error && count !== null) pendingCount = count
  } catch {
    // Non-critical
  }

  return {
    templates: templates ?? [],
    pendingCount,
  }
}

export default async function MailingPage() {
  const { templates, pendingCount } = await getMailingData()

  const activeCount = templates.filter(t => t.is_active === 'active').length
  const partialCount = templates.filter(t => t.is_active === 'partial').length

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
              Mailing
            </h1>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              Manage email automations and review pending sends
            </p>
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <PendingEmailsButton count={pendingCount} />
            )}
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Templates</p>
            <p className="text-2xl font-semibold text-[var(--color-text-primary)] mt-1">{templates.length}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Active Automations</p>
            <p className="text-2xl font-semibold text-[#5B9A8B] mt-1">{activeCount + partialCount}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {activeCount} auto-send · {partialCount} approval
            </p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">Pending Approvals</p>
            <p className={`text-2xl font-semibold mt-1 ${pendingCount > 0 ? 'text-[#D97706]' : 'text-[var(--color-text-primary)]'}`}>
              {pendingCount}
            </p>
          </div>
        </div>

        {/* Template Automation Table */}
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]">
          <div className="px-6 py-4 border-b border-[var(--color-border)]">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Email Templates
            </h2>
            <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
              Control which templates auto-send, require approval, or are disabled
            </p>
          </div>
          <TemplateAutomationTable templates={templates} />
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
