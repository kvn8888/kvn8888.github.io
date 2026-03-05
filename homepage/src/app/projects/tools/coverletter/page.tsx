'use client'

// ─── Cover Letter Workbench — Page Orchestrator ─────────────────────────────
// This is the top-level page component that wires together the three modules:
//   - types.ts: Block, MatchResult, CATEGORIES, INITIAL_BLOCKS
//   - BlockCard.tsx: Library card component
//   - HighlightEditor.tsx: ContentEditable editor with inline highlights
//
// This file handles:
//   - Page layout (two-panel: editor left, library right)
//   - AI block matching (calls /api/coverletter/match)
//   - Library state management (add/filter/persist blocks)
//   - Drag-and-drop visual feedback between panels
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'
import { Block, MatchResult, CATEGORIES, INITIAL_BLOCKS } from './types'
import BlockCard from './BlockCard'
import HighlightEditor, { type HighlightEditorHandle } from './HighlightEditor'

// ─── Main Page Component ────────────────────────────────────────────────────

export default function CoverLetterWorkbench() {
  // Safari blur-reveal animation fix: mount state triggers CSS class addition
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Ref to the HighlightEditor — used to insert blocks via click
  const editorRef = useRef<HighlightEditorHandle>(null)

  // ── Core state ──
  const [libraryBlocks, setLibraryBlocks] = useState<Block[]>(INITIAL_BLOCKS)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── Job posting & AI matching ──
  const [jobPosting, setJobPosting] = useState('')
  const [matches, setMatches] = useState<Record<string, string>>({})
  const [isMatching, setIsMatching] = useState(false)

  // ── Library filter ──
  const [filterCategory, setFilterCategory] = useState('All')

  // ── Add block form ──
  const [showAddForm, setShowAddForm] = useState(false)
  const [newBlockText, setNewBlockText] = useState('')
  const [newBlockCategory, setNewBlockCategory] = useState('Soft Skills')

  // ── Drag-and-drop visual feedback ──
  const [isDragOver, setIsDragOver] = useState(false)

  // ── Copy feedback ──
  const [copied, setCopied] = useState(false)

  // ── Editor block count (reported by HighlightEditor) ──
  const [editorBlockCount, setEditorBlockCount] = useState(0)

  // ── localStorage persistence for library blocks ──
  useEffect(() => {
    try {
      const savedLibrary = localStorage.getItem('cl-library')
      if (savedLibrary) setLibraryBlocks(JSON.parse(savedLibrary))
    } catch { /* ignore parse errors */ }
  }, [])

  useEffect(() => {
    localStorage.setItem('cl-library', JSON.stringify(libraryBlocks))
  }, [libraryBlocks])

  /** Add a brand new block to the library */
  const addNewBlock = () => {
    if (!newBlockText.trim()) return
    const newBlock: Block = {
      id: Date.now().toString(),
      category: newBlockCategory,
      text: newBlockText.trim(),
    }
    setLibraryBlocks((prev) => [...prev, newBlock])
    setNewBlockText('')
    setShowAddForm(false)
  }

  // ── Copy feedback handler (called by HighlightEditor) ──
  const handleCopy = useCallback(() => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  // ── AI matching ──
  // Calls the server-side Gemini proxy to find the best blocks for a job posting
  const matchBlocks = async () => {
    if (!jobPosting.trim()) return
    setIsMatching(true)
    try {
      const res = await fetch('/api/coverletter/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobPosting, blocks: libraryBlocks }),
      })
      if (!res.ok) throw new Error('Match failed')
      const data = await res.json()
      const matchMap: Record<string, string> = {}
      data.matches?.forEach((m: MatchResult) => { matchMap[m.id] = m.reason })
      setMatches(matchMap)
    } catch (err) {
      console.error('Match error:', err)
      setMatches({})
    }
    setIsMatching(false)
  }

  // ── Derived data ──
  const sortedLibrary = [...libraryBlocks]
    .filter((b) => filterCategory === 'All' || b.category === filterCategory)
    .sort((a, b) => {
      const aMatch = matches[a.id] ? 1 : 0
      const bMatch = matches[b.id] ? 1 : 0
      return bMatch - aMatch
    })

  const categoryNames = ['All', ...Object.keys(CATEGORIES)]

  // ── Render ──
  return (
    <div onClick={() => setSelectedId(null)}>
      {/* ── Page Header ── */}
      <div className="mb-6">
        <h1 className={`text-3xl font-medium text-foreground ${mounted ? 'blur-reveal' : 'opacity-0'}`}>
          Cover Letter Workbench
        </h1>
        <p className={`text-foreground/60 mt-2 ${mounted ? 'blur-reveal-1' : 'opacity-0'}`}>
          Assemble tailored cover letters from reusable building blocks
        </p>
      </div>

      {/* ── Two-Panel Layout ── */}
      <div className={`flex flex-col lg:flex-row gap-4 ${mounted ? 'blur-reveal-2' : 'opacity-0'}`}>

        {/* ═══ LEFT PANEL: Job Posting + Cover Letter Editor ═══ */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">

          {/* ── Job Posting Input ── */}
          <div className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground/40 font-mono">
                Job Posting
              </span>
              <button
                onClick={matchBlocks}
                disabled={isMatching || !jobPosting.trim()}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isMatching || !jobPosting.trim()
                    ? 'bg-foreground/5 text-foreground/30 cursor-not-allowed'
                    : 'bg-foreground text-background hover:opacity-90 cursor-pointer'
                }`}
              >
                {isMatching ? (
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                    Matching…
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">auto_awesome</span>
                    Match Blocks
                  </span>
                )}
              </button>
            </div>
            <textarea
              value={jobPosting}
              onChange={(e) => setJobPosting(e.target.value)}
              placeholder="Paste a job posting here, then click Match Blocks to find the best sentences from your library…"
              className="w-full h-20 p-3 rounded-xl bg-foreground/5 border border-glass-border text-sm text-foreground placeholder:text-foreground/30 resize-none outline-none focus:border-glass-border-hover transition-colors"
            />
          </div>

          {/* ── Cover Letter Editor ── */}
          <HighlightEditor
            ref={editorRef}
            onBlockCountChange={setEditorBlockCount}
            onCopy={handleCopy}
            onCreateCard={(block) => setLibraryBlocks((prev) => [...prev, block])}
            isDragOver={isDragOver}
            setIsDragOver={setIsDragOver}
          />
        </div>

        {/* ═══ RIGHT PANEL: Block Library ═══ */}
        <div className="lg:w-[420px] flex flex-col gap-4">
          <div className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border p-4 flex flex-col max-h-[calc(100vh-180px)]">

            {/* ── Library header with add button ── */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground/40 font-mono">
                Block Library — {sortedLibrary.length}
              </span>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  showAddForm
                    ? 'bg-foreground text-background'
                    : 'border border-glass-border hover:bg-foreground/5 text-foreground/50 hover:text-foreground/70'
                }`}
              >
                {showAddForm ? 'Cancel' : '+ Add Block'}
              </button>
            </div>

            {/* ── Category filter pills ── */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {categoryNames.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer ${
                    filterCategory === cat
                      ? 'bg-foreground text-background'
                      : 'border border-glass-border text-foreground/50 hover:text-foreground/70 hover:bg-foreground/5'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* ── Add block form (collapsible) ── */}
            {showAddForm && (
              <div className="mb-3 p-3 rounded-xl bg-foreground/5 border border-glass-border space-y-2">
                <select
                  value={newBlockCategory}
                  onChange={(e) => setNewBlockCategory(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-glass border border-glass-border text-xs text-foreground outline-none"
                >
                  {Object.keys(CATEGORIES).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <textarea
                  value={newBlockText}
                  onChange={(e) => setNewBlockText(e.target.value)}
                  placeholder="Write a new building block in your own voice…"
                  className="w-full h-16 p-2 rounded-lg bg-glass border border-glass-border text-sm text-foreground placeholder:text-foreground/30 resize-none outline-none"
                />
                <button
                  onClick={addNewBlock}
                  disabled={!newBlockText.trim()}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                    newBlockText.trim()
                      ? 'bg-foreground text-background hover:opacity-90 cursor-pointer'
                      : 'bg-foreground/5 text-foreground/30 cursor-not-allowed'
                  }`}
                >
                  Add to Library
                </button>
              </div>
            )}

            {/* ── Scrollable block list ── */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {sortedLibrary.map((block) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  isInEditor={false}
                  isSelected={selectedId === block.id}
                  matchReason={matches[block.id]}
                  onSelect={setSelectedId}
                  onInsert={(b) => editorRef.current?.insertBlock(b)}
                />
              ))}
              {sortedLibrary.length === 0 && (
                <p className="text-sm text-foreground/30 text-center py-8">
                  No blocks in this category
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 