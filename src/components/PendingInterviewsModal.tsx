'use client'

import { useEffect, useState, useCallback } from 'react'

type PendingInterview = {
  id: string
  fathom_recording_id: number
  fathom_recording_url: string | null
  fathom_summary: string | null
  transcript: string | null
  interviewee_name: string | null
  interviewee_email: string | null
  interviewer: string | null
  conducted_at: string | null
  meeting_title: string | null
  calendar_invitees: Array<{
    name?: string
    email?: string
    is_external?: boolean
  }> | null
  recorded_by: {
    name?: string
    email?: string
  } | null
  classification_reason: string
  confidence_score: number | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

interface PendingInterviewsModalProps {
  onClose: () => void
  onUpdated?: () => void
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) return null
  const pct = Math.round(score * 100)
  const color = pct >= 60
    ? 'bg-[rgba(217,119,6,0.15)] text-[#D97706] border-[rgba(217,119,6,0.3)]'
    : 'bg-[rgba(239,68,68,0.15)] text-[#EF4444] border-[rgba(239,68,68,0.3)]'

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${color}`}>
      {pct}% confidence
    </span>
  )
}

function ReasonBadge({ reason }: { reason: string }) {
  const labels: Record<string, string> = {
    low_transcript_confidence: 'Low transcript confidence',
    no_transcript: 'No transcript available',
    short_transcript: 'Short transcript',
    few_interview_keywords: 'Few interview keywords',
    unbalanced_conversation: 'Unbalanced conversation',
    short_meeting: 'Short meeting',
  }
  const label = labels[reason] ?? reason.replace(/_/g, ' ')

  return (
    <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-[rgba(107,141,214,0.12)] text-[#6B8DD6] border border-[rgba(107,141,214,0.25)]">
      {label}
    </span>
  )
}

export function PendingInterviewsModal({ onClose, onUpdated }: PendingInterviewsModalProps) {
  const [items, setItems] = useState<PendingInterview[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [expandedTranscripts, setExpandedTranscripts] = useState<Set<string>>(new Set())

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pending-interviews')
      if (res.ok) {
        const data = await res.json()
        setItems(data)
      }
    } catch (err) {
      console.error('Failed to fetch pending interviews:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Fetch on mount
  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  async function handleAction(ids: string[], action: 'approve' | 'reject') {
    const endpoint = `/api/pending-interviews/${action}`

    if (ids.length === 1) {
      setProcessing(prev => new Set(prev).add(ids[0]))
    } else {
      setBulkProcessing(true)
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })

      if (res.ok) {
        setItems(prev => prev.filter(item => !ids.includes(item.id)))
        onUpdated?.()
      }
    } catch (err) {
      console.error(`Failed to ${action} pending interviews:`, err)
    } finally {
      if (ids.length === 1) {
        setProcessing(prev => {
          const next = new Set(prev)
          next.delete(ids[0])
          return next
        })
      } else {
        setBulkProcessing(false)
      }
    }
  }

  function toggleTranscript(id: string) {
    setExpandedTranscripts(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const allIds = items.map(item => item.id)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-card)] rounded-lg shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)] shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Pending Interview Recordings
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {loading
                ? 'Loading...'
                : `${items.length} recording${items.length !== 1 ? 's' : ''} flagged for review`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Bulk Actions */}
        {items.length > 0 && (
          <div className="flex items-center gap-3 px-6 py-3 border-b border-[var(--color-border)] shrink-0">
            <button
              onClick={() => handleAction(allIds, 'approve')}
              disabled={bulkProcessing}
              className="px-4 py-1.5 text-sm font-medium rounded bg-[#5B9A8B] text-white hover:bg-[#4a8474] disabled:opacity-50 transition-colors"
            >
              {bulkProcessing ? 'Processing...' : `Approve All (${items.length})`}
            </button>
            <button
              onClick={() => handleAction(allIds, 'reject')}
              disabled={bulkProcessing}
              className="px-4 py-1.5 text-sm font-medium rounded border border-[rgba(239,68,68,0.4)] text-[#EF4444] hover:bg-[rgba(239,68,68,0.1)] disabled:opacity-50 transition-colors"
            >
              Reject All
            </button>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#5B9A8B]" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[var(--color-text-muted)]">No pending recordings</p>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                All Fathom recordings have been reviewed
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <InterviewCard
                  key={item.id}
                  item={item}
                  isProcessing={processing.has(item.id)}
                  isTranscriptExpanded={expandedTranscripts.has(item.id)}
                  onToggleTranscript={() => toggleTranscript(item.id)}
                  onApprove={() => handleAction([item.id], 'approve')}
                  onReject={() => handleAction([item.id], 'reject')}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InterviewCard({
  item,
  isProcessing,
  isTranscriptExpanded,
  onToggleTranscript,
  onApprove,
  onReject,
}: {
  item: PendingInterview
  isProcessing: boolean
  isTranscriptExpanded: boolean
  onToggleTranscript: () => void
  onApprove: () => void
  onReject: () => void
}) {
  const intervieweeName = item.interviewee_name || item.interviewee_email || 'Unknown interviewee'
  const hasTranscript = !!item.transcript
  const hasSummary = !!item.fathom_summary

  // Build a short transcript preview (first 3 lines)
  const transcriptPreview = item.transcript
    ? item.transcript.split('\n').slice(0, 3).join('\n')
    : null

  // Build a short summary preview (first 200 chars)
  const summaryPreview = item.fathom_summary
    ? item.fathom_summary.length > 200
      ? item.fathom_summary.slice(0, 200) + '...'
      : item.fathom_summary
    : null

  return (
    <div className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 ${isProcessing ? 'opacity-50' : ''}`}>
      {/* Top row: interviewee info + actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {intervieweeName}
            </span>
            <ConfidenceBadge score={item.confidence_score} />
            <ReasonBadge reason={item.classification_reason} />
          </div>
          {item.interviewee_name && item.interviewee_email && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {item.interviewee_email}
            </p>
          )}
        </div>

        {/* Per-item actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onApprove}
            disabled={isProcessing}
            className="px-3 py-1 text-xs font-medium rounded bg-[#5B9A8B] text-white hover:bg-[#4a8474] disabled:opacity-50 transition-colors"
            title="Approve — insert into interviews"
          >
            Approve
          </button>
          <button
            onClick={onReject}
            disabled={isProcessing}
            className="px-3 py-1 text-xs font-medium rounded border border-[rgba(239,68,68,0.4)] text-[#EF4444] hover:bg-[rgba(239,68,68,0.1)] disabled:opacity-50 transition-colors"
            title="Reject — discard this recording"
          >
            Reject
          </button>
        </div>
      </div>

      {/* Meeting details row */}
      <div className="mt-2 text-xs text-[var(--color-text-muted)] space-y-0.5">
        {item.meeting_title && (
          <p>
            <span className="font-medium">Meeting:</span> {item.meeting_title}
          </p>
        )}
        <div className="flex items-center gap-4">
          {item.interviewer && (
            <p>
              <span className="font-medium">Interviewer:</span> {item.interviewer}
            </p>
          )}
          {item.conducted_at && (
            <p>
              <span className="font-medium">Date:</span> {formatDateTime(item.conducted_at)}
            </p>
          )}
        </div>
        {item.fathom_recording_url && (
          <p>
            <span className="font-medium">Recording:</span>{' '}
            <a
              href={item.fathom_recording_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#5B9A8B] hover:underline"
            >
              View on Fathom
            </a>
          </p>
        )}
      </div>

      {/* Summary preview */}
      {summaryPreview && (
        <div className="mt-3 p-3 rounded bg-[var(--color-card)] border border-[var(--color-border)]">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
            AI Summary
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed">
            {summaryPreview}
          </p>
        </div>
      )}

      {/* Transcript preview / toggle */}
      {hasTranscript && (
        <div className="mt-2">
          <button
            onClick={onToggleTranscript}
            className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors flex items-center gap-1"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${isTranscriptExpanded ? 'rotate-90' : ''}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Transcript {isTranscriptExpanded ? '(click to collapse)' : '(click to preview)'}
          </button>

          {isTranscriptExpanded ? (
            <div className="mt-1 p-3 rounded bg-[var(--color-card)] border border-[var(--color-border)] max-h-48 overflow-y-auto">
              <pre className="text-[11px] text-[var(--color-text-secondary)] whitespace-pre-wrap font-mono leading-relaxed">
                {item.transcript}
              </pre>
            </div>
          ) : transcriptPreview ? (
            <div className="mt-1 p-2 rounded bg-[var(--color-card)] border border-[var(--color-border)]">
              <pre className="text-[11px] text-[var(--color-text-muted)] whitespace-pre-wrap font-mono leading-relaxed">
                {transcriptPreview}...
              </pre>
            </div>
          ) : null}
        </div>
      )}

      {!hasTranscript && !hasSummary && (
        <div className="mt-2 text-xs text-[var(--color-text-muted)] italic">
          No transcript or summary available for this recording
        </div>
      )}

      {/* Footer timestamp */}
      <p className="text-[10px] text-[var(--color-text-muted)] mt-2">
        Queued {formatDate(item.created_at)}
      </p>
    </div>
  )
}
