'use client'

import { useState } from 'react'
import { FUNNEL_LABELS, type FunnelStatus } from '@/lib/supabase'

type Template = {
  id: string
  name: string
  subject: string
  funnel_trigger: string | null
  is_active: 'active' | 'partial' | 'inactive'
}

interface TemplateAutomationTableProps {
  templates: Template[]
}

const statusOptions: { value: 'active' | 'partial' | 'inactive'; label: string; description: string }[] = [
  { value: 'active', label: 'Active', description: 'Auto-sends immediately' },
  { value: 'partial', label: 'Partial', description: 'Requires approval' },
  { value: 'inactive', label: 'Inactive', description: 'Disabled' },
]

const statusColors: Record<string, string> = {
  active: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border-[rgba(91,154,139,0.4)]',
  partial: 'bg-[rgba(217,119,6,0.15)] text-[#D97706] border-[rgba(217,119,6,0.4)]',
  inactive: 'bg-[rgba(232,230,227,0.05)] text-[rgba(232,230,227,0.5)] border-[rgba(232,230,227,0.15)]',
}

export function TemplateAutomationTable({ templates: initialTemplates }: TemplateAutomationTableProps) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [updating, setUpdating] = useState<Set<string>>(new Set())

  async function handleStatusChange(templateId: string, newStatus: 'active' | 'partial' | 'inactive') {
    setUpdating(prev => new Set(prev).add(templateId))

    try {
      const res = await fetch('/api/emails/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: templateId, is_active: newStatus }),
      })

      if (res.ok) {
        setTemplates(prev =>
          prev.map(t => (t.id === templateId ? { ...t, is_active: newStatus } : t))
        )
      }
    } catch (err) {
      console.error('Failed to update template status:', err)
    } finally {
      setUpdating(prev => {
        const next = new Set(prev)
        next.delete(templateId)
        return next
      })
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
              Template
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
              Subject
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
              Trigger
            </th>
            <th className="text-left py-3 px-4 text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {templates.map((template) => {
            const isUpdating = updating.has(template.id)
            const triggerLabel = template.funnel_trigger
              ? FUNNEL_LABELS[template.funnel_trigger as FunnelStatus] ?? template.funnel_trigger
              : '—'

            return (
              <tr
                key={template.id}
                className={`border-b border-[var(--color-border)] last:border-b-0 ${isUpdating ? 'opacity-50' : ''}`}
              >
                <td className="py-3 px-4">
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {template.name}
                  </span>
                </td>
                <td className="py-3 px-4 text-[var(--color-text-secondary)] max-w-xs truncate">
                  {template.subject}
                </td>
                <td className="py-3 px-4">
                  {template.funnel_trigger ? (
                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-[rgba(107,141,214,0.12)] text-[#6B8DD6] border border-[rgba(107,141,214,0.25)]">
                      {triggerLabel}
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1">
                    {statusOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleStatusChange(template.id, option.value)}
                        disabled={isUpdating}
                        title={option.description}
                        className={`px-2.5 py-1 text-xs font-medium rounded border transition-all ${
                          template.is_active === option.value
                            ? statusColors[option.value]
                            : 'bg-transparent text-[var(--color-text-muted)] border-transparent hover:border-[var(--color-border)] hover:text-[var(--color-text-secondary)]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
