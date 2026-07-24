'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  MANAGED_SECRET_GROUPS,
  isRepeatableSecretKey,
  type ManagedSecretField,
  type ManagedSecretGroup,
  type ManagedSecretStrategy,
} from '@/lib/managedSecrets'

interface SecretOverrideMeta {
  key: string
  userEmail: string
  updatedAt: string
}

interface SecretStatus {
  envSet: boolean
  envStatusSource: 'vercel' | 'runtime'
  strategy: ManagedSecretStrategy
}

interface DisplaySecretField extends ManagedSecretField {
  repeatableBaseKey?: string
}

export default function SecretsPage() {
  const [overrides, setOverrides] = useState<SecretOverrideMeta[]>([])
  const [statuses, setStatuses] = useState<Record<string, SecretStatus>>({})
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
        setStatuses(data.statuses ?? {})
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
        const strategy = data.strategy as ManagedSecretStrategy | undefined

        if (strategy === 'env-sync-only' && vercelSync?.status === 'ok') {
          showToast(`${key} saved to Vercel envs. Redeploy required to use it.`, 'success')
        } else if (vercelSync?.status === 'ok') {
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

  const knownKeys = new Set([
    ...Object.keys(statuses),
    ...overrides.map((override) => override.key),
    ...(pendingKey ? [pendingKey] : []),
  ])

  function getVisibleFields(group: ManagedSecretGroup): DisplaySecretField[] {
    return group.keys.flatMap((field) => {
      if (!field.repeatable) return [field]

      const accountKeys = new Set([field.key])
      for (const key of knownKeys) {
        if (isRepeatableSecretKey(field.key, key)) accountKeys.add(key)
      }

      return [...accountKeys]
        .sort((a, b) => {
          const accountA = a === field.key ? 1 : Number(a.slice(field.key.length + 1))
          const accountB = b === field.key ? 1 : Number(b.slice(field.key.length + 1))
          return accountA - accountB
        })
        .map((key) => {
          if (key === field.key) {
            return { ...field, repeatableBaseKey: field.key }
          }

          const accountNumber = Number(key.slice(field.key.length + 1))
          return {
            ...field,
            key,
            description: `${field.repeatable?.accountLabel ?? 'Additional'} account ${accountNumber} API key for pooled usage`,
            note: 'Additional runtime-managed account credential.',
            repeatableBaseKey: field.key,
          }
        })
    })
  }

  function addAccount(baseKey: string) {
    const accountNumbers = [...knownKeys]
      .filter((key) => isRepeatableSecretKey(baseKey, key))
      .map((key) => key === baseKey ? 1 : Number(key.slice(baseKey.length + 1)))
      .filter(Number.isFinite)
    const nextAccount = Math.max(1, ...accountNumbers) + 1

    setPendingKey(`${baseKey}_${nextAccount}`)
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
          Manage service credentials and deploy-time environment config from one place.
          Runtime-capable entries can override immediately; env-only entries sync to Vercel for the next redeploy.
        </p>
      </div>

      {/* Info banner */}
      <div className="mb-6 flex items-start gap-3 p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 blur-reveal-1">
        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 mt-0.5">
          info
        </span>
        <div className="text-sm text-amber-800 dark:text-amber-300">
          <span className="font-medium">Write-only:</span> Values cannot be read back once saved.
          `Env set` means the key already exists in the Vercel project when that lookup is available,
          otherwise it falls back to the current deployment env. Runtime entries can override immediately;
          env-only entries are synced to Vercel and picked up on redeploy. Clear only removes the runtime override.
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
                {getVisibleFields(group).map((item) => {
                  const meta = overrideMap.get(item.key)
                  const status = statuses[item.key]
                  const isEditing = pendingKey === item.key
                  const strategy = status?.strategy ?? item.strategy ?? 'runtime-override'
                  const inputType = item.inputType ?? 'password'
                  const isRepeatableBase = item.repeatableBaseKey === item.key

                  return (
                    <div key={item.key} className="px-6 py-4">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono font-medium text-foreground">
                              {item.key}
                            </code>
                            {status?.envSet && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                                <span className="material-symbols-outlined text-xs">cloud_done</span>
                                env set
                              </span>
                            )}
                            {meta && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                                <span className="material-symbols-outlined text-xs">check_circle</span>
                                overridden
                              </span>
                            )}
                            {strategy === 'env-sync-only' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                <span className="material-symbols-outlined text-xs">sync_alt</span>
                                env only
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-foreground/50 mt-0.5">{item.description}</p>
                          {item.note && (
                            <p className="text-xs text-foreground/35 mt-0.5">{item.note}</p>
                          )}
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
                          <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
                            {isRepeatableBase && (
                              <button
                                onClick={() => addAccount(item.key)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-glass border border-glass-border text-foreground/60 hover:text-foreground hover:border-glass-border-hover text-sm transition-all cursor-pointer"
                                title={`Add another ${item.repeatable?.accountLabel ?? 'service'} account`}
                              >
                                <span className="material-symbols-outlined text-base">add</span>
                                <span className="hidden sm:inline">Account</span>
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setPendingKey(item.key)
                                setInputValue('')
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-base">
                                {meta || status?.envSet ? 'edit' : 'add'}
                              </span>
                              {strategy === 'env-sync-only'
                                ? status?.envSet
                                  ? 'Update env'
                                  : 'Set env'
                                : meta
                                  ? 'Update'
                                  : 'Set'}
                            </button>
                            {strategy === 'runtime-override' && meta && (
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
                        <div className="mt-3 flex flex-col sm:flex-row gap-2">
                          <input
                            type={inputType === 'password' ? 'password' : inputType}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSave(item.key)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            placeholder={
                              strategy === 'env-sync-only'
                                ? `Set ${item.key} in Vercel…`
                                : `Paste ${item.key} value…`
                            }
                            autoFocus
                            className="flex-1 px-4 py-2.5 rounded-xl bg-glass border border-glass-border text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-glass-border-hover font-mono text-sm transition-colors"
                          />
                          <button
                            onClick={() => handleSave(item.key)}
                            disabled={saving || !inputValue.trim()}
                            className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {saving ? 'Saving…' : strategy === 'env-sync-only' ? 'Save env' : 'Save'}
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
