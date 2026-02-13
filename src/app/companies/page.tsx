import Image from 'next/image'
import Link from 'next/link'
import { fetchAll, Customer, WorkshopRegistration } from '@/lib/supabase'
import { Navigation } from '@/components/Navigation'

type CompanyData = {
  name: string
  leadCount: number
  professionals: number
  pivoters: number
  totalAttendances: number
  leads: Array<{
    name: string
    title: string | null
    type: string
    linkedin_url: string | null
  }>
}

async function getCompaniesData(): Promise<CompanyData[]> {
  const leads = await fetchAll<Customer>('customers')
  const registrations = await fetchAll<WorkshopRegistration>('workshop_registrations')

  // Build map of lead_id to attended count
  const attendedCountMap = new Map<string, number>()
  registrations.forEach((reg: WorkshopRegistration) => {
    if (reg.attended) {
      attendedCountMap.set(reg.customer_id, (attendedCountMap.get(reg.customer_id) || 0) + 1)
    }
  })

  // Aggregate by company
  const companyMap = new Map<string, CompanyData>()
  const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'live.com', 'proton.me', 'protonmail.com', 'aol.com', 'me.com']

  leads.forEach((lead: Customer) => {
    // Get company name
    let company = lead.linkedin_company
    if (!company && lead.company_domain && !personalDomains.includes(lead.company_domain)) {
      company = lead.company_domain
    }
    if (!company) return // Skip leads without company

    if (!companyMap.has(company)) {
      companyMap.set(company, {
        name: company,
        leadCount: 0,
        professionals: 0,
        pivoters: 0,
        totalAttendances: 0,
        leads: []
      })
    }

    const data = companyMap.get(company)!
    data.leadCount++
    if (lead.lead_type === 'professional') data.professionals++
    if (lead.lead_type === 'pivoter') data.pivoters++
    data.totalAttendances += attendedCountMap.get(lead.id) || 0
    data.leads.push({
      name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
      title: lead.linkedin_title,
      type: lead.lead_type,
      linkedin_url: lead.linkedin_url
    })
  })

  // Sort by lead count descending
  return Array.from(companyMap.values())
    .sort((a, b) => b.leadCount - a.leadCount)
}

export const revalidate = 60

export default async function CompaniesPage() {
  const companies = await getCompaniesData()

  const totalCompanies = companies.length
  const companiesWithMultiple = companies.filter(c => c.leadCount > 1).length

  return (
    <div className="min-h-screen">
      {/* Header */}
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
                minute: '2-digit'
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Companies
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
            {totalCompanies} companies represented &bull; {companiesWithMultiple} with multiple attendees
          </p>
        </div>

        {/* Companies list */}
        <div className="space-y-4">
          {companies.map((company) => (
            <CompanyCard key={company.name} company={company} />
          ))}
          {companies.length === 0 && (
            <div className="kith-card p-12 text-center text-[var(--color-text-muted)]">
              No company data found
            </div>
          )}
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

function CompanyCard({ company }: { company: CompanyData }) {
  const showExpanded = company.leadCount > 1

  return (
    <div className="kith-card">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
              {company.name}
            </h3>
            <div className="flex items-center gap-4 mt-1 text-sm text-[var(--color-text-secondary)]">
              <span>{company.leadCount} {company.leadCount === 1 ? 'lead' : 'leads'}</span>
              {company.professionals > 0 && (
                <span className="text-[#5B9A8B]">{company.professionals} professional</span>
              )}
              {company.pivoters > 0 && (
                <span className="text-[#6B8DD6]">{company.pivoters} pivoter</span>
              )}
              {company.totalAttendances > 0 && (
                <span>{company.totalAttendances} total attendances</span>
              )}
            </div>
          </div>
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-surface)] text-[var(--color-text-secondary)] text-lg font-semibold">
            {company.leadCount}
          </span>
        </div>

        {showExpanded && (
          <div className="mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {company.leads.map((lead, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  {lead.linkedin_url ? (
                    <a
                      href={lead.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#5B9A8B] hover:text-[#6FB3A2] transition-colors font-medium"
                    >
                      {lead.name}
                    </a>
                  ) : (
                    <span className="text-[var(--color-text-primary)]">{lead.name}</span>
                  )}
                  {lead.title && (
                    <span className="text-[var(--color-text-muted)] truncate">
                      - {lead.title}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
