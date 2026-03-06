// ─── Cover Letter Workbench — Shared Types & Constants ──────────────────────
// This module defines the data types, category color definitions,
// and highlight palette used by the BlockCard, HighlightEditor, and page
// components. Centralizing these avoids circular imports and keeps each
// component file focused on rendering logic.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single reusable sentence/paragraph block in the library */
export interface Block {
  id: string
  category: string
  text: string
  tags: Tag[]
  createdAt?: string
  updatedAt?: string
}

/** A reusable tag attached to one or more library blocks */
export interface Tag {
  id: string
  name: string
  slug: string
  createdAt?: string
  updatedAt?: string
}

/** Client-side payload for creating or editing a block */
export interface BlockDraft {
  category: string
  text: string
  tagIds: string[]
}

/** Result from the AI matching API — which block matched and why */
export interface MatchResult {
  id: string
  reason: string
}

// ─── Category Definitions ───────────────────────────────────────────────────
// Each category gets a color triple:
//   dot    — the small indicator circle and accent color
//   bg     — light-mode background tint (low-opacity fill)
//   darkBg — dark-mode background tint (slightly higher opacity)
// Colors are intentionally muted to work on both light and dark glass surfaces.

export const CATEGORIES: Record<string, { dot: string; bg: string; darkBg: string }> = {
  'Client-Facing': { dot: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  darkBg: 'rgba(59,130,246,0.15)' },
  'Full-Stack':    { dot: '#10b981', bg: 'rgba(16,185,129,0.08)',  darkBg: 'rgba(16,185,129,0.15)' },
  'AI/ML':         { dot: '#8b5cf6', bg: 'rgba(139,92,246,0.08)',  darkBg: 'rgba(139,92,246,0.15)' },
  'Embedded':      { dot: '#ef4444', bg: 'rgba(239,68,68,0.08)',   darkBg: 'rgba(239,68,68,0.15)' },
  'Hackathons':    { dot: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  darkBg: 'rgba(245,158,11,0.15)' },
  'Soft Skills':   { dot: '#06b6d4', bg: 'rgba(6,182,212,0.08)',   darkBg: 'rgba(6,182,212,0.15)' },
  'Closer':        { dot: '#6b7280', bg: 'rgba(107,114,128,0.08)', darkBg: 'rgba(107,114,128,0.15)' },
  'Custom':        { dot: '#64748b', bg: 'rgba(100,116,139,0.08)', darkBg: 'rgba(100,116,139,0.18)' },
}

export const DEFAULT_BLOCK_CATEGORY = 'Soft Skills'

// ─── Highlight Palette ──────────────────────────────────────────────────────
// Colors for user-created cards (from text selection → "Create Card").
// Cycles through these sequentially so adjacent cards get different colors.

export const HIGHLIGHT_PALETTE = [
  { bg: 'rgba(59,130,246,0.15)',  darkBg: 'rgba(59,130,246,0.25)',  border: '#3b82f6' },
  { bg: 'rgba(16,185,129,0.15)',  darkBg: 'rgba(16,185,129,0.25)',  border: '#10b981' },
  { bg: 'rgba(139,92,246,0.15)',  darkBg: 'rgba(139,92,246,0.25)',  border: '#8b5cf6' },
  { bg: 'rgba(245,158,11,0.15)',  darkBg: 'rgba(245,158,11,0.25)',  border: '#f59e0b' },
  { bg: 'rgba(6,182,212,0.15)',   darkBg: 'rgba(6,182,212,0.25)',   border: '#06b6d4' },
  { bg: 'rgba(239,68,68,0.15)',   darkBg: 'rgba(239,68,68,0.25)',   border: '#ef4444' },
]

// Module-level counter for cycling through HIGHLIGHT_PALETTE
let paletteIdx = 0

/** Returns the next color from the highlight palette, cycling sequentially */
export function nextPaletteColor() {
  return HIGHLIGHT_PALETTE[paletteIdx++ % HIGHLIGHT_PALETTE.length]
}
