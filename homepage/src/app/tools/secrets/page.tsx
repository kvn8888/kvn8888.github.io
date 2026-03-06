'use client'

import { useState, useEffect, useCallback } from 'react'
import { MANAGED_SECRET_GROUPS } from '@/lib/managedSecrets'

interface SecretOverrideMeta {
  key: string
  userEmail: string
  updatedAt: string
}

export default function SecretsPage() {
  const [overrides, setOverrides] = useState<SecretOverrideMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchOverrides = useCallback(async () => {
    try {
      const res = await fetch('/api/secrets')
      if (res.ok) {
        const data = await res.json()
        setOverrides(data.overrides ?? [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOverrides()
  }, [fetchOverrides])

  const overrideMap = new Map(overrides.map((o) => [o.key, o]))

  async function handleSave(key: string) {
    if (!inputValue.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: inputValue.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setPendingKey(null)
        setInputValue('')
        await fetchOverrides()
        const vercelSync = data.vercelSync as
          | { status?: 'ok' | 'skipped' | 'failed'; message?: string }
          | undefined

        if (vercelSync?.status === 'ok') {
          showToast(`${key} saved and synced to Vercel`, 'success')
        } else if (vercelSync?.status === 'failed') {
          showToast(`${key} saved locally. ${vercelSync.message ?? 'Vercel sync failed.'}`, 'error')
        } else if (vercelSync?.status === 'skipped') {
          showToast(`${key} saved locally. ${vercelSync.message ?? 'Vercel sync skipped.'}`, 'success')
        } else {
          showToast(`${key} saved`, 'success')
        }
      } else {
        const err = await res.json()
        showToast(err.error ?? 'Failed to save', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear(key: string) {
    setClearing(key)
    try {
      const res = await fetch(`/api/secrets?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        await fetchOverrides()
        showToast(`${key} cleared`, 'success')
      } else {
        showToast('Failed to clear', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    } finally {
      setClearing(null)
    }
  }

  function cancelEdit() {
    setPendingKey(null)
    setInputValue('')
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-medium text-foreground blur-reveal">
          Runtime Secrets
        </h1>
        <p className="text-foreground/60 mt-2 blur-reveal-1">
          Override service credentials and related runtime config without a redeploy.
          Values are encrypted at rest and layered on top of the existing environment.
        </p>
      </div>

      {/* Info banner */}
      <div className="mb-6 flex items-start gap-3 p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 blur-reveal-1">
        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 mt-0.5">
          info
        </span>
        <div className="text-sm text-amber-800 dark:text-amber-300">
          <span className="font-medium">Write-only:</span> Values cannot be read back once saved.
          Overrides take effect immediately on the next API call. Clear an override to fall back to
          the underlying env var. If `VERCEL_API_TOKEN` plus a Vercel project ID or name are configured,
          Save also upserts the key into Vercel preview/production envs for the next redeploy.
          Bootstrap-only auth and Turso connection vars intentionally stay env-only.
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-foreground/40 blur-reveal-2">
          <span className="material-symbols-outlined text-4xl animate-spin">
            progress_activity
          </span>
          <p className="mt-2">Loading…</p>
        </div>
      ) : (
        <div className="space-y-6">
          {MANAGED_SECRET_GROUPS.map((group, gi) => (
            <div
              key={group.label}
              className={`rounded-2xl bg-glass backdrop-blur-sm border border-glass-border blur-reveal-${Math.min(gi + 2, 5)}`}
            >
              {/* Group header */}
              <div className="flex items-center gap-2 px-6 py-4 border-b border-glass-border">
                <span className="material-symbols-outlined text-foreground/40 text-xl">
                  {group.icon}
                </span>
                <h2 className="font-medium text-foreground">{group.label}</h2>
              </div>

              {/* Keys list */}
              <div className="divide-y divide-glass-border">
                {group.keys.map((item) => {
                  const meta = overrideMap.get(item.key)
                  const isEditing = pendingKey === item.key

                  return (
                    <div key={item.key} className="px-6 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono font-medium text-foreground">
                              {item.key}
                            </code>
                            {meta && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                                <span className="material-symbols-outlined text-xs">check_circle</span>
                                overridden
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-foreground/50 mt-0.5">{item.description}</p>
                          {meta && (
                            <p className="text-xs text-foreground/30 mt-0.5">
                              Set{' '}
                              {new Date(meta.updatedAt + 'Z').toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          )}
                        </div>

                        {!isEditing && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => {
                                setPendingKey(item.key)
                                setInputValue('')
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-base">
                                {meta ? 'edit' : 'add'}
                              </span>
                              {meta ? 'Update' : 'Set'}
                            </button>
                            {meta && (
                              <button
                                onClick={() => handleClear(item.key)}
                                disabled={clearing === item.key}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass border border-glass-border text-foreground/60 hover:text-red-600 hover:border-red-300 text-sm transition-all cursor-pointer disabled:opacity-50"
                                title="Clear override — fall back to env var"
                              >
                                {clearing === item.key ? (
                                  <span className="material-symbols-outlined text-base animate-spin">
                                    progress_activity
                                  </span>
                                ) : (
                                  <span className="material-symbols-outlined text-base">
                                    delete
                                  </span>
                                )}
                                Clear
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Inline edit form */}
                      {isEditing && (
                        <div className="mt-3 flex gap-2">
                          <input
                            type="password"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSave(item.key)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            placeholder={`Paste ${item.key} value…`}
                            autoFocus
                            className="flex-1 px-4 py-2.5 rounded-xl bg-glass border border-glass-border text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-glass-border-hover font-mono text-sm transition-colors"
                          />
                          <button
                            onClick={() => handleSave(item.key)}
                            disabled={saving || !inputValue.trim()}
                            className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-4 py-2.5 rounded-xl bg-glass border border-glass-border text-foreground/60 hover:text-foreground hover:border-glass-border-hover text-sm transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          <span className="material-symbols-outlined text-base">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toast.message}
        </div>
      )}
    </div>
  )
}
