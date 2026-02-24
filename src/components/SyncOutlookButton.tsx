'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface SyncStats {
  emails_fetched: number
  interview_invites_found: number
  enrollment_invites_found: number
  smart_interview_detected: number
  smart_enrollment_detected: number
  emails_stored: number
  pending_changes_created: number
  already_at_or_past: number
  no_customer_found: number
  errors: string[]
}

export function SyncOutlookButton() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<SyncStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSync() {
    setSyncing(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/outlook/trigger-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days_back: 7 }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Sync failed')
        return
      }

      setResult(data)
      // Refresh the page data to pick up any new pending changes
      router.refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[#5B9A8B] transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {syncing ? (
          <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
            <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
          </svg>
        )}
        {syncing ? 'Syncing...' : 'Sync Outlook'}
      </button>

      {/* Result toast */}
      {(result || error) && (
        <div className="absolute top-full right-0 mt-2 z-50 w-72">
          <div className={`rounded-lg border shadow-lg p-3 text-sm ${
            error
              ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
              : 'bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-text-primary)]'
          }`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                {error ? (
                  <p>{error}</p>
                ) : result ? (
                  <div className="space-y-1">
                    <p className="font-medium">Sync Complete</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {result.emails_fetched} emails scanned
                    </p>
                    {result.interview_invites_found > 0 && (
                      <p className="text-xs">
                        {result.interview_invites_found} interview invite{result.interview_invites_found !== 1 ? 's' : ''}
                      </p>
                    )}
                    {result.enrollment_invites_found > 0 && (
                      <p className="text-xs">
                        {result.enrollment_invites_found} enrolment invite{result.enrollment_invites_found !== 1 ? 's' : ''}
                      </p>
                    )}
                    {(result.smart_interview_detected > 0 || result.smart_enrollment_detected > 0) && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {(result.smart_interview_detected || 0) + (result.smart_enrollment_detected || 0)} smart-detected
                      </p>
                    )}
                    {result.pending_changes_created > 0 && (
                      <p className="text-xs font-medium text-[#5B9A8B]">
                        {result.pending_changes_created} new pending change{result.pending_changes_created !== 1 ? 's' : ''}
                      </p>
                    )}
                    {result.pending_changes_created === 0 && result.emails_fetched > 0 && (
                      <p className="text-xs text-[var(--color-text-muted)]">No new changes to review</p>
                    )}
                  </div>
                ) : null}
              </div>
              <button
                onClick={() => { setResult(null); setError(null) }}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
