'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PendingChangesModal } from './PendingChangesModal'

interface PendingChangesButtonProps {
  count: number
}

export function PendingChangesButton({ count }: PendingChangesButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const router = useRouter()

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#5B9A8B] text-white hover:bg-[#4a8474] transition-colors text-sm font-medium shadow-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Review Changes
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-white/20 text-xs font-bold">
          {count}
        </span>
      </button>

      {showModal && (
        <PendingChangesModal
          onClose={() => setShowModal(false)}
          onUpdated={() => {
            // Refresh the server component data after approvals/rejections
            router.refresh()
          }}
        />
      )}
    </>
  )
}
