'use client'

import { WorkshopLead } from '@/lib/supabase'

interface LeadTableProps {
  leads: WorkshopLead[]
}

const leadTypeColors = {
  professional: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)]',
  pivoter: 'bg-[rgba(107,141,214,0.15)] text-[#6B8DD6] border border-[rgba(107,141,214,0.3)]',
  unknown: 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border border-[rgba(232,230,227,0.1)]',
}

const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'live.com', 'proton.me', 'protonmail.com', 'aol.com', 'me.com']

function getCompanyDisplay(lead: WorkshopLead): string {
  if (lead.linkedin_company) return lead.linkedin_company
  if (lead.company_domain && !personalDomains.includes(lead.company_domain)) {
    return lead.company_domain
  }
  return '-'
}

export function LeadTable({ leads }: LeadTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="px-6 py-3 text-left kith-label">
              Name
            </th>
            <th className="px-6 py-3 text-left kith-label">
              Title
            </th>
            <th className="px-6 py-3 text-left kith-label">
              Type
            </th>
            <th className="px-6 py-3 text-left kith-label">
              Company
            </th>
            <th className="px-6 py-3 text-left kith-label">
              Location
            </th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              className="border-b border-[var(--color-border-subtle)] hover:bg-[rgba(91,154,139,0.05)] transition-colors"
            >
              <td className="px-6 py-4 whitespace-nowrap">
                {lead.linkedin_url ? (
                  <a
                    href={lead.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-[#5B9A8B] hover:text-[#6FB3A2] transition-colors"
                  >
                    {lead.first_name} {lead.last_name}
                  </a>
                ) : (
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {lead.first_name} {lead.last_name}
                  </span>
                )}
              </td>
              <td className="px-6 py-4">
                <div className="text-sm text-[var(--color-text-secondary)] max-w-xs truncate">
                  {lead.linkedin_title || '-'}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-medium rounded ${leadTypeColors[lead.lead_type]}`}>
                  {lead.lead_type}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-[var(--color-text-secondary)]">
                  {getCompanyDisplay(lead)}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--color-text-tertiary)]">
                {lead.linkedin_location || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
