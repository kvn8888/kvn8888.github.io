'use client'

import { useRouter } from 'next/navigation'

export function BackButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
    >
      <span className="material-symbols-outlined text-base">arrow_back</span>
      Back
    </button>
  )
}
