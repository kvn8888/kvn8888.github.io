'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  ACCESS_GRANT_OPTIONS,
  getGrantedOptions,
  type AccessGrantKey,
} from '@/lib/accessGrants'

interface LoginAttempt {
  id: number
  email: string
  method: string
  status: string
  code_verified: number
  created_at: string
  updated_at: string
  grants: AccessGrantKey[]
}

type AccessMode = 'full' | 'selected'

interface AccessDraft {
  mode: AccessMode
  grantKeys: AccessGrantKey[]
}

function buildAccessDraft(grantKeys: readonly AccessGrantKey[]): AccessDraft {
  if (grantKeys.length === 0) {
    return { mode: 'full', grantKeys: [] }
  }

  return {
    mode: 'selected',
    grantKeys: [...grantKeys],
  }
}

function AccessSummary({ grantKeys }: { grantKeys: readonly AccessGrantKey[] }) {
  if (grantKeys.length === 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
        Full protected-site access
      </span>
    )
  }

  const grantedOptions = getGrantedOptions(grantKeys)

  return (
    <div className="flex flex-wrap gap-1.5">
      {grantedOptions.map((option) => (
        <span
          key={option.key}
          className="inline-flex items-center rounded-full border border-glass-border bg-foreground/5 px-2.5 py-1 text-xs text-foreground/70"
        >
          {option.label}
        </span>
      ))}
    </div>
  )
}

function AccessGrantEditor({
  draft,
  onChange,
}: {
  draft: AccessDraft
  onChange: (draft: AccessDraft) => void
}) {
  const selectedPagesInvalid = draft.mode === 'selected' && draft.grantKeys.length === 0

  return (
    <div className="mt-3 rounded-xl border border-glass-border bg-foreground/[0.03] p-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange({ mode: 'full', grantKeys: [] })}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
            draft.mode === 'full'
              ? 'bg-foreground text-background'
              : 'bg-glass border border-glass-border text-foreground/60 hover:text-foreground'
          }`}
        >
          Full access
        </button>
        <button
          type="button"
          onClick={() => onChange({ mode: 'selected', grantKeys: draft.grantKeys })}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
            draft.mode === 'selected'
              ? 'bg-foreground text-background'
              : 'bg-glass border border-glass-border text-foreground/60 hover:text-foreground'
          }`}
        >
          Selected pages only
        </button>
      </div>

      <p className="mt-2 text-xs text-foreground/40">
        {draft.mode === 'full'
          ? 'This account can open any protected page and the related protected APIs.'
          : 'Pick the exact protected pages and protected APIs this account should be able to use.'}
      </p>

      {draft.mode === 'selected' && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {ACCESS_GRANT_OPTIONS.map((option) => {
            const checked = draft.grantKeys.includes(option.key)

            return (
              <label
                key={option.key}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                  checked
                    ? 'border-foreground/20 bg-foreground/8'
                    : 'border-glass-border bg-glass hover:border-glass-border-hover'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    onChange({
                      mode: 'selected',
                      grantKeys: checked
                        ? draft.grantKeys.filter((grantKey) => grantKey !== option.key)
                        : [...draft.grantKeys, option.key],
                    })
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-glass-border text-foreground"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">{option.label}</p>
                  <p className="mt-0.5 text-xs text-foreground/45">{option.description}</p>
                </div>
              </label>
            )
          })}
        </div>
      )}

      {selectedPagesInvalid && (
        <p className="mt-3 text-xs text-red-700">
          Choose at least one page grant, or switch back to full access.
        </p>
      )}
    </div>
  )
}

