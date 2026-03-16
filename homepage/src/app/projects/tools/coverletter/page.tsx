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

interface StoredReferenceResumeSummary {
  id: string
  name: string
  size: number
  uploadedAt: string | null
  href: string
}

interface StoredCoverLetterSummary {
  id: string
  title: string
  size: number
  updatedAt: string | null
}

interface StoredCoverLetterDocument {
  id: string
  title: string
  html: string
  plainText: string
  jobPosting: string
}

type ReviewScore = 'Strong' | 'Adequate' | 'Weak'

interface CoverLetterReviewCriterion {
  name: string
  score: ReviewScore
  feedback: string
}

interface CoverLetterReviewResult {
  overallAssessment: string
  highestImpactChange: string
  referenceResumesUsed: string[]
  criteria: CoverLetterReviewCriterion[]
  weakestParagraph: {
    original: string
    rewritten: string
  }
}

function formatStorageSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

function formatStorageTimestamp(value: string | null) {
  if (!value) return 'Unknown'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getReviewScoreClasses(score: ReviewScore) {
  if (score === 'Strong') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
  }

  if (score === 'Adequate') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
  }

  return 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
}

// ─── Main Page Component ────────────────────────────────────────────────────

export default function CoverLetterWorkbench() {
  // Safari blur-reveal animation fix: mount state triggers CSS class addition
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Ref to the HighlightEditor — used to insert blocks via click
  const editorRef = useRef<HighlightEditorHandle>(null)
  const referenceResumeInputRef = useRef<HTMLInputElement>(null)

  // ── Core state ──
  const [libraryBlocks, setLibraryBlocks] = useState<Block[]>([])
  const [libraryTags, setLibraryTags] = useState<Tag[]>([])
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── S3-backed draft + resume storage ──
  const [referenceResumes, setReferenceResumes] = useState<StoredReferenceResumeSummary[]>([])
  const [savedLetters, setSavedLetters] = useState<StoredCoverLetterSummary[]>([])
  const [storageLoading, setStorageLoading] = useState(true)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [activeLetterId, setActiveLetterId] = useState<string | null>(null)
  const [isUploadingResume, setIsUploadingResume] = useState(false)
  const [isSavingLetter, setIsSavingLetter] = useState(false)
  const [loadingLetterId, setLoadingLetterId] = useState<string | null>(null)
  const [deletingLetterId, setDeletingLetterId] = useState<string | null>(null)
  const [deletingResumeId, setDeletingResumeId] = useState<string | null>(null)

  // ── Job posting & AI matching ──
  const [jobPosting, setJobPosting] = useState('')
  const [matches, setMatches] = useState<Record<string, string>>({})
  const [isMatching, setIsMatching] = useState(false)
  const [isGrading, setIsGrading] = useState(false)
  const [reviewResult, setReviewResult] = useState<CoverLetterReviewResult | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)

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

  const fetchStorage = useCallback(async (showLoading = true) => {
    if (showLoading) setStorageLoading(true)
    setStorageError(null)

    try {
      const [resumeRes, letterRes] = await Promise.all([
        fetch('/api/coverletter/reference-resumes', { cache: 'no-store' }),
        fetch('/api/coverletter/letters', { cache: 'no-store' }),
      ])
      const [resumeData, letterData] = await Promise.all([resumeRes.json(), letterRes.json()])

      if (!resumeRes.ok) throw new Error(resumeData.error || 'Failed to load reference resumes')
      if (!letterRes.ok) throw new Error(letterData.error || 'Failed to load saved cover letters')

      setReferenceResumes(resumeData.resumes ?? [])
      setSavedLetters(letterData.letters ?? [])
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Failed to load S3-backed cover letter assets')
    } finally {
      setStorageLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchStorage()
  }, [fetchStorage])

  useEffect(() => {
    if (!statusMessage) return
    const timeoutId = window.setTimeout(() => setStatusMessage(null), 2500)
    return () => window.clearTimeout(timeoutId)
  }, [statusMessage])

  const openCreateForm = useCallback(() => {
    setEditingBlockId(null)
    setBlockForm({
      ...EMPTY_BLOCK_FORM,
      category: filterCategory !== 'All' ? filterCategory : EMPTY_BLOCK_FORM.category,
    })
    setShowAddForm(true)
  }, [filterCategory])

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

  const resetDraft = useCallback((message = 'Started a fresh cover letter draft') => {
    editorRef.current?.clear()
    setDraftTitle('')
    setActiveLetterId(null)
    setJobPosting('')
    setMatches({})
    setReviewResult(null)
    setReviewError(null)
    setStatusMessage(message)
  }, [])

  const handleReferenceResumeSelected = useCallback(async (file: File | null) => {
    if (!file) return

    setIsUploadingResume(true)
    setStorageError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/coverletter/reference-resumes', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to upload reference resume')

      await fetchStorage(false)
      setStatusMessage(`${data.resume?.name ?? 'Reference resume'} uploaded to S3`)
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Failed to upload reference resume')
    } finally {
      setIsUploadingResume(false)
      if (referenceResumeInputRef.current) {
        referenceResumeInputRef.current.value = ''
      }
    }
  }, [fetchStorage])

  const deleteReferenceResume = useCallback(async (resume: StoredReferenceResumeSummary) => {
    if (!window.confirm(`Delete ${resume.name} from S3?`)) return

    setDeletingResumeId(resume.id)
    setStorageError(null)

    try {
      const res = await fetch(`/api/coverletter/reference-resumes/${resume.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete reference resume')

      await fetchStorage(false)
      setStatusMessage(`${resume.name} deleted from S3`)
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Failed to delete reference resume')
    } finally {
      setDeletingResumeId(null)
    }
  }, [fetchStorage])

  const saveCurrentLetter = useCallback(async () => {
    const html = editorRef.current?.getHtml() ?? ''
    const plainText = editorRef.current?.getPlainText() ?? ''

    if (!plainText.trim()) {
      setStorageError('Add some cover letter content before saving to S3')
      return
    }

    setIsSavingLetter(true)
    setStorageError(null)

    try {
      const isUpdating = Boolean(activeLetterId)
      const res = await fetch(isUpdating ? `/api/coverletter/letters/${activeLetterId}` : '/api/coverletter/letters', {
        method: isUpdating ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draftTitle.trim() || 'Untitled Draft',
          html,
          plainText,
          jobPosting,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save cover letter')

      const letter = data.letter as StoredCoverLetterDocument
      setActiveLetterId(letter.id)
      setDraftTitle(letter.title)
      await fetchStorage(false)
      setStatusMessage(isUpdating ? 'Cover letter draft updated in S3' : 'Cover letter draft saved to S3')
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Failed to save cover letter')
    } finally {
      setIsSavingLetter(false)
    }
  }, [activeLetterId, draftTitle, fetchStorage, jobPosting])

  const loadSavedLetter = useCallback(async (letterId: string) => {
    setLoadingLetterId(letterId)
    setStorageError(null)

    try {
      const res = await fetch(`/api/coverletter/letters/${letterId}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load saved cover letter')

      const letter = data.letter as StoredCoverLetterDocument
      editorRef.current?.loadHtml(letter.html)
      setDraftTitle(letter.title)
      setActiveLetterId(letter.id)
      setJobPosting(letter.jobPosting ?? '')
      setMatches({})
      setReviewResult(null)
      setReviewError(null)
      setStatusMessage(`Loaded ${letter.title}`)
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Failed to load saved cover letter')
    } finally {
      setLoadingLetterId(null)
    }
  }, [])

  const deleteSavedLetter = useCallback(async (letter: StoredCoverLetterSummary) => {
    if (!window.confirm(`Delete ${letter.title} from S3?`)) return

    setDeletingLetterId(letter.id)
    setStorageError(null)

    try {
      const res = await fetch(`/api/coverletter/letters/${letter.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete saved cover letter')

      await fetchStorage(false)
      if (activeLetterId === letter.id) {
        resetDraft('Deleted the active S3 draft')
      } else {
        setStatusMessage(`${letter.title} deleted from S3`)
      }
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Failed to delete saved cover letter')
    } finally {
      setDeletingLetterId(null)
    }
  }, [activeLetterId, fetchStorage, resetDraft])

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

  const gradeCurrentLetter = useCallback(async () => {
    const coverLetter = editorRef.current?.getPlainText() ?? ''
    if (!coverLetter.trim()) {
      setReviewError('Add some cover letter content before running the rubric review')
      setReviewResult(null)
      return
    }

    if (!jobPosting.trim()) {
      setReviewError('Paste a job posting before running the rubric review')
      setReviewResult(null)
      return
    }

    setIsGrading(true)
    setReviewResult(null)
    setReviewError(null)

    try {
      const res = await fetch('/api/coverletter/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverLetter, jobPosting }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to grade cover letter')

      setReviewResult(data.review ?? null)
      setStatusMessage('Cover letter reviewed against your rubric')
    } catch (error) {
      setReviewResult(null)
      setReviewError(error instanceof Error ? error.message : 'Failed to grade cover letter')
    } finally {
      setIsGrading(false)
    }
  }, [jobPosting])

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
              <div className="flex flex-wrap items-center gap-2">
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

                <button
                  onClick={() => void gradeCurrentLetter()}
                  disabled={isGrading || !jobPosting.trim() || editorBlockCount === 0}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isGrading || !jobPosting.trim() || editorBlockCount === 0
                      ? 'bg-foreground/5 text-foreground/30 cursor-not-allowed'
                      : 'border border-glass-border hover:bg-foreground/5 text-foreground/60 hover:text-foreground/80 cursor-pointer'
                  }`}
                >
                  {isGrading ? (
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      Grading…
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">auto_awesome</span>
                      Grade Letter
                    </span>
                  )}
                </button>
              </div>
            </div>
            <textarea
              value={jobPosting}
              onChange={(e) => {
                setJobPosting(e.target.value)
                setReviewResult(null)
                setReviewError(null)
              }}
              placeholder="Paste a job posting here, then click Match Blocks to find the best sentences from your library…"
              className="w-full h-20 p-3 rounded-xl bg-foreground/5 border border-glass-border text-sm text-foreground placeholder:text-foreground/30 resize-none outline-none focus:border-glass-border-hover transition-colors"
            />
          </div>

          {(isGrading || reviewResult || reviewError) && (
            <div className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-foreground/40 font-mono">
                    Gemini Rubric Review
                  </p>
                  <p className="text-sm text-foreground/50 mt-1">
                    Scores the current letter against your verbatim cover letter rubric.
                  </p>
                </div>

                {isGrading && (
                  <span className="text-xs text-foreground/35">Scoring…</span>
                )}
              </div>

              {reviewError && (
                <p className="text-sm text-red-500">{reviewError}</p>
              )}

              {reviewResult && (
                <>
                  {reviewResult.referenceResumesUsed.length > 0 && (
                    <div className="rounded-xl border border-glass-border bg-foreground/5 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/35 font-mono">
                        Resume Context Used
                      </p>
                      <p className="text-sm text-foreground/65 mt-2 leading-relaxed">
                        {reviewResult.referenceResumesUsed.join(', ')}
                      </p>
                    </div>
                  )}

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-glass-border bg-foreground/5 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/35 font-mono">
                        Overall Assessment
                      </p>
                      <p className="text-sm text-foreground/75 mt-2 leading-relaxed">
                        {reviewResult.overallAssessment}
                      </p>
                    </div>

                    <div className="rounded-xl border border-glass-border bg-foreground/5 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/35 font-mono">
                        Highest-Impact Change
                      </p>
                      <p className="text-sm text-foreground/75 mt-2 leading-relaxed">
                        {reviewResult.highestImpactChange}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-glass-border bg-foreground/5 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/35 font-mono">
                      Weakest Paragraph Rewrite
                    </p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/35 font-mono">
                          Original
                        </p>
                        <p className="text-sm text-foreground/60 mt-2 leading-relaxed italic">
                          {reviewResult.weakestParagraph.original}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/35 font-mono">
                          Rewrite
                        </p>
                        <p className="text-sm text-foreground/80 mt-2 leading-relaxed">
                          {reviewResult.weakestParagraph.rewritten}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    {reviewResult.criteria.map((criterion) => (
                      <div key={criterion.name} className="rounded-xl border border-glass-border bg-foreground/5 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-foreground/80 leading-snug">
                            {criterion.name}
                          </p>
                          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${getReviewScoreClasses(criterion.score)}`}>
                            {criterion.score}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/60 mt-2 leading-relaxed">
                          {criterion.feedback}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border p-4 space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-foreground/40 font-mono">
                  S3 Drafts & Resumes
                </p>
                <p className="text-sm text-foreground/50 mt-1">
                  Save full cover letter drafts and keep reference resumes attached to this workbench.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => resetDraft()}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border border-glass-border hover:bg-foreground/5 text-foreground/55 hover:text-foreground/75 transition-all cursor-pointer"
                >
                  New Draft
                </button>
                <button
                  onClick={() => void saveCurrentLetter()}
                  disabled={isSavingLetter}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isSavingLetter
                      ? 'bg-foreground/5 text-foreground/30 cursor-not-allowed'
                      : 'bg-foreground text-background hover:opacity-90 cursor-pointer'
                  }`}
                >
                  {isSavingLetter ? 'Saving…' : activeLetterId ? 'Update Draft' : 'Save Draft'}
                </button>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-foreground/35 font-mono">
                    Draft Title
                  </label>
                  <input
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder="Summer 2026 SWE Internship"
                    className="mt-1.5 w-full px-3 py-2 rounded-xl bg-foreground/5 border border-glass-border text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-glass-border-hover transition-colors"
                  />
                </div>

                <div className="rounded-xl bg-foreground/5 border border-glass-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-foreground/60">Saved Letters — {savedLetters.length}</p>
                    {activeLetterId && (
                      <span className="text-[10px] font-medium text-foreground/35">Loaded from S3</span>
                    )}
                  </div>

                  {storageLoading ? (
                    <p className="text-xs text-foreground/35">Loading saved drafts…</p>
                  ) : savedLetters.length === 0 ? (
                    <p className="text-xs text-foreground/35">No S3 drafts yet. Save the current editor state to create one.</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {savedLetters.map((letter) => (
                        <div
                          key={letter.id}
                          className={`rounded-xl border px-3 py-2 transition-colors ${
                            activeLetterId === letter.id
                              ? 'border-foreground/20 bg-foreground/8'
                              : 'border-glass-border bg-glass'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <button
                              onClick={() => void loadSavedLetter(letter.id)}
                              className="min-w-0 text-left cursor-pointer"
                              disabled={loadingLetterId === letter.id}
                            >
                              <p className="text-sm text-foreground/80 truncate">
                                {loadingLetterId === letter.id ? 'Loading…' : letter.title}
                              </p>
                              <p className="text-[11px] text-foreground/35 mt-1">
                                {formatStorageTimestamp(letter.updatedAt)} · {formatStorageSize(letter.size)}
                              </p>
                            </button>

                            <button
                              onClick={() => void deleteSavedLetter(letter)}
                              disabled={deletingLetterId === letter.id}
                              className="text-foreground/30 hover:text-red-500 transition-colors cursor-pointer disabled:text-foreground/15"
                              title="Delete saved draft"
                            >
                              <span className="material-symbols-outlined text-base">
                                {deletingLetterId === letter.id ? 'progress_activity' : 'delete'}
                              </span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-foreground/60">Reference Resumes — {referenceResumes.length}</p>
                    <p className="text-[11px] text-foreground/35 mt-1">
                      The rubric review automatically uses up to the 3 most recent uploaded PDFs as resume context.
                    </p>
                  </div>

                  <>
                    <input
                      ref={referenceResumeInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        void handleReferenceResumeSelected(e.target.files?.[0] ?? null)
                      }}
                    />
                    <button
                      onClick={() => referenceResumeInputRef.current?.click()}
                      disabled={isUploadingResume}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        isUploadingResume
                          ? 'bg-foreground/5 text-foreground/30 cursor-not-allowed'
                          : 'border border-glass-border hover:bg-foreground/5 text-foreground/55 hover:text-foreground/75 cursor-pointer'
                      }`}
                    >
                      {isUploadingResume ? 'Uploading…' : 'Upload PDF'}
                    </button>
                  </>
                </div>

                <div className="rounded-xl bg-foreground/5 border border-glass-border p-3">
                  {storageLoading ? (
                    <p className="text-xs text-foreground/35">Loading reference resumes…</p>
                  ) : referenceResumes.length === 0 ? (
                    <p className="text-xs text-foreground/35">No reference resumes in S3 yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {referenceResumes.map((resume) => (
                        <div key={resume.id} className="rounded-xl border border-glass-border bg-glass px-3 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm text-foreground/80 truncate">{resume.name}</p>
                              <p className="text-[11px] text-foreground/35 mt-1">
                                {formatStorageTimestamp(resume.uploadedAt)} · {formatStorageSize(resume.size)}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <a
                                href={resume.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-foreground/45 hover:text-foreground/70 transition-colors"
                              >
                                Open
                              </a>
                              <button
                                onClick={() => void deleteReferenceResume(resume)}
                                disabled={deletingResumeId === resume.id}
                                className="text-foreground/30 hover:text-red-500 transition-colors cursor-pointer disabled:text-foreground/15"
                                title="Delete reference resume"
                              >
                                <span className="material-symbols-outlined text-base">
                                  {deletingResumeId === resume.id ? 'progress_activity' : 'delete'}
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {storageError && (
              <p className="text-sm text-red-500">{storageError}</p>
            )}
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