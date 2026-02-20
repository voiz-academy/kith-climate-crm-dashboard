'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AddInterviewModal } from './AddInterviewModal'

export function AddInterviewButton() {
  const [showModal, setShowModal] = useState(false)
  const router = useRouter()

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[#5B9A8B] transition-colors text-sm font-medium"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Interview
      </button>

      {showModal && (
        <AddInterviewModal
          onClose={() => setShowModal(false)}
          onCreated={() => router.refresh()}
        />
      )}
    </>
  )
}
