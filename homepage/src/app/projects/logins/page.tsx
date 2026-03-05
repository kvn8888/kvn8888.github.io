'use client'

import { useState, useEffect, useCallback } from 'react'

interface LoginAttempt {
  id: number
  email: string
  method: string
  status: string
  code_verified: number
  created_at: string
  updated_at: string
}

export default function LoginsPage() {
  const [attempts, setAttempts] = useState<LoginAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [addLoading, setAddLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')

  const fetchAttempts = useCallback(async () => {
    try {
      const res = await fetch('/api/logins')
      const data = await res.json()
      if (data.attempts) {
        setAttempts(data.attempts)
      }
    } catch {
      console.error('Failed to fetch login attempts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAttempts()
  }, [fetchAttempts])

  async function handleStatusUpdate(id: number, status: 'approved' | 'rejected') {
    setActionLoading(id)
    try {
      const res = await fetch(`/api/logins/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        await fetchAttempts()
      }
    } catch {
      console.error('Failed to update status')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleAddEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail) return
    setAddLoading(true)
    try {
      const res = await fetch('/api/logins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      })
      if (res.ok) {
        setNewEmail('')
        setShowAdd(false)
        await fetchAttempts()
      }
    } catch {
      console.error('Failed to add email')
    } finally {
      setAddLoading(false)
    }
  }

  const filtered = filter === 'all'
    ? attempts
    : attempts.filter((a) => a.status === filter)

  const statusCounts = {
    all: attempts.length,
    pending: attempts.filter((a) => a.status === 'pending').length,
    approved: attempts.filter((a) => a.status === 'approved').length,
    rejected: attempts.filter((a) => a.status === 'rejected').length,
  }
  const approvedEmails = Array.from(
    new Set(attempts.filter((a) => a.status === 'approved').map((a) => a.email.toLowerCase()))
  )

  function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      rejected: 'bg-red-50 text-red-700 border-red-200',
    }
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || 'bg-glass text-foreground/60 border-glass-border'}`}
      >
        {status}
      </span>
    )
  }

  function MethodBadge({ method }: { method: string }) {
    const icon = method === 'google' ? 'passkey' : method === 'manual' ? 'person_add' : 'mail'
    return (
      <span className="inline-flex items-center gap-1 text-xs text-foreground/50">
        <span className="material-symbols-outlined text-sm">{icon}</span>
        {method}
      </span>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-medium text-foreground blur-reveal">
            Sign-In Manager
          </h1>
          <p className="text-foreground/60 mt-1 blur-reveal-1">
            Review and manage login attempts and access approvals.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground text-background font-medium hover:opacity-90 transition-opacity cursor-pointer blur-reveal-1"
        >
          <span className="material-symbols-outlined text-lg">person_add</span>
          Add Email
        </button>
      </div>

      {showAdd && (
        <div className="mb-6 p-4 rounded-2xl bg-glass backdrop-blur-sm border border-glass-border blur-reveal">
          <form onSubmit={handleAddEmail} className="flex gap-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              className="flex-1 px-4 py-2.5 rounded-xl bg-glass border border-glass-border text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-glass-border-hover transition-colors"
              autoFocus
            />
            <button
              type="submit"
              disabled={addLoading || !newEmail}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addLoading ? 'Adding...' : 'Whitelist'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false)
                setNewEmail('')
              }}
              className="px-4 py-2.5 rounded-xl bg-glass border border-glass-border text-foreground/60 hover:text-foreground hover:border-glass-border-hover transition-all cursor-pointer"
            >
              Cancel
            </button>
          </form>
          <p className="text-xs text-foreground/40 mt-2">
            This email will be immediately approved for sign-in access.
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl bg-glass/50 w-fit blur-reveal-2">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              filter === f
                ? 'bg-foreground text-background'
                : 'text-foreground/50 hover:text-foreground/70'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span className="ml-1.5 text-xs opacity-60">{statusCounts[f]}</span>
          </button>
        ))}
      </div>

      {approvedEmails.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-glass/60 backdrop-blur-sm border border-glass-border blur-reveal-2">
          <p className="text-xs text-foreground/50 mb-2">
            Approved emails ({approvedEmails.length}) stay approved until revoked.
          </p>
          <div className="flex flex-wrap gap-2">
            {approvedEmails.map((email) => (
              <span key={email} className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 text-xs">
                {email}
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-foreground/40">
          <span className="material-symbols-outlined text-4xl animate-spin">
            progress_activity
          </span>
          <p className="mt-2">Loading...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 rounded-2xl bg-glass backdrop-blur-sm border border-glass-border blur-reveal-3">
          <span className="material-symbols-outlined text-4xl text-foreground/30">
            inbox
          </span>
          <p className="text-foreground/50 mt-2">
            {filter === 'all'
              ? 'No login attempts yet.'
              : `No ${filter} attempts.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2 blur-reveal-3">
          {filtered.map((attempt) => (
            <div
              key={attempt.id}
              className="flex items-center justify-between p-4 rounded-xl bg-glass backdrop-blur-sm border border-glass-border hover:border-glass-border-hover transition-colors"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-full bg-glass border border-glass-border flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-foreground/40">
                    person
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {attempt.email}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <MethodBadge method={attempt.method} />
                    <span className="text-xs text-foreground/40">
                      {new Date(attempt.created_at + 'Z').toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <StatusBadge status={attempt.status} />

                {attempt.status === 'pending' && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleStatusUpdate(attempt.id, 'approved')}
                      disabled={actionLoading === attempt.id}
                      className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer disabled:opacity-50"
                      title="Approve"
                    >
                      <span className="material-symbols-outlined text-lg">
                        check
                      </span>
                    </button>
                    <button
                      onClick={() => handleStatusUpdate(attempt.id, 'rejected')}
                      disabled={actionLoading === attempt.id}
                      className="p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50"
                      title="Reject"
                    >
                      <span className="material-symbols-outlined text-lg">
                        close
                      </span>
                    </button>
                  </div>
                )}

                {attempt.status === 'approved' && (
                  <button
                    onClick={() => handleStatusUpdate(attempt.id, 'rejected')}
                    disabled={actionLoading === attempt.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50"
                    title="Revoke approval"
                  >
                    <span className="material-symbols-outlined text-base">person_remove</span>
                    <span className="text-xs">Revoke</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
