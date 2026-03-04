'use client'

// ─── Cover Letter Workbench ─────────────────────────────────────────────────
// A dual-panel tool for assembling cover letters from reusable "building blocks."
// Left panel: job posting input + assembled letter editor
// Right panel: categorized library of draggable sentence blocks
// AI matching (via Gemini) identifies the best blocks for a given job posting.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single reusable sentence/paragraph block in the library */
interface Block {
  id: string
  category: string
  text: string
}

/** Result from the AI matching API — which block matched and why */
interface MatchResult {
  id: string
  reason: string
}

// ─── Category Definitions ───────────────────────────────────────────────────
// Each category gets a color pair for its dot indicator and background tint.
// Colors are intentionally muted to work on both light and dark glass surfaces.

const CATEGORIES: Record<string, { dot: string; bg: string; darkBg: string }> = {
  'Client-Facing': { dot: '#3b82f6', bg: 'rgba(59,130,246,0.08)', darkBg: 'rgba(59,130,246,0.15)' },
  'Full-Stack':    { dot: '#10b981', bg: 'rgba(16,185,129,0.08)', darkBg: 'rgba(16,185,129,0.15)' },
  'AI/ML':         { dot: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', darkBg: 'rgba(139,92,246,0.15)' },
  'Embedded':      { dot: '#ef4444', bg: 'rgba(239,68,68,0.08)',  darkBg: 'rgba(239,68,68,0.15)' },
  'Hackathons':    { dot: '#f59e0b', bg: 'rgba(245,158,11,0.08)', darkBg: 'rgba(245,158,11,0.15)' },
  'Soft Skills':   { dot: '#06b6d4', bg: 'rgba(6,182,212,0.08)',  darkBg: 'rgba(6,182,212,0.15)' },
  'Closer':        { dot: '#6b7280', bg: 'rgba(107,114,128,0.08)', darkBg: 'rgba(107,114,128,0.15)' },
}

// ─── Seed Data ──────────────────────────────────────────────────────────────
// Pre-populated blocks based on Kevin's background.
// Users should replace/extend these with their own voice and experiences.

const INITIAL_BLOCKS: Block[] = [
  {
    id: '1',
    category: 'Client-Facing',
    text: 'As a Customer Application Engineer at Ivalua, I work directly with enterprise clients like T-Mobile on technical implementations, platform upgrades, and production support — bridging the gap between client needs and engineering execution.',
  },
  {
    id: '2',
    category: 'Full-Stack',
    text: 'I build full-stack applications using Next.js, Node, and React, deploying with Docker on AWS infrastructure managed through Terraform — I\'m comfortable owning a feature from database schema to production deployment.',
  },
  {
    id: '3',
    category: 'AI/ML',
    text: 'I\'ve built practical AI tooling including DepScope, a repository due diligence tool that analyzes codebases for technical risk, and ClaimGraph, an AI-powered fact-checking system with trust graph visualization.',
  },
  {
    id: '4',
    category: 'Embedded',
    text: 'My embedded systems experience with STM32 microcontrollers and bare-metal C gives me a strong foundation in resource-constrained programming, hardware-software interfaces, and systems-level thinking.',
  },
  {
    id: '5',
    category: 'Hackathons',
    text: 'I\'ve placed in multiple competitive hackathons including second place at AWS Builder Loft and the Before the Ballot civic tech hackathon — I thrive under time pressure and ship working software fast.',
  },
  {
    id: '6',
    category: 'Soft Skills',
    text: 'Working with enterprise clients has taught me to translate complex technical constraints into language stakeholders understand, and to scope work realistically when requirements are ambiguous.',
  },
  {
    id: '7',
    category: 'Closer',
    text: 'I\'d welcome the chance to discuss how my experience building production tools and working with enterprise clients could contribute to your team. I\'m available for a conversation at your convenience.',
  },
  {
    id: '8',
    category: 'Full-Stack',
    text: 'I have hands-on experience with the MERN stack, building and maintaining REST APIs, implementing authentication flows, and managing CI/CD pipelines for team projects.',
  },
  {
    id: '9',
    category: 'AI/ML',
    text: 'I\'ve worked with MCP servers and multi-agent frameworks, and I stay current with developments in transformer architectures and model optimization — I understand both the application layer and the infrastructure underneath.',
  },
  {
    id: '10',
    category: 'Hackathons',
    text: 'At hackathons I typically lead the system architecture decisions and own the backend integration work, coordinating a team of 3-4 to deliver a polished demo within 24-48 hours.',
  },
  {
    id: '11',
    category: 'Soft Skills',
    text: 'I\'m drawn to teams that value clean engineering over flashy tooling — I\'d rather ship a well-tested feature with clear documentation than a brittle prototype that demos well.',
  },
  {
    id: '12',
    category: 'Closer',
    text: 'I\'m currently based in the Bay Area and available to start immediately. I\'d love to learn more about the technical challenges your team is tackling.',
  },
]

// ─── BlockCard Component ────────────────────────────────────────────────────
// Renders a single building block as a glass card.
// Supports two modes:
//   - Library mode: draggable, shows match badge, read-only
//   - Editor mode: click-to-select, click-again-to-edit, removable

interface BlockCardProps {
  block: Block
  isInEditor: boolean         // true = rendered in the editor panel
  isSelected: boolean         // true = currently selected (blue border)
  matchReason?: string        // if present, this block was matched by AI
  onSelect: (id: string) => void
  onEdit?: (id: string, newText: string) => void
  onRemove?: (id: string) => void
}

function BlockCard({
  block,
  isInEditor,
  isSelected,
  matchReason,
  onSelect,
  onEdit,
  onRemove,
}: BlockCardProps) {
  // Local state for inline editing
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(block.text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Look up this block's category colors (fallback to gray if unknown)
  const cat = CATEGORIES[block.category] || CATEGORIES['Closer']

  // Auto-focus and auto-resize the textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [isEditing])

  // Click handler: in editor, first click selects, second click edits
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isInEditor && isSelected && !isEditing) {
      setIsEditing(true)
    } else {
      onSelect(block.id)
    }
  }

  // Save edits when the textarea loses focus
  const handleBlur = () => {
    setIsEditing(false)
    if (editText.trim() !== block.text) {
      onEdit?.(block.id, editText.trim())
    }
  }

  // Keyboard shortcuts: Enter = save, Escape = cancel
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditText(block.text)
      setIsEditing(false)
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleBlur()
    }
  }

  return (
    <div
      // Make library blocks draggable (not while editing in editor)
      draggable={!isEditing}
      onDragStart={(e) => {
        // Serialize the block data for the drop handler to read
        e.dataTransfer.setData('application/json', JSON.stringify(block))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={handleClick}
      className={`
        group relative p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing
        ${isSelected
          ? 'border-blue-400 dark:border-blue-500 shadow-sm'
          : 'border-glass-border hover:border-glass-border-hover'
        }
        ${isInEditor
          ? 'bg-glass backdrop-blur-sm'
          : 'hover:bg-glass-hover'
        }
        ${matchReason ? 'opacity-100' : ''}
      `}
    >
      {/* Category indicator row: dot + label + optional match badge + remove button */}
      <div className="flex items-center gap-2 mb-2">
        {/* Colored dot representing the category */}
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: cat.dot }}
        />
        {/* Category label in monospace */}
        <span
          className="text-[10px] font-bold uppercase tracking-wider font-mono"
          style={{ color: cat.dot }}
        >
          {block.category}
        </span>

        {/* Match badge: shown when AI selected this block */}
        {matchReason && (
          <span
            className="ml-auto text-[10px] font-bold text-white rounded-full px-2 py-0.5 font-mono"
            style={{ backgroundColor: cat.dot }}
            title={matchReason}
          >
            MATCH
          </span>
        )}

        {/* Remove button: only in editor, appears on hover */}
        {isInEditor && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove?.(block.id) }}
            className={`${matchReason ? 'ml-1' : 'ml-auto'} text-foreground/30 hover:text-foreground/70 transition-colors opacity-0 group-hover:opacity-100`}
            title="Remove from editor"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        )}
      </div>

      {/* Block text: either an editable textarea or a read-only paragraph */}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={(e) => {
            setEditText(e.target.value)
            // Auto-resize as the user types
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent border-none outline-none resize-none text-sm leading-relaxed text-foreground"
        />
      ) : (
        <p className="text-sm leading-relaxed text-foreground/80 m-0">
          {block.text}
        </p>
      )}

      {/* Match reason tooltip displayed below the text */}
      {matchReason && !isInEditor && (
        <p className="text-xs text-foreground/40 mt-2 italic">
          {matchReason}
        </p>
      )}
    </div>
  )
}

