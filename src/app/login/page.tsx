'use client'

import { useState } from 'react'

export default function LoginPage() {
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(false)

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: input.trim() }),
    })

    if (res.ok) {
      window.location.href = '/'
    } else {
      setError(true)
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(145deg, #1a1d21 0%, #1e2227 50%, #1a1d21 100%)' }}
    >
      <div className="kith-card p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold" style={{ color: '#e8e6e3' }}>
            Kith Climate CRM
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(232, 230, 227, 0.5)' }}>
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
              background: '#1e2227',
              border: `1px solid ${error ? '#ef4444' : 'rgba(232, 230, 227, 0.06)'}`,
              color: '#e8e6e3',
            }}
          />
          {error && (
            <p className="text-xs mt-2" style={{ color: '#ef4444' }}>
              Invalid access key
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 px-4 py-3 rounded-md text-sm font-medium transition-all"
            style={{
              background: '#5B9A8B',
              color: '#fff',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Checking...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
