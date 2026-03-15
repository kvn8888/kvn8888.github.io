'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const CLIENT_SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
const POLL_INTERVAL_MS = 5 * 60 * 1000

export function UpdateToast() {
  const [visible, setVisible] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const serverShaRef = useRef<string | null>(null)

  useEffect(() => {
    if (!CLIENT_SHA) return // local dev — skip entirely

    async function checkVersion() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const data: { sha: string | null } = await res.json()
        if (!data.sha) return

        serverShaRef.current = data.sha

        const dismissed = sessionStorage.getItem('update-toast-dismissed-sha')
        if (dismissed === data.sha) return

        if (data.sha !== CLIENT_SHA) setVisible(true)
      } catch {
        // silent — network errors shouldn't interrupt the user
      }
    }

    const initial = setTimeout(checkVersion, 30_000)
    intervalRef.current = setInterval(checkVersion, POLL_INTERVAL_MS)

    return () => {
      clearTimeout(initial)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  function handleDismiss() {
    if (serverShaRef.current) {
      sessionStorage.setItem('update-toast-dismissed-sha', serverShaRef.current)
    }
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="update-toast"
          initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-6 right-6 z-[100] w-[min(calc(100vw-3rem),22rem)]"
          role="alert"
          aria-live="polite"
        >
          <div className="profile-card-glass rounded-2xl border border-white/20 dark:border-white/10 shadow-xl shadow-black/10 px-4 py-3.5 flex items-center gap-3">
            <span
              className="material-symbols-outlined text-foreground/50 text-[20px] shrink-0"
              aria-hidden="true"
            >
              update
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground leading-snug">
                New version available
              </p>
              <p className="text-xs text-foreground/50 leading-snug mt-0.5">
                Refresh to get the latest updates.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="shrink-0 px-3 py-1.5 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-85 transition-opacity cursor-pointer"
            >
              Refresh
            </button>
            <button
              onClick={handleDismiss}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-foreground/40 hover:text-foreground/70 hover:bg-foreground/8 transition-all cursor-pointer"
              aria-label="Dismiss"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                close
              </span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
