'use client'

// ─── Cover Letter Workbench — Page Orchestrator ─────────────────────────────
// This is the top-level page component that wires together the three modules:
//   - types.ts: Block, Tag, MatchResult, CATEGORIES
//   - BlockCard.tsx: Library card component
//   - HighlightEditor.tsx: ContentEditable editor with inline highlights
//
// This file handles:
//   - Page layout (two-panel: editor left, library right)
//   - AI block matching (calls /api/coverletter/match)
//   - Library state management (load/add/edit/delete blocks and tags)
//   - Drag-and-drop visual feedback between panels
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'
import { Block, BlockDraft, MatchResult, Tag, CATEGORIES, DEFAULT_BLOCK_CATEGORY } from './types'
import BlockCard from './BlockCard'
import HighlightEditor, { type HighlightEditorHandle } from './HighlightEditor'

const EMPTY_BLOCK_FORM: BlockDraft = {
  category: DEFAULT_BLOCK_CATEGORY,
  text: '',
  tagIds: [],
}

// ─── Main Page Component ────────────────────────────────────────────────────

export default function CoverLetterWorkbench() {
  // Safari blur-reveal animation fix: mount state triggers CSS class addition
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Ref to the HighlightEditor — used to insert blocks via click
  const editorRef = useRef<HighlightEditorHandle>(null)

  // ── Core state ──
  const [libraryBlocks, setLibraryBlocks] = useState<Block[]>([])
  const [libraryTags, setLibraryTags] = useState<Tag[]>([])
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── Job posting & AI matching ──
  const [jobPosting, setJobPosting] = useState('')
  const [matches, setMatches] = useState<Record<string, string>>({})
  const [isMatching, setIsMatching] = useState(false)

  // ── Library filter ──
  const [filterCategory, setFilterCategory] = useState('All')
  const [filterTagId, setFilterTagId] = useState('All')

  // ── Add block form ──
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [blockForm, setBlockForm] = useState<BlockDraft>(EMPTY_BLOCK_FORM)
  const [isSavingBlock, setIsSavingBlock] = useState(false)

  // ── Tag manager ──
  const [showTagManager, setShowTagManager] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingTagName, setEditingTagName] = useState('')
  const [isSavingTag, setIsSavingTag] = useState(false)

  // ── Drag-and-drop visual feedback ──
  const [isDragOver, setIsDragOver] = useState(false)

  // ── Editor block count (reported by HighlightEditor) ──
  const [editorBlockCount, setEditorBlockCount] = useState(0)

  const fetchLibrary = useCallback(async (showLoading = true) => {
    if (showLoading) setLibraryLoading(true)
    setLibraryError(null)

    try {
      const res = await fetch('/api/coverletter/library', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load cover letter library')

      setLibraryBlocks(data.blocks ?? [])
      setLibraryTags(data.tags ?? [])
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Failed to load cover letter library')
    } finally {
      setLibraryLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchLibrary()
  }, [fetchLibrary])

  useEffect(() => {
    if (!statusMessage) return
    const timeoutId = window.setTimeout(() => setStatusMessage(null), 2500)
    return () => window.clearTimeout(timeoutId)
  }, [statusMessage])

  const openCreateForm = useCallback(() => {
    setEditingBlockId(null)
    setBlockForm(EMPTY_BLOCK_FORM)
    setShowAddForm(true)
  }, [])

  const closeBlockForm = useCallback(() => {
    setEditingBlockId(null)
    setBlockForm(EMPTY_BLOCK_FORM)
    setShowAddForm(false)
  }, [])

  const startEditingBlock = useCallback((block: Block) => {
    setEditingBlockId(block.id)
    setSelectedId(block.id)
    setBlockForm({
      category: block.category,
      text: block.text,
      tagIds: block.tags.map((tag) => tag.id),
    })
    setShowAddForm(true)
  }, [])

  const saveBlock = useCallback(async () => {
    if (!blockForm.text.trim()) return

    setIsSavingBlock(true)
    setLibraryError(null)

    try {
      const isEditing = Boolean(editingBlockId)
      const url = isEditing
        ? `/api/coverletter/blocks/${editingBlockId}`
        : '/api/coverletter/blocks'

      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blockForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save block')

      await fetchLibrary(false)
      closeBlockForm()
      setStatusMessage(isEditing ? 'Block updated' : 'Block added to the library')
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Failed to save block')
    } finally {
      setIsSavingBlock(false)
    }
  }, [blockForm, closeBlockForm, editingBlockId, fetchLibrary])

  const deleteBlock = useCallback(async (blockId: string) => {
    setLibraryError(null)

    try {
      const res = await fetch(`/api/coverletter/blocks/${blockId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete block')

      setSelectedId((prev) => (prev === blockId ? null : prev))
      setMatches((prev) => {
        const next = { ...prev }
        delete next[blockId]
        return next
      })

      if (editingBlockId === blockId) closeBlockForm()

      await fetchLibrary(false)
      setStatusMessage('Block deleted')
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Failed to delete block')
    }
  }, [closeBlockForm, editingBlockId, fetchLibrary])

  const toggleBlockTag = useCallback((tagId: string) => {
    setBlockForm((prev) => ({
      ...prev,
      tagIds: prev.tagIds.includes(tagId)
        ? prev.tagIds.filter((existingId) => existingId !== tagId)
        : [...prev.tagIds, tagId],
    }))
  }, [])

  const createTag = useCallback(async () => {
    if (!newTagName.trim()) return

    setIsSavingTag(true)
    setLibraryError(null)

    try {
      const res = await fetch('/api/coverletter/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create tag')

      setNewTagName('')
      await fetchLibrary(false)
      setStatusMessage('Tag created')
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Failed to create tag')
    } finally {
      setIsSavingTag(false)
    }
  }, [fetchLibrary, newTagName])

  const saveTag = useCallback(async () => {
    if (!editingTagId || !editingTagName.trim()) return

    setIsSavingTag(true)
    setLibraryError(null)

    try {
      const res = await fetch(`/api/coverletter/tags/${editingTagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingTagName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update tag')

      setEditingTagId(null)
      setEditingTagName('')
      await fetchLibrary(false)
      setStatusMessage('Tag updated')
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Failed to update tag')
    } finally {
      setIsSavingTag(false)
    }
  }, [editingTagId, editingTagName, fetchLibrary])

  const deleteTag = useCallback(async (tagId: string) => {
    setIsSavingTag(true)
    setLibraryError(null)

    try {
      const res = await fetch(`/api/coverletter/tags/${tagId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete tag')

      setBlockForm((prev) => ({
        ...prev,
        tagIds: prev.tagIds.filter((existingId) => existingId !== tagId),
      }))
      setFilterTagId((prev) => (prev === tagId ? 'All' : prev))
      setEditingTagId((prev) => (prev === tagId ? null : prev))
      setEditingTagName('')
      await fetchLibrary(false)
      setStatusMessage('Tag deleted')
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Failed to delete tag')
    } finally {
      setIsSavingTag(false)
    }
  }, [fetchLibrary])

  // ── Copy feedback handler (called by HighlightEditor) ──
  const handleCopy = useCallback(() => {
    setStatusMessage('Cover letter copied to clipboard')
  }, [])

  const handleCreateCard = useCallback(async (block: Pick<Block, 'category' | 'text'>) => {
    try {
      const res = await fetch('/api/coverletter/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: block.category,
          text: block.text,
          tagIds: [],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save new block')

      await fetchLibrary(false)
      setStatusMessage('Selection saved as a library block')
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Failed to save new block')
    }
  }, [fetchLibrary])

  // ── AI matching ──
  // Calls the server-side Gemini proxy to find the best blocks for a job posting
  const matchBlocks = async () => {
    if (!jobPosting.trim() || libraryBlocks.length === 0) return
    setIsMatching(true)
    setLibraryError(null)
    try {
      const res = await fetch('/api/coverletter/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobPosting, blocks: libraryBlocks }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Match failed')
      const matchMap: Record<string, string> = {}
      data.matches?.forEach((m: MatchResult) => { matchMap[m.id] = m.reason })
      setMatches(matchMap)
    } catch (err) {
      console.error('Match error:', err)
      setMatches({})
      setLibraryError(err instanceof Error ? err.message : 'Block matching failed')
    }
    setIsMatching(false)
  }

  // ── Derived data ──
  const sortedLibrary = [...libraryBlocks]
    .filter((b) => filterCategory === 'All' || b.category === filterCategory)
    .filter((b) => filterTagId === 'All' || b.tags.some((tag) => tag.id === filterTagId))
    .sort((a, b) => {
      const aMatch = matches[a.id] ? 1 : 0
      const bMatch = matches[b.id] ? 1 : 0
      return bMatch - aMatch
    })

  const categoryNames = [
    'All',
    ...Array.from(new Set([...Object.keys(CATEGORIES), ...libraryBlocks.map((block) => block.category)])),
  ]

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
        {statusMessage && (
          <p className="text-sm text-emerald-600 mt-2">{statusMessage}</p>
        )}
        {libraryError && (
          <p className="text-sm text-red-500 mt-2">{libraryError}</p>
        )}
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
                disabled={isMatching || !jobPosting.trim() || libraryBlocks.length === 0}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isMatching || !jobPosting.trim() || libraryBlocks.length === 0
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
            onCreateCard={handleCreateCard}
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
                onClick={(e) => {
                  e.stopPropagation()
                  if (showAddForm && !editingBlockId) {
                    closeBlockForm()
                  } else {
                    openCreateForm()
                  }
                }}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                  showAddForm && !editingBlockId
                    ? 'bg-foreground text-background'
                    : 'border border-glass-border hover:bg-foreground/5 text-foreground/50 hover:text-foreground/70'
                }`}
              >
                {showAddForm && !editingBlockId ? 'Cancel' : '+ Add Block'}
              </button>
            </div>

            {/* ── Category filter pills ── */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {categoryNames.map((cat) => (
                <button
                  key={cat}
                  onClick={(e) => {
                    e.stopPropagation()
                    setFilterCategory(cat)
                  }}
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

            {libraryTags.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/35 font-mono mb-1.5">
                  Tag Filter
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setFilterTagId('All')
                    }}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer ${
                      filterTagId === 'All'
                        ? 'bg-foreground text-background'
                        : 'border border-glass-border text-foreground/50 hover:text-foreground/70 hover:bg-foreground/5'
                    }`}
                  >
                    All tags
                  </button>
                  {libraryTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setFilterTagId(tag.id)
                      }}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer ${
                        filterTagId === tag.id
                          ? 'bg-foreground text-background'
                          : 'border border-glass-border text-foreground/50 hover:text-foreground/70 hover:bg-foreground/5'
                      }`}
                    >
                      #{tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Add block form (collapsible) ── */}
            {showAddForm && (
              <div className="mb-3 p-3 rounded-xl bg-foreground/5 border border-glass-border space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground/60">
                    {editingBlockId ? 'Edit block' : 'Add block'}
                  </p>
                  {editingBlockId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        closeBlockForm()
                      }}
                      className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <select
                  value={blockForm.category}
                  onChange={(e) => setBlockForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-1.5 rounded-lg bg-glass border border-glass-border text-xs text-foreground outline-none"
                >
                  {Object.keys(CATEGORIES).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <textarea
                  value={blockForm.text}
                  onChange={(e) => setBlockForm((prev) => ({ ...prev, text: e.target.value }))}
                  placeholder="Write a new building block in your own voice…"
                  className="w-full h-24 p-2 rounded-lg bg-glass border border-glass-border text-sm text-foreground placeholder:text-foreground/30 resize-none outline-none"
                />

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/35 font-mono mb-1.5">
                    Tags
                  </p>
                  {libraryTags.length === 0 ? (
                    <p className="text-xs text-foreground/35">Create tags below, then assign them to blocks here.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {libraryTags.map((tag) => (
                        <button
                          key={tag.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleBlockTag(tag.id)
                          }}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer ${
                            blockForm.tagIds.includes(tag.id)
                              ? 'bg-foreground text-background'
                              : 'border border-glass-border text-foreground/50 hover:text-foreground/70 hover:bg-foreground/5'
                          }`}
                        >
                          #{tag.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void saveBlock()
                    }}
                    disabled={isSavingBlock || !blockForm.text.trim()}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                      blockForm.text.trim() && !isSavingBlock
                        ? 'bg-foreground text-background hover:opacity-90 cursor-pointer'
                        : 'bg-foreground/5 text-foreground/30 cursor-not-allowed'
                    }`}
                  >
                    {isSavingBlock ? 'Saving…' : editingBlockId ? 'Save changes' : 'Add to Library'}
                  </button>

                  {editingBlockId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void deleteBlock(editingBlockId)
                      }}
                      className="px-4 py-1.5 rounded-full text-xs font-medium border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
                    >
                      Delete block
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="mb-3 p-3 rounded-xl bg-foreground/5 border border-glass-border space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-foreground/60">Tags — {libraryTags.length}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowTagManager((prev) => !prev)
                  }}
                  className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors cursor-pointer"
                >
                  {showTagManager ? 'Hide' : 'Manage Tags'}
                </button>
              </div>

              {showTagManager && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="Add a new tag…"
                      className="flex-1 px-3 py-2 rounded-lg bg-glass border border-glass-border text-sm text-foreground placeholder:text-foreground/30 outline-none"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void createTag()
                      }}
                      disabled={isSavingTag || !newTagName.trim()}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        newTagName.trim() && !isSavingTag
                          ? 'bg-foreground text-background hover:opacity-90 cursor-pointer'
                          : 'bg-foreground/5 text-foreground/30 cursor-not-allowed'
                      }`}
                    >
                      Add Tag
                    </button>
                  </div>

                  {libraryTags.length === 0 ? (
                    <p className="text-xs text-foreground/35">No tags yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {libraryTags.map((tag) => (
                        <div key={tag.id} className="flex items-center gap-2 rounded-lg border border-glass-border bg-glass px-3 py-2">
                          {editingTagId === tag.id ? (
                            <>
                              <input
                                autoFocus
                                value={editingTagName}
                                onChange={(e) => setEditingTagName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    void saveTag()
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingTagId(null)
                                    setEditingTagName('')
                                  }
                                }}
                                className="flex-1 bg-transparent text-sm text-foreground outline-none"
                              />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void saveTag()
                                }}
                                disabled={isSavingTag || !editingTagName.trim()}
                                className="text-foreground/40 hover:text-foreground/70 transition-colors cursor-pointer"
                                title="Save tag"
                              >
                                <span className="material-symbols-outlined text-base">check</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-sm text-foreground/75">#{tag.name}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingTagId(tag.id)
                                  setEditingTagName(tag.name)
                                }}
                                className="text-foreground/30 hover:text-foreground/70 transition-colors cursor-pointer"
                                title="Edit tag"
                              >
                                <span className="material-symbols-outlined text-base">edit</span>
                              </button>
                            </>
                          )}

                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              void deleteTag(tag.id)
                            }}
                            className="text-foreground/30 hover:text-red-500 transition-colors cursor-pointer"
                            title="Delete tag"
                          >
                            <span className="material-symbols-outlined text-base">delete</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Scrollable block list ── */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {libraryLoading ? (
                <div className="py-10 text-center text-sm text-foreground/35">
                  Loading library…
                </div>
              ) : sortedLibrary.map((block) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  isInEditor={false}
                  isSelected={selectedId === block.id}
                  matchReason={matches[block.id]}
                  onSelect={setSelectedId}
                  onInsert={(b) => editorRef.current?.insertBlock(b)}
                  onManage={startEditingBlock}
                  onRemove={(blockId) => void deleteBlock(blockId)}
                />
              ))}
              {!libraryLoading && sortedLibrary.length === 0 && (
                <p className="text-sm text-foreground/30 text-center py-8">
                  {libraryBlocks.length === 0
                    ? 'No blocks in the library yet'
                    : 'No blocks match the current filters'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 