export default function LoginsPage() {
  const [attempts, setAttempts] = useState<LoginAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [actionLoading, setActionLoading] = useState<number | null>(null)
  const [addLoading, setAddLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [addDraft, setAddDraft] = useState<AccessDraft>({ mode: 'full', grantKeys: [] })
  const [draftsByEmail, setDraftsByEmail] = useState<Record<string, AccessDraft>>({})
  const [expandedEditors, setExpandedEditors] = useState<Record<string, boolean>>({})

  const fetchAttempts = useCallback(async () => {
    try {
      const res = await fetch('/api/logins')
      const data = await res.json()
      if (data.attempts) {
        setAttempts(data.attempts)
        setDraftsByEmail({})
        setExpandedEditors({})
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

  function getAccountDraft(email: string, grantKeys: readonly AccessGrantKey[]) {
    return draftsByEmail[email.toLowerCase()] ?? buildAccessDraft(grantKeys)
  }

  function setAccountDraft(
    email: string,
    currentGrantKeys: readonly AccessGrantKey[],
    nextDraft: AccessDraft
  ) {
    setDraftsByEmail((current) => ({
      ...current,
      [email.toLowerCase()]: nextDraft,
    }))

    if (currentGrantKeys.length > 0 || nextDraft.mode === 'selected') {
      setExpandedEditors((current) => ({
        ...current,
        [email.toLowerCase()]: true,
      }))
    }
  }

  async function handleStatusUpdate(
    attempt: LoginAttempt,
    status: 'approved' | 'rejected',
    grantKeys?: AccessGrantKey[]
  ) {
    setActionLoading(attempt.id)
    try {
      const res = await fetch(`/api/logins/${attempt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, grantKeys }),
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

  async function handleAddEmail(e: FormEvent) {
    e.preventDefault()
    if (!newEmail) return

    if (addDraft.mode === 'selected' && addDraft.grantKeys.length === 0) {
      return
    }

    setAddLoading(true)
    try {
      const res = await fetch('/api/logins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          grantKeys: addDraft.mode === 'full' ? [] : addDraft.grantKeys,
        }),
      })
      if (res.ok) {
        setNewEmail('')
        setShowAdd(false)
        setAddDraft({ mode: 'full', grantKeys: [] })
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
    new Map(
      attempts
        .filter((attempt) => attempt.status === 'approved')
        .map((attempt) => [attempt.email.toLowerCase(), attempt])
    ).values()
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
          <form onSubmit={handleAddEmail} className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@example.com"
                className="flex-1 px-4 py-2.5 rounded-xl bg-glass border border-glass-border text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-glass-border-hover transition-colors"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={
                    addLoading ||
                    !newEmail ||
                    (addDraft.mode === 'selected' && addDraft.grantKeys.length === 0)
                  }
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addLoading ? 'Adding...' : 'Whitelist'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdd(false)
                    setNewEmail('')
                    setAddDraft({ mode: 'full', grantKeys: [] })
                  }}
                  className="px-4 py-2.5 rounded-xl bg-glass border border-glass-border text-foreground/60 hover:text-foreground hover:border-glass-border-hover transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>

            <AccessGrantEditor draft={addDraft} onChange={setAddDraft} />
          </form>
          <p className="text-xs text-foreground/40 mt-2">
            This email will be immediately approved. Leave it on full access, or limit it to specific pages before saving.
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
            Approved accounts ({approvedEmails.length}) stay approved until revoked.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {approvedEmails.map((attempt) => (
              <div
                key={attempt.email.toLowerCase()}
                className="rounded-xl border border-glass-border bg-glass px-3 py-2"
              >
                <p className="text-sm font-medium text-foreground">{attempt.email.toLowerCase()}</p>
                <div className="mt-2">
                  <AccessSummary grantKeys={attempt.grants} />
                </div>
              </div>
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
              className="rounded-xl bg-glass backdrop-blur-sm border border-glass-border p-4 hover:border-glass-border-hover transition-colors"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-glass border border-glass-border flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-foreground/40">
                      person
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {attempt.email}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
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

                    <div className="mt-3">
                      <p className="mb-1 text-xs text-foreground/45">Access</p>
                      <AccessSummary
                        grantKeys={
                          getAccountDraft(attempt.email, attempt.grants).mode === 'full'
                            ? []
                            : getAccountDraft(attempt.email, attempt.grants).grantKeys
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap lg:justify-end">
                  <StatusBadge status={attempt.status} />

                  {(attempt.status === 'pending' || attempt.status === 'approved') && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedEditors((current) => ({
                          ...current,
                          [attempt.email.toLowerCase()]: !current[attempt.email.toLowerCase()],
                        }))
                      }
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-glass border border-glass-border text-foreground/65 hover:text-foreground hover:border-glass-border-hover transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">tune</span>
                      <span className="text-xs">Access</span>
                    </button>
                  )}

                  {attempt.status === 'pending' && (
                    <>
                      <button
                        onClick={() => {
                          const draft = getAccountDraft(attempt.email, attempt.grants)
                          if (draft.mode === 'selected' && draft.grantKeys.length === 0) {
                            setExpandedEditors((current) => ({
                              ...current,
                              [attempt.email.toLowerCase()]: true,
                            }))
                            return
                          }

                          void handleStatusUpdate(
                            attempt,
                            'approved',
                            draft.mode === 'full' ? [] : draft.grantKeys
                          )
                        }}
                        disabled={actionLoading === attempt.id}
                        className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer disabled:opacity-50"
                        title="Approve"
                      >
                        <span className="material-symbols-outlined text-lg">
                          check
                        </span>
                      </button>
                      <button
                        onClick={() => void handleStatusUpdate(attempt, 'rejected')}
                        disabled={actionLoading === attempt.id}
                        className="p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50"
                        title="Reject"
                      >
                        <span className="material-symbols-outlined text-lg">
                          close
                        </span>
                      </button>
                    </>
                  )}

                  {attempt.status === 'approved' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const draft = getAccountDraft(attempt.email, attempt.grants)
                          if (draft.mode === 'selected' && draft.grantKeys.length === 0) {
                            setExpandedEditors((current) => ({
                              ...current,
                              [attempt.email.toLowerCase()]: true,
                            }))
                            return
                          }

                          void handleStatusUpdate(
                            attempt,
                            'approved',
                            draft.mode === 'full' ? [] : draft.grantKeys
                          )
                        }}
                        disabled={actionLoading === attempt.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-base">save</span>
                        <span className="text-xs">Save Access</span>
                      </button>
                      <button
                        onClick={() => void handleStatusUpdate(attempt, 'rejected')}
                        disabled={actionLoading === attempt.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors cursor-pointer disabled:opacity-50"
                        title="Revoke approval"
                      >
                        <span className="material-symbols-outlined text-base">person_remove</span>
                        <span className="text-xs">Revoke</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {(attempt.status === 'pending' || attempt.status === 'approved') &&
                expandedEditors[attempt.email.toLowerCase()] && (
                  <AccessGrantEditor
                    draft={getAccountDraft(attempt.email, attempt.grants)}
                    onChange={(nextDraft) => setAccountDraft(attempt.email, attempt.grants, nextDraft)}
                  />
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
