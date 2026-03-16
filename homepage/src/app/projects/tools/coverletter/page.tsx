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

// ─── Imports ────────────────────────────────────────────────────────────────
// React hooks — each hook solves a specific problem:
//   useState    — declares a reactive variable. Returns [currentValue, setterFn].
//                 Calling setterFn(newValue) causes React to re-render the component.
//   useEffect   — runs side-effect code (API calls, timers, DOM setup) after renders.
//                 The dependency array controls when it re-runs.
//   useRef      — holds a mutable value that DOESN'T trigger re-renders when changed.
//                 Used here for the editor DOM handle and the file input element.
//   useCallback — memoizes a function so its reference stays stable across renders.
//                 Important when functions are deps of other hooks or passed as props.
import { useState, useEffect, useRef, useCallback } from 'react'

// Types and constants from the co-located types.ts file:
//   Block          — a saved library entry:  { id, category, text, tags[], createdAt, updatedAt }
//   BlockDraft     — the form shape (in-flight create/edit): { category, text, tagIds[] }
//   MatchResult    — one AI match result:    { id: blockId, reason: string }
//   Tag            — a label attached to blocks: { id, name, slug }
//   CATEGORIES     — Record<string, { dot, bg, darkBg }> — color tokens per category name
//   DEFAULT_BLOCK_CATEGORY — 'Soft Skills' — safe default when no filter is active
import { Block, BlockDraft, MatchResult, AISuggestionBlock, Tag, CATEGORIES, DEFAULT_BLOCK_CATEGORY } from './types'

// BlockCard — renders one library block as a draggable card in the right panel
import BlockCard from './BlockCard'

// HighlightEditor     — the rich-text cover letter editor (contenteditable, left panel)
// HighlightEditorHandle — TypeScript type for the ref handle attached to the editor.
//   The ref gives this parent component imperative access to editor methods:
//   .insertBlock(block) — inject a library card into the editor
//   .clear()            — wipe all editor content (used by resetDraft)
//   .getHtml()          — read the raw HTML string (used when saving to S3)
//   .getPlainText()     — read stripped plain text (used for clipboard copy and AI grading)
//   .loadHtml(html)     — replace editor DOM with saved HTML (used when loading a draft)
import HighlightEditor, { type HighlightEditorHandle } from './HighlightEditor'

// ─── EMPTY_BLOCK_FORM ────────────────────────────────────────────────────────
// The "factory reset" template for the Add/Edit Block form.
// It's typed as BlockDraft, which is exactly what the API expects when you
// POST to /api/coverletter/blocks: { category: string, text: string, tagIds: string[] }
//
// Why a module-level constant (not a variable)? Because:
//   1. It never changes — same values every time
//   2. Both openCreateForm() and closeBlockForm() spread it to create a fresh copy:
//      setBlockForm({ ...EMPTY_BLOCK_FORM }) gives React a new object reference,
//      which correctly triggers a re-render to clear the form inputs.
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_BLOCK_FORM: BlockDraft = {
  // Pre-selects 'Soft Skills' so the dropdown always has a valid value.
  // openCreateForm() may override this with the active filter pill category.
  category: DEFAULT_BLOCK_CATEGORY,

  // The textarea content starts blank. The save button stays disabled until
  // the user types at least one non-whitespace character.
  text: '',

  // No tags are selected by default. The user clicks tag pills to toggle them.
  tagIds: [],
}

// ─── S3 Storage Interfaces ──────────────────────────────────────────────────────
// These describe the JSON shapes returned by our S3-backed API routes.
// They live here (not in types.ts) because only this page component uses them.
// ─────────────────────────────────────────────────────────────────────────────

// A lightweight summary of one uploaded reference resume PDF.
// Returned in an array by GET /api/coverletter/reference-resumes.
interface StoredReferenceResumeSummary {
  id: string           // stable S3 key hash — used as the path param for DELETE
  name: string         // original filename (e.g., "resume-2024.pdf")
  size: number         // file size in bytes — displayed via formatStorageSize()
  uploadedAt: string | null  // ISO-8601 timestamp from S3 object metadata; null if absent
  href: string         // presigned S3 URL — opens the PDF in a new tab
}

// A lightweight summary of one saved cover letter draft (JSON file in S3).
// Returned in an array by GET /api/coverletter/letters.
interface StoredCoverLetterSummary {
  id: string           // stable S3 key — used to load or delete this specific draft
  title: string        // user-provided name, e.g., "Summer 2026 SWE Internship"
  size: number         // JSON file size in bytes
  updatedAt: string | null  // ISO-8601 timestamp of the last PUT/save
}

// The full contents of a saved draft, returned by GET /api/coverletter/letters/[id].
// Fetched only when the user actually clicks a saved letter to load it.
interface StoredCoverLetterDocument {
  id: string           // same id as the summary
  title: string        // user-provided draft name
  html: string         // rich-text HTML from the HighlightEditor (restores highlight blocks)
  plainText: string    // stripped plain text (for clipboard copy and AI grading)
  jobPosting: string   // the job posting the user had pasted — restored so AI matching still works
}

// ─── Gemini Rubric Review Interfaces ──────────────────────────────────────────────
// These describe the JSON returned by POST /api/coverletter/grade.
// The Gemini model scores the draft against the rubric and returns structured feedback.
// ─────────────────────────────────────────────────────────────────────────────

// The three possible verdicts Gemini can assign to a rubric criterion.
// Rendered as color-coded pill badges: Strong=green, Adequate=amber, Weak=red.
type ReviewScore = 'Strong' | 'Adequate' | 'Weak'

// One scored rubric item. Example: { name: 'Specificity', score: 'Weak', feedback: '...' }
interface CoverLetterReviewCriterion {
  name: string       // rubric criterion name (matches entries in coverLetterRubric.ts)
  score: ReviewScore // Gemini's verdict for this criterion
  feedback: string   // one or two sentences of concrete, actionable improvement advice
}

// The complete review object returned by the grade API. Stored in `reviewResult` state.
interface CoverLetterReviewResult {
  overallAssessment: string        // paragraph-length overall take on the draft
  highestImpactChange: string      // the single most important actionable improvement
  referenceResumesUsed: string[]   // filenames of S3 PDFs Gemini actually read (up to 3)
  criteria: CoverLetterReviewCriterion[]  // one entry per rubric criterion (shown as cards)
  weakestParagraph: {
    original: string     // copy of the paragraph Gemini flagged as weakest
    rewritten: string    // Gemini's suggested rewrite of that paragraph
  }
}

// ─── Utility / Display Formatting Functions ────────────────────────────────────────
// These are pure helper functions — they take input and return output with no
// side effects. They don't touch state, refs, or the DOM.
// ─────────────────────────────────────────────────────────────────────────────

// Converts a raw byte count into a human-readable size string.
// Used to display file sizes next to each saved draft and reference resume.
// Examples: 512 → "512 B"  •  2048 → "2 KB"  •  1_500_000 → "1.4 MB"
function formatStorageSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

