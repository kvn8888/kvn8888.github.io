'use client'

import { useState } from 'react'

type Step = 'email' | 'code' | 'pending'

export function EmailVerification() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [displayCode, setDisplayCode] = useState('')
  const [userCode, setUserCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/verify/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to send code')
        return
      }

      if (data.alreadyApproved) {
        setNotice('This email is already approved. Please continue with Google sign-in.')
        return
      }

      if (data.delivery === 'manual') {
        setNotice('Email delivery is not configured. Use the code below to continue.')
      }

      setDisplayCode(data.code || '')
      setStep('code')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/verify/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: userCode }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Verification failed')
        return
      }

      setStep('pending')
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'pending') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
          <span className="material-symbols-outlined text-amber-600 text-3xl">
            hourglass_top
          </span>
        </div>
        <h2 className="text-lg font-medium text-foreground mb-2">
          Pending Approval
        </h2>
        <p className="text-sm text-foreground/60">
          Your email <span className="font-medium text-foreground/80">{email}</span> has
          been verified. An admin will review and approve your access.
        </p>
      </div>
    )
  }

  if (step === 'code') {
    return (
      <div>
        {displayCode && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <p className="text-xs text-emerald-700 mb-1">
              Demo mode — your verification code:
            </p>
            <p className="text-2xl font-mono font-bold text-emerald-700 tracking-widest text-center">
              {displayCode}
            </p>
          </div>
        )}

        {!displayCode && (
          <div className="mb-4 p-3 rounded-xl bg-glass border border-glass-border">
            <p className="text-sm text-foreground/60 text-center">
              A verification code has been sent to your email.
            </p>
          </div>
        )}

        <form onSubmit={handleVerifyCode} className="space-y-3">
          <div>
            <label
              htmlFor="code"
              className="block text-sm font-medium text-foreground/70 mb-1"
            >
              Enter verification code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={userCode}
              onChange={(e) => setUserCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full px-4 py-3 rounded-xl bg-glass border border-glass-border text-foreground text-center text-xl tracking-widest font-mono placeholder:text-foreground/30 focus:outline-none focus:border-glass-border-hover transition-colors"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}

          {notice && (
            <p className="text-sm text-foreground/60 text-center">{notice}</p>
          )}

          <button
            type="submit"
            disabled={loading || userCode.length !== 6}
            className="w-full px-4 py-3 rounded-xl bg-foreground text-background font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying...' : 'Verify Code'}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep('email')
              setDisplayCode('')
              setUserCode('')
              setError('')
            }}
            className="w-full text-sm text-foreground/50 hover:text-foreground/70 transition-colors cursor-pointer"
          >
            ← Use a different email
          </button>
        </form>
      </div>
    )
  }

  return (
    <form onSubmit={handleRequestCode} className="space-y-3">
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-foreground/70 mb-1"
        >
          Email address
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-4 py-3 rounded-xl bg-glass border border-glass-border text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-glass-border-hover transition-colors"
          autoFocus
        />
      </div>

      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      {notice && <p className="text-sm text-foreground/60 text-center">{notice}</p>}

      <button
        type="submit"
        disabled={loading || !email}
        className="w-full px-4 py-3 rounded-xl bg-foreground text-background font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Sending...' : 'Send Verification Code'}
      </button>
    </form>
  )
}
