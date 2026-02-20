'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PendingInterviewsModal } from './PendingInterviewsModal'

interface PendingInterviewsButtonProps {
  count: number
}

export function PendingInterviewsButton({ count }: PendingInterviewsButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const router = useRouter()

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgba(217,119,6,0.15)] text-[#D97706] border border-[rgba(217,119,6,0.3)] hover:bg-[rgba(217,119,6,0.25)] transition-colors text-sm font-medium shadow-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M3.6 15.4 10.2 4.2a2 2 0 0 1 3.6 0l6.6 11.2A2 2 0 0 1 18.6 18H5.4a2 2 0 0 1-1.8-2.6Z" />
        </svg>
        Review Recordings
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[rgba(217,119,6,0.25)] text-xs font-bold">
          {count}
        </span>
      </button>

      {showModal && (
        <PendingInterviewsModal
          onClose={() => setShowModal(false)}
          onUpdated={() => {
            router.refresh()
          }}
        />
      )}
    </>
  )
}
