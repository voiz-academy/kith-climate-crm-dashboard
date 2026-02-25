'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PendingEmailsModal } from './PendingEmailsModal'

interface PendingEmailsButtonProps {
  count: number
}

export function PendingEmailsButton({ count }: PendingEmailsButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const router = useRouter()

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#5B9A8B] text-white hover:bg-[#4a8474] transition-colors text-sm font-medium shadow-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
        Review Emails
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-white/20 text-xs font-bold">
          {count}
        </span>
      </button>

      {showModal && (
        <PendingEmailsModal
          onClose={() => setShowModal(false)}
          onUpdated={() => {
            router.refresh()
          }}
        />
      )}
    </>
  )
}
