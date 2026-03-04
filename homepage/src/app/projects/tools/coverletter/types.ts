// ─── Cover Letter Workbench — Shared Types & Constants ──────────────────────
// This module defines the data types, category color definitions, seed data,
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
}

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

// ─── Seed Data ──────────────────────────────────────────────────────────────
// Pre-populated blocks based on Kevin's background.
// Users should replace/extend these with their own voice and experiences.

export const INITIAL_BLOCKS: Block[] = [
  {
    id: '1',
    category: 'Client-Facing',
    text: 'As a Customer Application Engineer at Ivalua, I work directly with enterprise clients like T-Mobile on technical implementations, platform upgrades, and production support — bridging the gap between client needs and engineering execution.',
  },
  {
    id: '2',
    category: 'Full-Stack',
    text: "I build full-stack applications using Next.js, Node, and React, deploying with Docker on AWS infrastructure managed through Terraform — I'm comfortable owning a feature from database schema to production deployment.",
  },
  {
    id: '3',
    category: 'AI/ML',
    text: "I've built practical AI tooling including DepScope, a repository due diligence tool that analyzes codebases for technical risk, and ClaimGraph, an AI-powered fact-checking system with trust graph visualization.",
  },
  {
    id: '4',
    category: 'Embedded',
    text: 'My embedded systems experience with STM32 microcontrollers and bare-metal C gives me a strong foundation in resource-constrained programming, hardware-software interfaces, and systems-level thinking.',
  },
  {
    id: '5',
    category: 'Hackathons',
    text: "I've placed in multiple competitive hackathons including second place at AWS Builder Loft and the Before the Ballot civic tech hackathon — I thrive under time pressure and ship working software fast.",
  },
  {
    id: '6',
    category: 'Soft Skills',
    text: 'Working with enterprise clients has taught me to translate complex technical constraints into language stakeholders understand, and to scope work realistically when requirements are ambiguous.',
  },
  {
    id: '7',
    category: 'Closer',
    text: "I'd welcome the chance to discuss how my experience building production tools and working with enterprise clients could contribute to your team. I'm available for a conversation at your convenience.",
  },
  {
    id: '8',
    category: 'Full-Stack',
    text: 'I have hands-on experience with the MERN stack, building and maintaining REST APIs, implementing authentication flows, and managing CI/CD pipelines for team projects.',
  },
  {
    id: '9',
    category: 'AI/ML',
    text: "I've worked with MCP servers and multi-agent frameworks, and I stay current with developments in transformer architectures and model optimization — I understand both the application layer and the infrastructure underneath.",
  },
  {
    id: '10',
    category: 'Hackathons',
    text: 'At hackathons I typically lead the system architecture decisions and own the backend integration work, coordinating a team of 3-4 to deliver a polished demo within 24-48 hours.',
  },
  {
    id: '11',
    category: 'Soft Skills',
    text: "I'm drawn to teams that value clean engineering over flashy tooling — I'd rather ship a well-tested feature with clear documentation than a brittle prototype that demos well.",
  },
  {
    id: '12',
    category: 'Closer',
    text: "I'm currently based in the Bay Area and available to start immediately. I'd love to learn more about the technical challenges your team is tackling.",
  },
]
