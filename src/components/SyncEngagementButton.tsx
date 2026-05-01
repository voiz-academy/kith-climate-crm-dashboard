'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  slug: string
  organizationName: string
}

export function SyncEngagementButton({ slug, organizationName }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[rgba(91,154,139,0.15)] text-[#5B9A8B] border border-[rgba(91,154,139,0.3)] hover:bg-[rgba(91,154,139,0.25)] transition-colors flex-shrink-0"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        Sync from status.md
      </button>
      {open && (
        <SyncModal slug={slug} organizationName={organizationName} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function SyncModal({
  slug,
  organizationName,
  onClose,
}: {
  slug: string
  organizationName: string
  onClose: () => void
}) {
  const router = useRouter()
  const [markdown, setMarkdown] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    bodyChars: number
    keys: string[]
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  async function handleFile(file: File) {
    const text = await file.text()
    setMarkdown(text)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const res = await fetch('/api/engagements/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, markdown }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      setSuccess({
        bodyChars: data.applied?.body_chars ?? 0,
        keys: data.applied?.frontmatter_keys ?? [],
      })

      // Refresh the page data after a short pause so the user sees the success state
      setTimeout(() => {
        router.refresh()
        onClose()
      }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-card)] rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Sync {organizationName}
          </h2>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
            Paste or upload the contents of{' '}
            <code className="font-mono text-[11px] px-1 py-0.5 rounded bg-[var(--color-surface)]">
              {slug}/status.md
            </code>
            . Frontmatter will overwrite structured columns; the body becomes the rendered notes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-5 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                Markdown content
              </label>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.markdown,text/markdown,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFile(file)
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-[#5B9A8B] hover:text-[#6FB3A2] transition-colors"
                >
                  Upload .md file
                </button>
              </div>
            </div>
            <textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              required
              placeholder="---&#10;slug: example&#10;organization_name: Example Org&#10;stream: corporate_contract&#10;stage: discovery&#10;...&#10;---&#10;&#10;# Example Org&#10;&#10;## Context&#10;..."
              className="w-full h-80 px-3 py-2 rounded font-mono text-xs bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[#5B9A8B] resize-none"
            />
            {error && (
              <div className="mt-3 px-3 py-2 rounded text-xs bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#EF4444]">
                {error}
              </div>
            )}
            {success && (
              <div className="mt-3 px-3 py-2 rounded text-xs bg-[rgba(91,154,139,0.1)] border border-[rgba(91,154,139,0.3)] text-[#5B9A8B]">
                Synced — {success.keys.length} frontmatter keys, {success.bodyChars} body chars.
              </div>
            )}
          </div>

          <div className="p-5 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !markdown.trim() || !!success}
              className="px-3 py-1.5 rounded text-xs font-medium bg-[#5B9A8B] text-white hover:bg-[#6FB3A2] disabled:bg-[var(--color-surface)] disabled:text-[var(--color-text-muted)] disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Syncing…' : success ? 'Synced ✓' : 'Sync'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
