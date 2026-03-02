'use client'

import { useRouter } from 'next/navigation'

export function BackButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => router.back()}
      className="text-sm text-foreground/60 hover:text-foreground transition-colors cursor-pointer"
    >
      ← Back
    </button>
  )
}