// Converts an ISO-8601 timestamp string into a short, friendly date + time.
// Used to show when a draft was last saved or when a resume was uploaded.
// Example: "2026-03-10T14:35:00Z" → "Mar 10, 2:35 PM"
// Returns "Unknown" if the value is null, empty, or not a valid date.
function formatStorageTimestamp(value: string | null) {
  if (!value) return 'Unknown'

  const date = new Date(value)   // parse the ISO-8601 string into a JS Date object
  if (Number.isNaN(date.getTime())) return 'Unknown'  // getTime() is NaN for invalid dates

  return date.toLocaleString(undefined, {
    month: 'short',   // "Mar"
    day: 'numeric',   // "10"
    hour: 'numeric',  // "2"
    minute: '2-digit', // "35"
  })
}

// Returns a set of Tailwind CSS class names for the score badge pill color.
// Called once per criterion in the review panel.
//   Strong   → green (emerald)
//   Adequate → amber/yellow
//   Weak     → red
// The dark: variants handle dark-mode automatically via Tailwind's dark mode prefix.
function getReviewScoreClasses(score: ReviewScore) {
  if (score === 'Strong') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
  }

  if (score === 'Adequate') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
  }

  // Weak — red
  return 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
}

// ─── Main Page Component ────────────────────────────────────────────────────

