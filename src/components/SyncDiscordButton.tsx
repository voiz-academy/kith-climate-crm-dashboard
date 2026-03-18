'use client'

import { useState } from 'react'

export function SyncDiscordButton() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<{
    total_discord_members: number
    inserted: number
    updated: number
    skipped: number
  } | null>(null)

  async function handleSync() {
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch('/api/community/sync-discord', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Sync failed')
      }
      const data = await res.json()
      setResult(data)
      // Reload after a short delay so user can see the result
      setTimeout(() => window.location.reload(), 2000)
    } catch (err) {
      alert(`Discord sync failed: ${err}`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="px-3 py-1.5 rounded text-sm font-medium bg-[rgba(107,141,214,0.15)] text-[#6B8DD6] hover:bg-[rgba(107,141,214,0.25)] transition-colors disabled:opacity-50"
      >
        {syncing ? 'Syncing...' : 'Sync Discord'}
      </button>
      {result && (
        <span className="text-xs text-[var(--color-text-secondary)]">
          {result.total_discord_members} members — {result.inserted} new, {result.updated} updated
        </span>
      )}
    </div>
  )
}
