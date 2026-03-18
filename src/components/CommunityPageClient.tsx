'use client'

import { useState } from 'react'
import { Customer, DiscordMember, DiscordStatus } from '@/lib/supabase'

type Props = {
  enrolledCustomers: Customer[]
  discordMembers: DiscordMember[]
}

const DISCORD_STATUS_LABELS: Record<DiscordStatus, string> = {
  not_invited: 'Not Invited',
  invited: 'Invited',
  joined: 'Joined',
  roles_assigned: 'Roles Assigned',
}

const DISCORD_STATUS_COLORS: Record<DiscordStatus, string> = {
  not_invited: 'bg-[rgba(232,230,227,0.1)] text-[var(--color-text-secondary)]',
  invited: 'bg-[rgba(107,141,214,0.15)] text-[#6B8DD6]',
  joined: 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B]',
  roles_assigned: 'bg-[rgba(91,154,139,0.25)] text-[#6FB3A2]',
}

function StatusBadge({ status }: { status: DiscordStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${DISCORD_STATUS_COLORS[status]}`}>
      {DISCORD_STATUS_LABELS[status]}
    </span>
  )
}

export function CommunityPageClient({ enrolledCustomers, discordMembers }: Props) {
  const [matchingMemberId, setMatchingMemberId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'enrollees' | 'unmatched'>('enrollees')

  // Derive data
  const matchedDiscordIds = new Set(
    discordMembers.filter(dm => dm.customer_id).map(dm => dm.customer_id)
  )
  const unmatchedMembers = discordMembers.filter(dm => !dm.customer_id)

  // Summary stats
  const totalEnrolled = enrolledCustomers.length
  const joinedCount = enrolledCustomers.filter(c => c.discord_status === 'joined' || c.discord_status === 'roles_assigned').length
  const rolesAssignedCount = enrolledCustomers.filter(c => c.discord_status === 'roles_assigned').length
  const notInvitedCount = enrolledCustomers.filter(c => !c.discord_status || c.discord_status === 'not_invited').length

  // For the enrollee table, find matched discord member for each customer
  const discordByCustomerId = new Map<string, DiscordMember>()
  discordMembers.forEach(dm => {
    if (dm.customer_id) discordByCustomerId.set(dm.customer_id, dm)
  })

  // Filter enrollees by search
  const filteredEnrollees = enrolledCustomers.filter(c => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase()
    return name.includes(q) || c.email.toLowerCase().includes(q)
  })

  // Filter unmatched by search, sort by most recent join first
  const filteredUnmatched = unmatchedMembers
    .filter(dm => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return dm.discord_username.toLowerCase().includes(q) ||
        (dm.discord_display_name || '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const aDate = a.joined_server_at || a.created_at
      const bDate = b.joined_server_at || b.created_at
      return new Date(bDate).getTime() - new Date(aDate).getTime()
    })

  async function handleMatch(discordMemberId: string, customerId: string) {
    setSaving(true)
    try {
      const res = await fetch('/api/community/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discord_member_id: discordMemberId, customer_id: customerId }),
      })
      if (!res.ok) throw new Error('Match failed')
      // Reload to get fresh data
      window.location.reload()
    } catch (err) {
      console.error('Match error:', err)
      alert('Failed to save match. Check console for details.')
    } finally {
      setSaving(false)
    }
  }

  async function handleUnmatch(discordMemberId: string) {
    if (!confirm('Remove this Discord match?')) return
    setSaving(true)
    try {
      const res = await fetch('/api/community/unmatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discord_member_id: discordMemberId }),
      })
      if (!res.ok) throw new Error('Unmatch failed')
      window.location.reload()
    } catch (err) {
      console.error('Unmatch error:', err)
      alert('Failed to unmatch. Check console for details.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="kith-card p-4">
          <div className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider">Enrolled</div>
          <div className="text-2xl font-semibold text-[var(--color-text-primary)] mt-1">{totalEnrolled}</div>
        </div>
        <div className="kith-card p-4">
          <div className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider">In Discord</div>
          <div className="text-2xl font-semibold text-[#5B9A8B] mt-1">{joinedCount}</div>
        </div>
        <div className="kith-card p-4">
          <div className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider">Roles Assigned</div>
          <div className="text-2xl font-semibold text-[#6FB3A2] mt-1">{rolesAssignedCount}</div>
        </div>
        <div className="kith-card p-4">
          <div className="text-xs text-[var(--color-text-tertiary)] uppercase tracking-wider">Not Yet Invited</div>
          <div className="text-2xl font-semibold text-[var(--color-text-secondary)] mt-1">{notInvitedCount}</div>
        </div>
      </div>

      {/* Unmatched Discord alert */}
      {unmatchedMembers.length > 0 && (
        <div className="kith-card p-4 border-[rgba(107,141,214,0.3)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[#6B8DD6] animate-pulse" />
              <span className="text-sm text-[var(--color-text-primary)]">
                <strong>{unmatchedMembers.length}</strong> Discord member{unmatchedMembers.length !== 1 ? 's' : ''} not yet matched to a cohort enrollee
              </span>
            </div>
            <button
              onClick={() => setTab('unmatched')}
              className="text-xs text-[#6B8DD6] hover:text-[#8BAAE8] transition-colors"
            >
              Review &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Tabs + Search */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <button
            onClick={() => setTab('enrollees')}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              tab === 'enrollees'
                ? 'bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] font-medium'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Enrolled ({totalEnrolled})
          </button>
          <button
            onClick={() => setTab('unmatched')}
            className={`px-3 py-1.5 rounded text-sm transition-colors ${
              tab === 'unmatched'
                ? 'bg-[rgba(107,141,214,0.15)] text-[#6B8DD6] font-medium'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            Unmatched Discord ({unmatchedMembers.length})
          </button>
        </div>
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-1.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-hover)] w-64"
        />
      </div>

      {/* Enrollee Tab */}
      {tab === 'enrollees' && (
        <div className="kith-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Discord</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Roles</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEnrollees.map(customer => {
                const dm = discordByCustomerId.get(customer.id)
                const status: DiscordStatus = customer.discord_status || 'not_invited'
                return (
                  <tr key={customer.id} className="border-b border-[var(--color-border-subtle)] hover:bg-[rgba(232,230,227,0.02)]">
                    <td className="px-4 py-3 text-[var(--color-text-primary)]">
                      {customer.first_name} {customer.last_name}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)] font-mono text-xs">
                      {customer.email}
                    </td>
                    <td className="px-4 py-3">
                      {dm ? (
                        <div className="flex items-center gap-2">
                          {dm.discord_avatar_url && (
                            <img src={dm.discord_avatar_url} alt="" className="w-5 h-5 rounded-full" />
                          )}
                          <span className="text-[var(--color-text-primary)]">{dm.discord_display_name || dm.discord_username}</span>
                          <span className="text-[var(--color-text-muted)] text-xs">@{dm.discord_username}</span>
                        </div>
                      ) : (
                        <span className="text-[var(--color-text-muted)] text-xs italic">Not linked</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">
                      {dm?.roles?.length ? dm.roles.join(', ') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {dm ? (
                        <button
                          onClick={() => handleUnmatch(dm.id)}
                          disabled={saving}
                          className="text-xs text-[var(--color-text-muted)] hover:text-red-400 transition-colors disabled:opacity-50"
                        >
                          Unlink
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setMatchingMemberId(null) // reset
                            setTab('unmatched')
                          }}
                          className="text-xs text-[#6B8DD6] hover:text-[#8BAAE8] transition-colors"
                        >
                          Match
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filteredEnrollees.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--color-text-muted)] text-sm">
                    No enrolled customers found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Unmatched Discord Tab */}
      {tab === 'unmatched' && (
        <div className="kith-card overflow-hidden">
          {filteredUnmatched.length === 0 ? (
            <div className="px-4 py-8 text-center text-[var(--color-text-muted)] text-sm">
              {unmatchedMembers.length === 0
                ? 'All Discord members have been matched'
                : 'No matches for search query'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Discord User</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Joined Server</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">Match to Enrollee</th>
                </tr>
              </thead>
              <tbody>
                {filteredUnmatched.map(dm => (
                  <tr key={dm.id} className="border-b border-[var(--color-border-subtle)] hover:bg-[rgba(232,230,227,0.02)]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {dm.discord_avatar_url && (
                          <img src={dm.discord_avatar_url} alt="" className="w-6 h-6 rounded-full" />
                        )}
                        <div>
                          <div className="text-[var(--color-text-primary)]">{dm.discord_display_name || dm.discord_username}</div>
                          <div className="text-[var(--color-text-muted)] text-xs">@{dm.discord_username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)] text-xs">
                      {dm.joined_server_at
                        ? new Date(dm.joined_server_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {matchingMemberId === dm.id ? (
                        <MatchDropdown
                          enrollees={enrolledCustomers.filter(c => !matchedDiscordIds.has(c.id))}
                          onSelect={(customerId) => handleMatch(dm.id, customerId)}
                          onCancel={() => setMatchingMemberId(null)}
                          saving={saving}
                        />
                      ) : (
                        <button
                          onClick={() => setMatchingMemberId(dm.id)}
                          className="text-xs text-[#5B9A8B] hover:text-[#6FB3A2] transition-colors"
                        >
                          Select enrollee &rarr;
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

function MatchDropdown({
  enrollees,
  onSelect,
  onCancel,
  saving,
}: {
  enrollees: Customer[]
  onSelect: (customerId: string) => void
  onCancel: () => void
  saving: boolean
}) {
  const [filter, setFilter] = useState('')

  const filtered = enrollees.filter(c => {
    if (!filter) return true
    const q = filter.toLowerCase()
    const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase()
    return name.includes(q) || c.email.toLowerCase().includes(q)
  })

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Filter enrollees..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          autoFocus
          className="bg-[var(--color-base)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-hover)] w-48"
        />
        <button
          onClick={onCancel}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        >
          Cancel
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto bg-[var(--color-base)] border border-[var(--color-border)] rounded">
        {filtered.length === 0 ? (
          <div className="px-2 py-2 text-xs text-[var(--color-text-muted)]">No unmatched enrollees</div>
        ) : (
          filtered.map(c => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              disabled={saving}
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-[rgba(91,154,139,0.1)] transition-colors disabled:opacity-50 flex justify-between items-center"
            >
              <span className="text-[var(--color-text-primary)]">{c.first_name} {c.last_name}</span>
              <span className="text-[var(--color-text-muted)] font-mono">{c.email}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