// ─── Main Page Component ────────────────────────────────────────────────────
// Orchestrates the dual-panel layout, drag-and-drop, AI matching, and editing.

export default function CoverLetterWorkbench() {
  // Safari blur-reveal animation fix: mount state triggers CSS class addition
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // ── Core state ──
  // Library: all available blocks (persisted to localStorage below)
  const [libraryBlocks, setLibraryBlocks] = useState<Block[]>(INITIAL_BLOCKS)
  // Editor: blocks the user has assembled into their cover letter
  const [editorBlocks, setEditorBlocks] = useState<Block[]>([])
  // Currently selected block ID (used for click-to-edit in editor)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── Job posting & AI matching ──
  const [jobPosting, setJobPosting] = useState('')
  // Map of block ID → match reason from the AI
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

  // ── localStorage persistence ──
  // Load saved blocks from localStorage on mount (if available)
  useEffect(() => {
    try {
      const savedLibrary = localStorage.getItem('cl-library')
      const savedEditor = localStorage.getItem('cl-editor')
      if (savedLibrary) setLibraryBlocks(JSON.parse(savedLibrary))
      if (savedEditor) setEditorBlocks(JSON.parse(savedEditor))
    } catch { /* ignore parse errors */ }
  }, [])

  // Save to localStorage whenever blocks change
  useEffect(() => {
    localStorage.setItem('cl-library', JSON.stringify(libraryBlocks))
  }, [libraryBlocks])
  useEffect(() => {
    localStorage.setItem('cl-editor', JSON.stringify(editorBlocks))
  }, [editorBlocks])

  // ── Drag-and-drop handlers ──

  /** When a block is dropped into the editor area */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    try {
      const block: Block = JSON.parse(e.dataTransfer.getData('application/json'))
      // Prevent duplicates — each block can only appear once in the editor
      if (!editorBlocks.find((b) => b.id === block.id)) {
        setEditorBlocks((prev) => [...prev, { ...block }])
      }
    } catch { /* ignore invalid drag data */ }
  }, [editorBlocks])

  // ── Block manipulation handlers ──

  /** Remove a block from the editor (returns it to library-only) */
  const removeFromEditor = (id: string) => {
    setEditorBlocks((prev) => prev.filter((b) => b.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  /** Edit a block's text in both the editor and library simultaneously */
  const editBlock = (id: string, newText: string) => {
    setEditorBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, text: newText } : b)))
    setLibraryBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, text: newText } : b)))
  }

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
      // Convert the matches array to a lookup map: { blockId: reason }
      const matchMap: Record<string, string> = {}
      data.matches?.forEach((m: MatchResult) => { matchMap[m.id] = m.reason })
      setMatches(matchMap)
    } catch (err) {
      console.error('Match error:', err)
      setMatches({})
    }
    setIsMatching(false)
  }

  // ── Copy to clipboard ──
  const copyToClipboard = () => {
    const text = editorBlocks.map((b) => b.text).join('\n\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Derived data ──
  // Filter library by selected category, sort matched blocks to the top
  const sortedLibrary = [...libraryBlocks]
    .filter((b) => filterCategory === 'All' || b.category === filterCategory)
    .sort((a, b) => {
      const aMatch = matches[a.id] ? 1 : 0
      const bMatch = matches[b.id] ? 1 : 0
      return bMatch - aMatch
    })

  // All category names for the filter pills
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
      {/* On mobile: stacked vertically. On desktop: side-by-side. */}
      <div className={`flex flex-col lg:flex-row gap-4 ${mounted ? 'blur-reveal-2' : 'opacity-0'}`}>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* LEFT PANEL: Job Posting + Cover Letter Editor                   */}
        {/* ════════════════════════════════════════════════════════════════ */}
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

          {/* ── Cover Letter Editor (Drop Zone) ── */}
          <div className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border p-4 flex-1 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground/40 font-mono">
                Cover Letter — {editorBlocks.length} block{editorBlocks.length !== 1 ? 's' : ''}
              </span>
              {editorBlocks.length > 0 && (
                <button
                  onClick={copyToClipboard}
                  className="px-3 py-1 rounded-full text-xs font-medium border border-glass-border hover:bg-foreground/5 text-foreground/50 hover:text-foreground/70 transition-all cursor-pointer"
                >
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">
                      {copied ? 'check' : 'content_copy'}
                    </span>
                    {copied ? 'Copied!' : 'Copy Text'}
                  </span>
                </button>
              )}
            </div>

            {/* Drop zone: blocks are dragged here from the library */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              className={`flex-1 rounded-xl border-2 border-dashed p-3 space-y-2 transition-all ${
                isDragOver
                  ? 'border-blue-400 bg-blue-500/5'
                  : 'border-glass-border'
              }`}
            >
              {editorBlocks.length === 0 ? (
                /* Empty state prompt */
                <div className="flex items-center justify-center h-full text-foreground/30 text-sm text-center leading-relaxed">
                  <div>
                    <span className="material-symbols-outlined text-3xl block mb-2">drag_indicator</span>
                    Drag blocks from the library
                    <br />
                    or click Match Blocks to find the best ones
                  </div>
                </div>
              ) : (
                /* Assembled blocks */
                editorBlocks.map((block) => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    isInEditor={true}
                    isSelected={selectedId === block.id}
                    matchReason={matches[block.id]}
                    onSelect={setSelectedId}
                    onEdit={editBlock}
                    onRemove={removeFromEditor}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* RIGHT PANEL: Block Library                                      */}
        {/* ════════════════════════════════════════════════════════════════ */}
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
                {/* Category selector dropdown */}
                <select
                  value={newBlockCategory}
                  onChange={(e) => setNewBlockCategory(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-glass border border-glass-border text-xs text-foreground outline-none"
                >
                  {Object.keys(CATEGORIES).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                {/* Text input for the new block */}
                <textarea
                  value={newBlockText}
                  onChange={(e) => setNewBlockText(e.target.value)}
                  placeholder="Write a new building block in your own voice…"
                  className="w-full h-16 p-2 rounded-lg bg-glass border border-glass-border text-sm text-foreground placeholder:text-foreground/30 resize-none outline-none"
                />
                {/* Submit button */}
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