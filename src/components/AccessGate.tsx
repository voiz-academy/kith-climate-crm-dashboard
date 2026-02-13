'use client'

import { useState, useEffect } from 'react'

const ACCESS_KEY = 'kith2026'
const STORAGE_KEY = 'kith-access-granted'

export function AccessGate({ children }: { children: React.ReactNode }) {
  const [granted, setGranted] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // Check URL param first
    const params = new URLSearchParams(window.location.search)
    const keyParam = params.get('key')
    if (keyParam === ACCESS_KEY) {
      localStorage.setItem(STORAGE_KEY, 'true')
      setGranted(true)
      setChecking(false)
      // Clean the URL
      const url = new URL(window.location.href)
      url.searchParams.delete('key')
      window.history.replaceState({}, '', url.toString())
      return
    }

    // Check localStorage
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      setGranted(true)
    }
    setChecking(false)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input.trim() === ACCESS_KEY) {
      localStorage.setItem(STORAGE_KEY, 'true')
      setGranted(true)
      setError(false)
    } else {
      setError(true)
    }
  }

  if (checking) return null

  if (granted) return <>{children}</>

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(145deg, #1a1d21 0%, #1e2227 50%, #1a1d21 100%)' }}>
      <div className="kith-card p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Kith Climate CRM
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Enter access key to continue
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(false) }}
            placeholder="Access key"
            autoFocus
            className="w-full px-4 py-3 rounded-md text-sm outline-none"
            style={{
              background: 'var(--color-surface)',
              border: `1px solid ${error ? '#ef4444' : 'var(--color-border)'}`,
              color: 'var(--color-text-primary)',
            }}
          />
          {error && (
            <p className="text-xs mt-2" style={{ color: '#ef4444' }}>
              Invalid access key
            </p>
          )}
          <button
            type="submit"
            className="w-full mt-4 px-4 py-3 rounded-md text-sm font-medium transition-all"
            style={{
              background: 'var(--color-teal)',
              color: '#fff',
            }}
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  )
}
