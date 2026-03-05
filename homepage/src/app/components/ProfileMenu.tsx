'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { useTheme } from './ThemeProvider'

interface ProfileMenuProps {
  userName: string | null | undefined
  userEmail: string | null | undefined
  userImage: string | null | undefined
  signOutAction: () => Promise<void>
}

export function ProfileMenu({ userName, userEmail, userImage, signOutAction }: ProfileMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { theme, setTheme } = useTheme()

  const themeIcon = theme === 'dark' ? 'dark_mode' : theme === 'light' ? 'light_mode' : 'monitor'
  const themeLabel = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'

  const cycleTheme = () => {
    const next = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'
    setTheme(next)
  }

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on ESC
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  return (
    <div className="relative" ref={menuRef}>
      {/* Avatar trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 cursor-pointer rounded-full px-1.5 py-1.5 transition-all duration-200 hover:bg-foreground/[0.06] hover:backdrop-blur-sm hover:shadow-sm hover:shadow-black/5"
      >
        {userImage ? (
          <Image
            src={userImage}
            alt=""
            width={32}
            height={32}
            className="rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-foreground/40 text-lg">person</span>
          </div>
        )}
      </button>

      {/* Popover card — iOS-style frosted glass: backdrop-filter blur + saturate
          instead of a flat opacity overlay, ensuring legibility over any page content */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl profile-card-glass border border-glass-border shadow-xl shadow-black/10 z-50 overflow-hidden">
          {/* User info */}
          <div className="px-5 py-4 flex items-center gap-3 border-b border-foreground/5">
            {userImage ? (
              <Image
                src={userImage}
                alt=""
                width={48}
                height={48}
                className="rounded-full shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-foreground/10 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-foreground/40 text-2xl">person</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium text-foreground text-sm truncate">{userName || 'User'}</p>
              <p className="text-xs text-foreground/40 truncate">{userEmail || ''}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="px-2 py-2 space-y-0.5">
            {/* Theme toggle — cycles: System → Light → Dark → System */}
            <button
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-foreground/60 hover:bg-foreground/5 hover:text-foreground transition-all cursor-pointer text-left"
              onClick={cycleTheme}
            >
              <span className="material-symbols-outlined text-lg">{themeIcon}</span>
              <span>Theme</span>
              <span className="ml-auto text-xs text-foreground/30">{themeLabel}</span>
            </button>
          </div>

          {/* Sign out */}
          <div className="px-2 py-2 border-t border-foreground/5">
            <form action={signOutAction}>
              <button
                type="submit"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-600 hover:bg-red-50 transition-all cursor-pointer text-left"
              >
                <span className="material-symbols-outlined text-lg">logout</span>
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