export default function CoverLetterWorkbench() {
  // ──────────────────────────────────────────────────────────────
  // HOW useState WORKS:
  //   const [value, setValue] = useState(initialValue)
  //   • `value`    — the current state. React re-renders the component when it changes.
  //   • `setValue` — the setter function. Call it with a new value to trigger a re-render.
  //                   You can also call it with a callback: setValue(prev => prev + 1)
  //                   to safely compute next state from the previous state.
  // ──────────────────────────────────────────────────────────────

  // ── Animation mount state ──
  // Safari applies blur-reveal CSS animations on class addition, not on initial paint.
  // Setting `mounted = true` after the first render adds the class, triggering the animation.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // ── Refs (mutable handles that don't cause re-renders) ──
  // editorRef: attached to the HighlightEditor component. Lets us call
  //   imperative methods on it: .insertBlock(), .clear(), .getHtml(), etc.
  const editorRef = useRef<HighlightEditorHandle>(null)
  // referenceResumeInputRef: attached to the hidden <input type="file">.
  //   We call .click() on it programmatically when the user hits "Upload PDF".
  //   Also used to reset its value after an upload so the same file can be re-picked.
  const referenceResumeInputRef = useRef<HTMLInputElement>(null)

  // ── Core library state ──
  // All Block objects loaded from the Turso database.
  // setLibraryBlocks is called by fetchLibrary() after every create/update/delete.
  // Type: Block[] where each Block is { id, category, text, tags[], createdAt, updatedAt }
  const [libraryBlocks, setLibraryBlocks] = useState<Block[]>([])

  // All Tag objects from the database.
  // Used in the filter bar at the top of the right panel and in the block form's tag toggles.
  // They're fetched alongside blocks in the same GET /api/coverletter/library request.
  const [libraryTags, setLibraryTags] = useState<Tag[]>([])

  // true while the first library fetch is in flight. Shows “Loading library…” placeholder.
  // Starts as true and flips to false once fetchLibrary() resolves (success or error).
  const [libraryLoading, setLibraryLoading] = useState(true)

  // The most recent error from a library API call (load, create, update, or delete).
  // null = no error. Shown in red below the page title. Cleared before each new API call.
  const [libraryError, setLibraryError] = useState<string | null>(null)

  // Short success/confirmation text shown in green below the page title.
  // Examples: "Block added to the library", "Block deleted", "Tag updated".
  // Auto-clears after 2.5 seconds via the setTimeout useEffect below.
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  // The block.id of the last-clicked library card, or null when nothing is selected.
  // Passed to each BlockCard via the `isSelected` prop to render a blue highlight ring.
  // A click on the page background (the root div's onClick) resets this to null.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // ── S3-backed draft + resume storage ──
  // Summaries of reference resume PDFs stored in S3 (GET /api/coverletter/reference-resumes).
  // Each entry: { id, name, size, uploadedAt, href } — see StoredReferenceResumeSummary.
  const [referenceResumes, setReferenceResumes] = useState<StoredReferenceResumeSummary[]>([])

  // Summaries of saved cover letter drafts stored as JSON in S3 (GET /api/coverletter/letters).
  // Each entry: { id, title, size, updatedAt } — see StoredCoverLetterSummary.
  const [savedLetters, setSavedLetters] = useState<StoredCoverLetterSummary[]>([])

  // true while the initial fetch of both resumes and letters is pending.
  const [storageLoading, setStorageLoading] = useState(true)

  // Error message from S3 storage operations (upload, load, save, delete).
  // null = no error. Displayed in red at the bottom of the S3 panel.
  const [storageError, setStorageError] = useState<string | null>(null)

  // Bound to the "Draft Title" input. Defaults to empty; falls back to "Untitled Draft" on save.
  const [draftTitle, setDraftTitle] = useState('')

  // The S3 id of the currently loaded draft, or null for an unsaved/new draft.
  // When non-null, saving calls PUT (update) instead of POST (create new).
  // Set by loadSavedLetter() and saveCurrentLetter(). Cleared by resetDraft().
  const [activeLetterId, setActiveLetterId] = useState<string | null>(null)

  // true while a PDF upload call is in flight. Disables the "Upload PDF" button.
  const [isUploadingResume, setIsUploadingResume] = useState(false)

  // true while a draft save/update call is in flight. Disables "Save Draft".
  const [isSavingLetter, setIsSavingLetter] = useState(false)

  // The id of the letter row currently being loaded. Shows a spinner in THAT row only.
  // null when no row is loading.
  const [loadingLetterId, setLoadingLetterId] = useState<string | null>(null)

  // The id of the letter row currently being deleted. Shows spinner/disabled in that row.
  const [deletingLetterId, setDeletingLetterId] = useState<string | null>(null)

  // The id of the reference resume row currently being deleted.
  const [deletingResumeId, setDeletingResumeId] = useState<string | null>(null)

  // ── Job posting & AI matching ──
  // Raw text from the job posting textarea. Sent to both match and grade API endpoints.
  const [jobPosting, setJobPosting] = useState('')

  // A lookup table built from the /api/coverletter/match response: { blockId: reasonString }.
  // BlockCard components check matches[block.id] to decide whether to show their AI match badge.
  // Empty object {} means no matching has been run yet (or it returned zero matches).
  const [matches, setMatches] = useState<Record<string, string>>({})

  // Ephemeral AI-generated blocks for structural paragraphs missing from the current editor.
  // Returned by the same /api/coverletter/match call alongside existing block matches.
  // Never persisted — reset to [] on each new match run or on error.
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestionBlock[]>([])

  // true while "Match Blocks" is loading. Disables the button and shows a spinner icon.
  const [isMatching, setIsMatching] = useState(false)

  // true while "Grade Letter" is loading. Shows "Scoring…" in the review panel.
  const [isGrading, setIsGrading] = useState(false)

  // The full rubric review result from /api/coverletter/grade, or null before any review.
  // Typed as CoverLetterReviewResult — see that interface above for its structure.
  const [reviewResult, setReviewResult] = useState<CoverLetterReviewResult | null>(null)

  // Error message if the grade API call fails. Shown in red inside the review panel.
  const [reviewError, setReviewError] = useState<string | null>(null)

  // ── Library filter ──
  // These drive the category and tag filter rows at the top of the right panel.
  // The `sortedLibrary` derived array (near the bottom of this hook block) reads both
  // of these to decide which block cards to show.

  // 'All' = show every category. A specific category name = show only that category.
  // When openCreateForm() is called with a non-'All' value, the new block form
  // will pre-select this category in the dropdown (saves the user a click).
  const [filterCategory, setFilterCategory] = useState('All')

  // 'All' = no tag filter applied. A specific tag.id = show only blocks with that tag.
  const [filterTagId, setFilterTagId] = useState('All')

  // ── Add/Edit block form ──
  // These four together drive the collapsible form in the right panel.

  // Whether the form panel is currently visible.
  // true = open (either adding or editing); false = collapsed/hidden.
  const [showAddForm, setShowAddForm] = useState(false)

  // The id of the block being edited, or null when creating a new block.
  //   null  + showAddForm=true  → create mode (POST)
  //   "..." + showAddForm=true  → edit mode   (PATCH)
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)

  // The live form data: category dropdown value, textarea text, and selected tag ids.
  // Type: BlockDraft = { category: string, text: string, tagIds: string[] }
  //
  // setBlockForm is the React setter for this state:
  //   setBlockForm({ ...prev, text: 'new text' })  — update one field, keep others
  //   setBlockForm(EMPTY_BLOCK_FORM)               — reset all fields to defaults
  // Calling setBlockForm triggers a re-render, so the inputs update immediately.
  const [blockForm, setBlockForm] = useState<BlockDraft>(EMPTY_BLOCK_FORM)

  // true while the save API call (POST create or PATCH update) is in flight.
  // Disables the "Add to Library" / "Save changes" button while pending.
  const [isSavingBlock, setIsSavingBlock] = useState(false)

  // ── Tag manager ──
  // These drive the collapsible "Manage Tags" section at the bottom of the right panel.

  // Whether the tag manager section is expanded (toggled by the "Manage Tags" link).
  const [showTagManager, setShowTagManager] = useState(false)

  // Bound to the "Add a new tag…" input. Submitted to POST /api/coverletter/tags.
  const [newTagName, setNewTagName] = useState('')

  // The id of the tag whose name is currently being edited inline.
  // null = no tag is in edit mode. Non-null = that tag row shows an inline input.
  const [editingTagId, setEditingTagId] = useState<string | null>(null)

  // The current value of the inline edit input for the tag whose id = editingTagId.
  const [editingTagName, setEditingTagName] = useState('')

  // true while any tag mutation (create, rename, delete) is in flight.
  const [isSavingTag, setIsSavingTag] = useState(false)

  // ── Drag-and-drop visual feedback ──
  // true while the user is dragging a library block card over the editor area.
  // Passed to HighlightEditor as a prop so it can render a glowing drop-zone border.
  const [isDragOver, setIsDragOver] = useState(false)

  // ── Editor block count (reported back from HighlightEditor) ──
  // Counts how many highlight blocks are inside the cover letter editor right now.
  // HighlightEditor calls onBlockCountChange(n) whenever it changes.
  // Used to disable the "Grade Letter" button when the editor is empty (count === 0).
  const [editorBlockCount, setEditorBlockCount] = useState(0)

  // ── fetchLibrary ───────────────────────────────────────────────────────────
  // Fetches the full block + tag library from GET /api/coverletter/library.
  // The API returns { blocks: Block[], tags: Tag[] } from the Turso database.
  //
  // `showLoading` controls the loading spinner behavior:
  //   true  (default) — shows the "Loading library…" placeholder. Used on first mount.
  //   false           — silent refresh after a mutation (create/update/delete).
  //                     The list updates without blanking out, which feels snappier.
  //
  // useCallback with [] deps means this function reference never changes between renders,
  // so it's safe to put in useEffect dependency arrays without causing infinite loops.
  const fetchLibrary = useCallback(async (showLoading = true) => {
    if (showLoading) setLibraryLoading(true)
    setLibraryError(null)  // clear any previous error before each new attempt

    try {
      const res = await fetch('/api/coverletter/library', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load cover letter library')

      setLibraryBlocks(data.blocks ?? [])  // ?? [] guards against null/undefined in the response
      setLibraryTags(data.tags ?? [])
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Failed to load cover letter library')
    } finally {
      setLibraryLoading(false)  // always runs — even if the fetch threw an error
    }
  }, [])

  // Trigger the initial library load once on component mount.
  // void tells TypeScript we intentionally aren't awaiting this Promise here.
  useEffect(() => {
    void fetchLibrary()
  }, [fetchLibrary])

  // ── fetchStorage ──────────────────────────────────────────────────────────
  // Loads the reference resume list AND the saved cover letter list from S3.
  //
  // We fire both GET requests using Promise.all() so they run in parallel instead
  // of sequentially — this cuts loading time roughly in half since the two requests
  // are completely independent of each other.
  //
  // Same showLoading pattern as fetchLibrary: pass false for silent post-mutation refreshes.
  const fetchStorage = useCallback(async (showLoading = true) => {
    if (showLoading) setStorageLoading(true)
    setStorageError(null)

    try {
      // Fire both requests at the same time. Promise.all waits for BOTH to complete.
      const [resumeRes, letterRes] = await Promise.all([
        fetch('/api/coverletter/reference-resumes', { cache: 'no-store' }),
        fetch('/api/coverletter/letters', { cache: 'no-store' }),
      ])
      // Parse both response bodies as JSON in parallel too.
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

  // Trigger the initial S3 storage load once on component mount.
  useEffect(() => {
    void fetchStorage()
  }, [fetchStorage])

  // Auto-dismiss the green status message after 2.5 seconds.
  // This useEffect re-runs every time `statusMessage` changes:
  //   • If null — bail out early (nothing to do)
  //   • If a string — start a 2.5s timer that sets statusMessage back to null
  //   • The returned cleanup function cancels the timer if statusMessage changes again
  //     before 2.5s elapses (prevents a stale clear from running on a newer message)
  useEffect(() => {
    if (!statusMessage) return
    const timeoutId = window.setTimeout(() => setStatusMessage(null), 2500)
    return () => window.clearTimeout(timeoutId)  // cleanup: cancel pending timer
  }, [statusMessage])

  // ── openCreateForm ──────────────────────────────────────────────────────
  // Opens the Add Block form in "create mode" (not edit mode).
  // Called by the "+ Add Block" button in the library header.
  //
  // Smart default: if the user has a specific category filter active (e.g., "Intro"),
  // the form pre-selects that category instead of the generic default. This saves a
  // click when adding multiple blocks of the same type in one session.
  //
  // useCallback with [filterCategory] means React recreates this function only when
  // filterCategory changes — keeping the function in sync without recreating it on
  // every unrelated render.
  const openCreateForm = useCallback(() => {
    setEditingBlockId(null)  // null = create mode (not edit mode)
    setBlockForm({
      ...EMPTY_BLOCK_FORM,   // spread defaults: text='', tagIds=[]
      // Pre-select the active filter category if it's specific; otherwise use the default
      category: filterCategory !== 'All' ? filterCategory : EMPTY_BLOCK_FORM.category,
    })
    setShowAddForm(true)     // show the form panel
  }, [filterCategory])

  // ── closeBlockForm ──────────────────────────────────────────────────────
  // Closes the Add/Edit Block form and resets all form state back to clean defaults.
  // Called by: "Cancel" button, successful save, and successful delete.
  const closeBlockForm = useCallback(() => {
    setEditingBlockId(null)         // clear "which block are we editing?" pointer
    setBlockForm(EMPTY_BLOCK_FORM)  // reset all three form fields to blank defaults
    setShowAddForm(false)           // collapse/hide the form panel
  }, [])

  // ── startEditingBlock ──────────────────────────────────────────────────
  // Opens the form in "edit mode" for an existing block.
  // Called when the user clicks the pencil/manage icon on a BlockCard.
  //
  // Pre-fills the form with the block's existing values so the user doesn't
  // have to retype everything. Note: we map block.tags (Tag objects) to
  // just their IDs because the form works with tagIds: string[], not Tag[].
  const startEditingBlock = useCallback((block: Block) => {
    setEditingBlockId(block.id)   // set edit mode: which block are we editing?
    setSelectedId(block.id)       // also highlight that card in the library
    setBlockForm({
      category: block.category,
      text: block.text,
      tagIds: block.tags.map((tag) => tag.id),  // Tag[] → string[] (just the ids)
    })
    setShowAddForm(true)          // open the form panel
  }, [])

  // ── saveBlock ───────────────────────────────────────────────────────────
  // Saves the current blockForm state to the database. Handles both create and
  // edit in one function by branching on whether editingBlockId is set:
  //
  //   editingBlockId = null  → POST   /api/coverletter/blocks        (create)
  //   editingBlockId = "..." → PATCH  /api/coverletter/blocks/[id]   (edit)
  //
  // On success: silently refreshes the library list, closes the form, shows toast.
  const saveBlock = useCallback(async () => {
    if (!blockForm.text.trim()) return  // guard: don't allow saving empty blocks

    setIsSavingBlock(true)
    setLibraryError(null)

    try {
      const isEditing = Boolean(editingBlockId)  // true if editing, false if creating
      const url = isEditing
        ? `/api/coverletter/blocks/${editingBlockId}`  // PATCH: include the block id in URL
        : '/api/coverletter/blocks'                    // POST: no id yet

      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blockForm),  // sends { category, text, tagIds }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save block')

      await fetchLibrary(false)  // silent refresh: update the list without the spinner
      closeBlockForm()           // reset form fields and hide the panel
      setStatusMessage(isEditing ? 'Block updated' : 'Block added to the library')
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Failed to save block')
    } finally {
      setIsSavingBlock(false)
    }
  }, [blockForm, closeBlockForm, editingBlockId, fetchLibrary])

  // ── deleteBlock ───────────────────────────────────────────────────────────
  // Sends DELETE /api/coverletter/blocks/[id] and cleans up all local state
  // that referenced the deleted block:
  //
  //   selectedId — deselect the block if it was selected (clear the highlight ring)
  //   matches    — remove its AI match entry so the match badge disappears
  //   blockForm  — close the edit form if we were editing this exact block
  //
  // Called by: "Delete block" button in the edit form, and BlockCard's X/remove handler.
  const deleteBlock = useCallback(async (blockId: string) => {
    setLibraryError(null)

    try {
      const res = await fetch(`/api/coverletter/blocks/${blockId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete block')

      // Clear the selection highlight if this block was selected
      setSelectedId((prev) => (prev === blockId ? null : prev))

      // Remove the AI match entry for this block from the lookup table.
      // The functional setter pattern (prev => ...) safely reads the latest state.
      setMatches((prev) => {
        const next = { ...prev }   // copy the object (never mutate React state directly)
        delete next[blockId]        // remove the deleted block's entry
        return next
      })

      // If the edit form is open for this block, close it
      if (editingBlockId === blockId) closeBlockForm()

      await fetchLibrary(false)  // refresh the library list silently
      setStatusMessage('Block deleted')
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Failed to delete block')
    }
  }, [closeBlockForm, editingBlockId, fetchLibrary])

  // ── toggleBlockTag ──────────────────────────────────────────────────────
  // Adds or removes a tag ID from the block form's tagIds array.
  // Called when the user clicks a tag pill inside the Add/Edit Block form.
  //
  // Uses the functional update pattern — setBlockForm(prev => ...) — because the new
  // state depends on the previous state. React guarantees `prev` is the latest value,
  // even if multiple state updates are batched together.
  //
  //   If tagId is already in tagIds → remove it with .filter()
  //   If tagId is not in tagIds    → add it by spreading + appending
  const toggleBlockTag = useCallback((tagId: string) => {
    setBlockForm((prev) => ({
      ...prev,     // keep category and text unchanged
      tagIds: prev.tagIds.includes(tagId)
        ? prev.tagIds.filter((existingId) => existingId !== tagId)  // remove
        : [...prev.tagIds, tagId],                                   // add
    }))
  }, [])

  // ── createTag ───────────────────────────────────────────────────────────
  // Creates a new tag via POST /api/coverletter/tags with a { name } body.
  // The API generates the id and URL-safe slug automatically.
  // On success, clears the name input and refreshes the library so the new
  // tag appears immediately in the filter bar and the block form.
  const createTag = useCallback(async () => {
    if (!newTagName.trim()) return  // don't allow blank tag names

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

      setNewTagName('')        // clear the input field after a successful create
      await fetchLibrary(false)
      setStatusMessage('Tag created')
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Failed to create tag')
    } finally {
      setIsSavingTag(false)
    }
  }, [fetchLibrary, newTagName])

  // ── saveTag ────────────────────────────────────────────────────────────
  // Submits an inline tag rename via PATCH /api/coverletter/tags/[id].
  // Called when the user clicks the checkmark button in the inline edit input,
  // or when they press Enter (handled in the input's onKeyDown).
  // On success, exits edit mode by clearing editingTagId and editingTagName.
  const saveTag = useCallback(async () => {
    if (!editingTagId || !editingTagName.trim()) return  // safety guard

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

      setEditingTagId(null)    // exit inline edit mode
      setEditingTagName('')    // clear the edit input
      await fetchLibrary(false)
      setStatusMessage('Tag updated')
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Failed to update tag')
    } finally {
      setIsSavingTag(false)
    }
  }, [editingTagId, editingTagName, fetchLibrary])

  // ── deleteTag ───────────────────────────────────────────────────────────
  // Deletes a tag from the database and cleans up every piece of local state
  // that held a reference to it:
  //
  //   blockForm.tagIds — remove the tag from the currently open edit form
  //   filterTagId      — reset the tag filter to "All" if this tag was active
  //   editingTagId     — exit inline edit mode if we were renaming this tag
  const deleteTag = useCallback(async (tagId: string) => {
    setIsSavingTag(true)
    setLibraryError(null)

    try {
      const res = await fetch(`/api/coverletter/tags/${tagId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete tag')

      // Remove this tag from the block form's selected tags list
      setBlockForm((prev) => ({
        ...prev,
        tagIds: prev.tagIds.filter((existingId) => existingId !== tagId),
      }))
      // If this tag was the active filter, reset to "All tags"
      setFilterTagId((prev) => (prev === tagId ? 'All' : prev))
      // If we were mid-edit on this tag's name, exit edit mode
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

  // ── handleCopy ───────────────────────────────────────────────────────────
  // Called by HighlightEditor when its "Copy" button is clicked.
  // The actual clipboard write happens INSIDE HighlightEditor.
  // This callback's only job is to set the green confirmation toast.
  const handleCopy = useCallback(() => {
    setStatusMessage('Cover letter copied to clipboard')
  }, [])

  // ── handleCreateCard ──────────────────────────────────────────────────────
  // Called by HighlightEditor when the user selects text and clicks "Create Card"
  // in the mini popup. Lets the user save a sentence they WROTE in the editor
  // directly into the reusable block library without copy-pasting.
  //
  // TypeScript: Pick<Block, 'category' | 'text'> means we only need two fields here.
  // The block has no id yet — the database assigns it on creation.
  // New blocks are saved with no tags; the user can assign tags later via the edit form.
  const handleCreateCard = useCallback(async (block: Pick<Block, 'category' | 'text'>) => {
    try {
      const res = await fetch('/api/coverletter/blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: block.category,
          text: block.text,
          tagIds: [],  // no tags on auto-created cards
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save new block')

      await fetchLibrary(false)  // refresh so the new card appears in the library immediately
      setStatusMessage('Selection saved as a library block')
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Failed to save new block')
    }
  }, [fetchLibrary])

  // ── resetDraft ───────────────────────────────────────────────────────────
  // Wipes the editor and all draft-related state to start completely fresh.
  // Called by the "New Draft" button, and also when the currently-loaded draft is deleted.
  //
  // editorRef.current?.clear() is an imperative call to the child component's .clear() method.
  // The ?. (optional chaining) makes it a no-op if the ref isn't attached yet (safe TypeScript).
  const resetDraft = useCallback((message = 'Started a fresh cover letter draft') => {
    editorRef.current?.clear()  // wipe all text and highlight blocks from the editor DOM
    setDraftTitle('')           // clear the title input
    setActiveLetterId(null)     // detach from any S3 draft; next save = POST (new), not PUT
    setJobPosting('')           // clear the job posting textarea
    setMatches({})              // clear all AI match highlights in the library
    setReviewResult(null)       // clear the Gemini rubric review result panel
    setReviewError(null)        // clear any review error message
    setStatusMessage(message)   // show a green confirmation toast
  }, [])

  // ── handleReferenceResumeSelected ────────────────────────────────────────
  // Triggered when the user picks a PDF from the hidden <input type="file">.
  // Uploads the file to S3 via POST /api/coverletter/reference-resumes using multipart
  // form data — the browser-native format for sending binary files over HTTP.
  //
  // After a successful upload, refreshes the resume list and clears the file input
  // (so the same file can be selected again if needed).
  const handleReferenceResumeSelected = useCallback(async (file: File | null) => {
    if (!file) return  // user cancelled the file dialog without picking anything

    setIsUploadingResume(true)
    setStorageError(null)

    try {
      // FormData is the browser API for multipart/form-data submissions.
      // We append the File object under the key 'file' (the API reads it as req.formData()).
      // Do NOT set Content-Type manually — the browser sets the multipart boundary for you.
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
      // Reset the file input value so the onChange fires again if the user picks the same file
      if (referenceResumeInputRef.current) {
        referenceResumeInputRef.current.value = ''
      }
    }
  }, [fetchStorage])

  // ── deleteReferenceResume ───────────────────────────────────────────────
  // Deletes a reference resume PDF from S3 after a browser-native confirmation dialog.
  // Sets deletingResumeId to mark that specific row as "in progress" so its
  // delete button shows a spinner icon until the operation completes.
  const deleteReferenceResume = useCallback(async (resume: StoredReferenceResumeSummary) => {
    // Native browser confirm dialog — a quick safety net since S3 deletes are permanent
    if (!window.confirm(`Delete ${resume.name} from S3?`)) return

    setDeletingResumeId(resume.id)  // show spinner on this row
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
      setDeletingResumeId(null)  // hide spinner regardless of success or failure
    }
  }, [fetchStorage])

  // ── saveCurrentLetter ───────────────────────────────────────────────
  // Saves (or updates) the current editor state to S3 as a JSON document.
  //
  // We store both html (to restore the highlight blocks visually on reload) and
  // plainText (for clipboard copy and AI grading). The job posting is saved too
  // so AI matching context survives across sessions.
  //
  // Branches on activeLetterId:
  //   null  → POST /api/coverletter/letters       (create a new S3 document)
  //   "..." → PUT  /api/coverletter/letters/[id]  (overwrite the existing document)
  //
  // After saving, activeLetterId is set to the returned letter.id so the next save
  // correctly uses PUT to overwrite rather than creating a duplicate.
  const saveCurrentLetter = useCallback(async () => {
    // Read current editor content via the imperative ref handle
    const html = editorRef.current?.getHtml() ?? ''           // raw HTML with highlight divs
    const plainText = editorRef.current?.getPlainText() ?? '' // stripped plain text

    if (!plainText.trim()) {
      setStorageError('Add some cover letter content before saving to S3')
      return
    }

    setIsSavingLetter(true)
    setStorageError(null)

    try {
      const isUpdating = Boolean(activeLetterId)  // true = overwrite, false = create
      const res = await fetch(isUpdating ? `/api/coverletter/letters/${activeLetterId}` : '/api/coverletter/letters', {
        method: isUpdating ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draftTitle.trim() || 'Untitled Draft',  // fallback if the title input is blank
          html,
          plainText,
          jobPosting,  // preserved so AI matching still works when the draft is loaded later
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save cover letter')

      const letter = data.letter as StoredCoverLetterDocument
      setActiveLetterId(letter.id)   // now attached to this S3 draft; next save = PUT
      setDraftTitle(letter.title)
      await fetchStorage(false)
      setStatusMessage(isUpdating ? 'Cover letter draft updated in S3' : 'Cover letter draft saved to S3')
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Failed to save cover letter')
    } finally {
      setIsSavingLetter(false)
    }
  }, [activeLetterId, draftTitle, fetchStorage, jobPosting])

  // ── loadSavedLetter ────────────────────────────────────────────────────
  // Fetches a full saved cover letter document from S3 and restores the editor state.
  //
  // editorRef.current?.loadHtml(letter.html) is the key step: it calls HighlightEditor's
  // imperative .loadHtml() method, replacing the editor's DOM content with the saved
  // HTML (including all highlight block divs), perfectly restoring the visual layout.
  //
  // We also restore the job posting and clear stale AI match/review state, since those
  // were generated in a previous session with potentially different context.
  const loadSavedLetter = useCallback(async (letterId: string) => {
    setLoadingLetterId(letterId)  // show loading spinner on that specific row
    setStorageError(null)

    try {
      const res = await fetch(`/api/coverletter/letters/${letterId}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load saved cover letter')

      const letter = data.letter as StoredCoverLetterDocument
      editorRef.current?.loadHtml(letter.html)   // restore the full rich-text HTML into the editor
      setDraftTitle(letter.title)                // restore the title input
      setActiveLetterId(letter.id)               // attach; next save = PUT (overwrite)
      setJobPosting(letter.jobPosting ?? '')      // restore the job posting textarea
      setMatches({})                             // clear stale AI match badges (from old session)
      setReviewResult(null)                      // clear previous Gemini review
      setReviewError(null)
      setStatusMessage(`Loaded ${letter.title}`)
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Failed to load saved cover letter')
    } finally {
      setLoadingLetterId(null)  // clear spinner regardless of outcome
    }
  }, [])

  // ── deleteSavedLetter ─────────────────────────────────────────────────
  // Deletes a saved cover letter draft from S3 after a confirmation dialog.
  //
  // Special case: if the deleted letter is the one currently loaded in the editor
  // (activeLetterId === letter.id), we call resetDraft() to also wipe the editor
  // and detach from the now-deleted S3 document. Otherwise just refresh the list.
  const deleteSavedLetter = useCallback(async (letter: StoredCoverLetterSummary) => {
    if (!window.confirm(`Delete ${letter.title} from S3?`)) return

    setDeletingLetterId(letter.id)  // show spinner on this specific row
    setStorageError(null)

    try {
      const res = await fetch(`/api/coverletter/letters/${letter.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete saved cover letter')

      await fetchStorage(false)
      if (activeLetterId === letter.id) {
        // The currently-loaded draft was deleted — clear everything to a clean state
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

  // ── matchBlocks ──────────────────────────────────────────────────────────
  // Sends the pasted job posting + all library blocks to the Gemini AI via
  // POST /api/coverletter/match. Gemini returns which blocks are most relevant
  // and a short reason string for each match.
  //
  // The response is converted into a flat { blockId: reason } lookup table and
  // stored in `matches` state. Each BlockCard checks matches[block.id] to decide
  // whether to render its gold "AI match" highlight and reason tooltip.
  //
  // Note: plain async function (not useCallback) because it's only called from one
  // button click handler — no need to memoize it.
  const matchBlocks = async () => {
    if (!jobPosting.trim() || libraryBlocks.length === 0) return  // guard: need both inputs
    setIsMatching(true)
    setLibraryError(null)
    try {
      const res = await fetch('/api/coverletter/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Send the full block list so Gemini can read their text, category, and tags.
        // editorContent lets Gemini identify which structural paragraphs are missing.
        body: JSON.stringify({
          jobPosting,
          blocks: libraryBlocks,
          editorContent: editorRef.current?.getPlainText() ?? '',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Match failed')
      // Convert MatchResult[] → { [blockId]: reason } for O(1) lookup per BlockCard
      const matchMap: Record<string, string> = {}
      data.matches?.forEach((m: MatchResult) => { matchMap[m.id] = m.reason })
      setMatches(matchMap)
      // Stamp each suggestion with a stable temp id for React key prop
      setAiSuggestions(
        (data.suggestions ?? []).map((s: AISuggestionBlock, i: number) => ({ ...s, id: `ai-suggestion-${i}` }))
      )
    } catch (err) {
      console.error('Match error:', err)
      setMatches({})       // reset so stale highlights don't persist on error
      setAiSuggestions([]) // reset suggestions too
      setLibraryError(err instanceof Error ? err.message : 'Block matching failed')
    }
    setIsMatching(false)
  }

  // ── gradeCurrentLetter ──────────────────────────────────────────────────
  // Sends the current cover letter text + job posting to POST /api/coverletter/grade.
  // The API passes them to Gemini along with up to 3 reference resume PDFs from S3.
  // Gemini scores the letter against the rubric defined in coverLetterRubric.ts and
  // returns structured feedback stored in `reviewResult`.
  //
  // Guard conditions: both the editor content and job posting must be non-empty.
  const gradeCurrentLetter = useCallback(async () => {
    // getPlainText() strips HTML tags — gives Gemini clean text without divs/spans
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
    setReviewResult(null)  // clear any previous result while the new call is in flight
    setReviewError(null)

    try {
      const res = await fetch('/api/coverletter/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverLetter, jobPosting }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to grade cover letter')

      setReviewResult(data.review ?? null)  // store the CoverLetterReviewResult object
      setStatusMessage('Cover letter reviewed against your rubric')
    } catch (error) {
      setReviewResult(null)
      setReviewError(error instanceof Error ? error.message : 'Failed to grade cover letter')
    } finally {
      setIsGrading(false)
    }
  }, [jobPosting])  // depends on jobPosting so it always reads the latest value

  // ── Derived data ──────────────────────────────────────────────────────────
  // Values computed from existing state on every render. No useState needed —
  // React recomputes them automatically whenever the source state changes.
  // ─────────────────────────────────────────────────────────────────────────────

  // The filtered + sorted subset of libraryBlocks shown in the right panel.
  //
  //   Step 1 — [...libraryBlocks]:  spread into a new array (never mutate React state)
  //   Step 2 — .filter(category):  keep only blocks matching the active category pill
  //   Step 3 — .filter(tag):       keep only blocks that have the active tag attached
  //   Step 4 — .sort():            AI-matched blocks float to the top.
  //             aMatch/bMatch convert the match lookup to 0 or 1; bMatch - aMatch
  //             gives descending order (1 - 0 = 1 → b before a → matched blocks rise up)
  const sortedLibrary = [...libraryBlocks]
    .filter((b) => filterCategory === 'All' || b.category === filterCategory)
    .filter((b) => filterTagId === 'All' || b.tags.some((tag) => tag.id === filterTagId))
    .sort((a, b) => {
      const aMatch = matches[a.id] ? 1 : 0  // 1 if AI-matched, 0 if not
      const bMatch = matches[b.id] ? 1 : 0
      return bMatch - aMatch  // positive result = b sorted before a → matched cards rise
    })

  // The list of category pill labels shown at the top of the right panel.
  // Always starts with 'All', then adds every category name from:
  //   • CATEGORIES (the built-in set defined in types.ts)
  //   • Any custom categories that exist on blocks already in the database
  // Set() deduplicates so a custom name that matches a built-in only appears once.
  // Ephemeral AI suggestion blocks filtered by the active category pill.
  // Always shown above sortedLibrary in the block list panel.
  const filteredSuggestions = aiSuggestions.filter(
    (s) => filterCategory === 'All' || s.category === filterCategory
  )

  const categoryNames = [
    'All',
    ...Array.from(new Set([
      ...Object.keys(CATEGORIES),                        // built-in names from types.ts
      ...libraryBlocks.map((block) => block.category),   // any custom categories in the DB
    ])),
  ]

  // ── Render ─────────────────────────────────────────────────────────────────
  // The JSX below builds the full two-panel workbench layout:
  //   - LEFT:  Job posting textarea + AI buttons + Gemini review panel +
  //            S3 drafts/resumes panel + the main cover letter editor
  //   - RIGHT: Block library panel with filters, add/edit form, tag manager,
  //            and the scrollable list of BlockCard components
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    // Root div: clicking anywhere on the page background (outside a card) deselects
    // the currently selected block and collapses the blue highlight ring.
    // The onClick on individual interactive elements calls e.stopPropagation() to
    // prevent this from firing when the user intends to click a button or card.
    <div onClick={() => setSelectedId(null)}>
      {/* ── Page Header ─────────────────────────────────────────────────────────
          blur-reveal / blur-reveal-1 are CSS animation classes defined in globals.css.
          They animate opacity + blur from 0 to normal. We apply them ONLY after
          `mounted` becomes true (set in the first useEffect), so the animation
          plays on entry rather than being skipped on the initial server-rendered HTML.

          statusMessage (green) — short confirmation toast from any successful mutation
          libraryError  (red)   — error from any library fetch, create, update, or delete
          Both are set in the hook functions above and shown here.
      ─────────────────────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className={`text-3xl font-medium text-foreground ${mounted ? 'blur-reveal' : 'opacity-0'}`}>
          Cover Letter Workbench
        </h1>
        <p className={`text-foreground/60 mt-2 ${mounted ? 'blur-reveal-1' : 'opacity-0'}`}>
          Assemble tailored cover letters from reusable building blocks
        </p>
        {/* Green toast — auto-dismisses after 2.5 s via the statusMessage useEffect */}
        {statusMessage && (
          <p className="text-sm text-emerald-600 mt-2">{statusMessage}</p>
        )}
        {/* Red error from library operations — cleared before each new API call */}
        {libraryError && (
          <p className="text-sm text-red-500 mt-2">{libraryError}</p>
        )}
      </div>

      {/* ── Two-Panel Layout ─────────────────────────────────────────────────────
          flex-col on small screens (panels stack vertically)
          lg:flex-row on large screens (panels sit side-by-side)
          blur-reveal-2 adds staggered entry animation after mount
      ─────────────────────────────────────────────────────────────────────────── */}
      <div className={`flex flex-col lg:flex-row gap-4 ${mounted ? 'blur-reveal-2' : 'opacity-0'}`}>

        {/* ═══ LEFT PANEL: Job Posting + Cover Letter Editor ═══ */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">

          {/* ── Job Posting Input ──────────────────────────────────────────────────────
              The user pastes a job posting here. Two AI buttons sit in the header row:
                • Match Blocks: fires matchBlocks() — Gemini finds relevant library cards
                • Grade Letter: fires gradeCurrentLetter() — Gemini scores the current draft
          ─────────────────────────────────────────────────────────────────────────── */}
          <div className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground/40 font-mono">
                Job Posting
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={matchBlocks}
                  // Button is disabled (greyed-out, cursor-not-allowed) when:
                  //   isMatching         — a match call is already in flight
                  //   !jobPosting.trim() — no job posting has been pasted yet
                  //   libraryBlocks.length === 0 — there are no blocks to match against
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
                  // void prefix: TypeScript requires `void` when calling an async function
                  // inside an event handler that doesn't expect a Promise return value.
                  // It tells TypeScript "I know this is async, I'm intentionally not awaiting it."
                  onClick={() => void gradeCurrentLetter()}
                  // Disabled when:
                  //   isGrading            — a grade call is already in flight
                  //   !jobPosting.trim()   — no job posting (required context for Gemini)
                  //   editorBlockCount === 0 — the editor is empty; nothing to grade
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
                // Changing the job posting invalidates the existing Gemini review —
                // clear both result and any error so a stale review isn't shown.
                // The user must click "Grade Letter" again to re-score with the new posting.
                setReviewResult(null)
                setReviewError(null)
              }}
              placeholder="Paste a job posting here, then click Match Blocks to find the best sentences from your library…"
              className="w-full h-20 p-3 rounded-xl bg-foreground/5 border border-glass-border text-sm text-foreground placeholder:text-foreground/30 resize-none outline-none focus:border-glass-border-hover transition-colors"
            />
          </div>

          {/* ── Gemini Rubric Review Panel ──────────────────────────────────────────────
              This panel only renders when there is something to show:
                isGrading    — show the "Scoring…" placeholder while waiting
                reviewResult — show the full structured feedback once it arrives
                reviewError  — show the error message if the grade API call failed
              It stays hidden (no DOM element) until one of those is truthy.
          ─────────────────────────────────────────────────────────────────────── */}
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
                  {/* Reference resumes Gemini actually loaded and read:
                      The API passes up to 3 most-recent S3 PDFs to the Gemini call.
                      This sub-panel lists which ones were used, so the user knows
                      what resume context was grounding the review. */}
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

                  {/* Per-criterion cards: one card per rubric entry.
                      Each card shows the criterion name, a color-coded score badge
                      (Strong/Adequate/Weak via getReviewScoreClasses()), and Gemini's feedback. */}
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

          {/* ── S3 Drafts & Reference Resumes Panel ───────────────────────────────────
              Two sub-panels in a responsive xl:grid-cols-2 layout:
                LEFT:  Draft Title input + scrollable Saved Letters list
                RIGHT: Reference Resumes list with Upload PDF button
          ─────────────────────────────────────────────────────────────────────── */}
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
                {/* New Draft: calls resetDraft() to wipe the editor + detach from any S3 draft */}
                <button
                  onClick={() => resetDraft()}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border border-glass-border hover:bg-foreground/5 text-foreground/55 hover:text-foreground/75 transition-all cursor-pointer"
                >
                  New Draft
                </button>
                {/* Save / Update Draft:
                    activeLetterId = null  → "Save Draft"   → POST creates a new S3 document
                    activeLetterId is set  → "Update Draft" → PUT overwrites the existing document
                    The label and HTTP method both flip automatically based on activeLetterId. */}
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
                      {/* Each row highlights when its id matches the currently loaded draft */}
                      {savedLetters.map((letter) => (
                        <div
                          key={letter.id}
                          className={`rounded-xl border px-3 py-2 transition-colors ${
                            activeLetterId === letter.id
                              ? 'border-foreground/20 bg-foreground/8'  // active: loaded in editor
                              : 'border-glass-border bg-glass'           // passive: not loaded
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

          {/* ── Cover Letter Editor ─────────────────────────────────────────────────────
              HighlightEditor is a ContentEditable-based rich text editor where users
              assemble their cover letter from dragged/inserted library blocks.

              Props explained:
                ref={editorRef}                   — gives this component imperative access
                                                     to editor methods: .insertBlock(),
                                                     .clear(), .getHtml(), .getPlainText(),
                                                     .loadHtml()
                onBlockCountChange={setEditorBlockCount}
                                                  — the editor reports back how many highlight
                                                     blocks are inside; stored in editorBlockCount
                                                     to gate the "Grade Letter" button
                onCopy={handleCopy}               — called after the editor writes to clipboard;
                                                     this parent shows the green toast
                onCreateCard={handleCreateCard}    — called when user selects text and clicks
                                                     "Save as block"; POSTs to /api/coverletter/blocks
                isDragOver={isDragOver}            — tells the editor to show a drop-zone glow border
                setIsDragOver={setIsDragOver}      — the editor calls this on onDragOver/onDragLeave
          ─────────────────────────────────────────────────────────────────────── */}
          <HighlightEditor
            ref={editorRef}
            onBlockCountChange={setEditorBlockCount}
            onCopy={handleCopy}
            onCreateCard={handleCreateCard}
            isDragOver={isDragOver}
            setIsDragOver={setIsDragOver}
          />
        </div>

        {/* ═══ RIGHT PANEL: Block Library ══════════════════════════════════════════
            Fixed width (lg:w-[420px]) so the editor always has primary space.
            max-h-[calc(100vh-180px)] caps the panel height at viewport minus some
            breathing room so the scrollable block list doesn't overflow the viewport.
        ═══════════════════════════════════════════════════════════════════════ */}
        <div className="lg:w-[420px] flex flex-col gap-4">
          <div className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border p-4 flex flex-col max-h-[calc(100vh-180px)]">

            {/* ── Library header: block count + Add Block toggle ──────────────────────
                The "+ Add Block" button is a toggle:
                  - When the form is closed:          shows "+ Add Block", calls openCreateForm()
                  - When the form is open for CREATE: shows "Cancel",      calls closeBlockForm()
                  - When the form is open for EDIT:   button stays as "+ Add Block"
                    (the edit form has its own Cancel link inside it)
                sortedLibrary.length shows the count AFTER filters are applied. */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground/40 font-mono">
                Block Library — {sortedLibrary.length}
              </span>
              {/* Toggle logic:
                  showAddForm && !editingBlockId = the CREATE form is open
                    → clicking the button cancels the opened form
                  Otherwise (form closed, or EDIT form open)
                    → clicking the button opens a fresh create form */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (showAddForm && !editingBlockId) {
                    closeBlockForm()  // cancel the open create form
                  } else {
                    openCreateForm()  // open a new create form
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

            {/* ── Category filter pills ─────────────────────────────────────────────
                categoryNames is the derived array from above: ['All', ...CATEGORIES keys,
                ...any custom categories found in libraryBlocks].
                The active pill gets filled/inverted; inactive pills get a ghost border style.
                e.stopPropagation() prevents the root div's onClick from clearing selectedId. */}
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

            {/* ── Tag filter pills (only rendered when at least one tag exists) ──────────
                Hidden until the user creates at least one tag (libraryTags.length > 0).
                "All tags" always appears first and resets filterTagId to 'All'.
                Each tag pill sets filterTagId = tag.id to narrow the visible block list. */}
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

            {/* ── Add / Edit Block Form (collapsible) ──────────────────────────────────
                showAddForm=true makes the panel slide in.
                editingBlockId determines mode:
                  null  → "Add block" mode (POST create)
                  "..." → "Edit block" mode (PATCH update), form pre-filled with existing values

                Inputs write to blockForm via setBlockForm(prev => ({...prev, field: val})) —
                React's pattern for updating one field of an object state without losing others.

                Tag toggle pills call toggleBlockTag(tag.id) to add/remove from blockForm.tagIds.
                "Save changes" / "Add to Library" calls saveBlock().
                "Delete block" (edit mode only) calls deleteBlock(editingBlockId). */}
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
              {/* Tag Manager header: tag count + expand/collapse toggle.
                  showTagManager is toggled by the "Manage Tags" / "Hide" link.
                  When expanded:
                    - Input + "Add Tag" button: creates a tag via createTag()
                    - Each existing tag row has two sub-modes:
                        view mode:  tag name + pencil edit + delete buttons
                        edit mode:  inline input with Enter=save, Escape=cancel */}
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-foreground/60">Tags — {libraryTags.length}</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowTagManager((prev) => !prev)  // toggle expand/collapse
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
                            // ── Inline edit mode: input + checkmark + delete ──
                            <>
                              <input
                                autoFocus  // focus the input immediately on render
                                value={editingTagName}
                                onChange={(e) => setEditingTagName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    void saveTag()  // commit the rename
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingTagId(null)    // exit edit mode without saving
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
                            // ── View mode: tag name + pencil + delete ──
                            // Clicking the pencil button enters edit mode by setting editingTagId = tag.id
                            <>
                              <span className="flex-1 text-sm text-foreground/75">#{tag.name}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingTagId(tag.id)      // enter edit mode for this tag
                                  setEditingTagName(tag.name)  // pre-fill the input with current name
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

            {/* ── Scrollable block list ────────────────────────────────────────────────
                flex-1 lets this div expand to fill remaining vertical space in the panel.
                overflow-y-auto shows a scrollbar when blocks overflow (not always visible).
                sortedLibrary is the filtered + AI-sorted array from derived data above.

                Each BlockCard receives:
                  isInEditor=false     — library panel (not the editor)
                  isSelected           — true when block.id === selectedId (shows blue ring)
                  matchReason          — AI reason string from Gemini, or undefined
                  onSelect             — first click: setSelectedId(block.id)
                  onInsert             — inserts block into editor via editorRef.current?.insertBlock(b)
                  onManage             — pencil icon: opens edit form via startEditingBlock(block)
                  onRemove             — trash icon: deletes block via deleteBlock(blockId)

                Empty state:
                  libraryBlocks.length === 0   — nothing in the DB yet
                  sortedLibrary.length === 0   — DB has blocks but none pass the active filters */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {libraryLoading ? (
                <div className="py-10 text-center text-sm text-foreground/35">
                  Loading library…
                </div>
              ) : (
                <>
                  {/* AI suggestion blocks — ephemeral, purple, always pinned to top */}
                  {filteredSuggestions.map((s) => (
                    <BlockCard
                      key={s.id}
                      block={{ id: s.id, category: s.paragraphLabel, text: s.text, tags: [] }}
                      isInEditor={false}
                      isSelected={false}
                      isAISuggestion={true}
                      matchReason={s.reason}
                      onSelect={() => {}}
                      onInsert={(b) => editorRef.current?.insertBlock(b)}
                    />
                  ))}
                  {/* Existing library blocks, matched ones floating to the top */}
                  {sortedLibrary.map((block) => (
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
                  {sortedLibrary.length === 0 && filteredSuggestions.length === 0 && (
                    <p className="text-sm text-foreground/30 text-center py-8">
                      {libraryBlocks.length === 0
                        ? 'No blocks in the library yet'
                        : 'No blocks match the current filters'}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 