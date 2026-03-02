'use client'

import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const icon = theme === 'dark' ? 'dark_mode' : theme === 'light' ? 'light_mode' : 'monitor'

  const cycleTheme = () => {
    const next = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'
    setTheme(next)
  }

  return (
    <button
      onClick={cycleTheme}
      title={`Theme: ${theme}`}
      className="w-8 h-8 flex items-center justify-center rounded-full text-foreground/30 hover:text-foreground/60 hover:bg-foreground/5 transition-all cursor-pointer"
    >
      <span className="material-symbols-outlined text-lg">{icon}</span>
    </button>
  )
}
