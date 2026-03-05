'use client'

import { useState, useEffect, useCallback } from 'react'

/*
 * ─── Notes Page — /tools/notes ───────────────────────────────────────────────
 *
 * Features:
 *   • List all personal notes (Turso-backed, per-user)
 *   • Create a new note with markdown body
 *   • Edit a note inline (split-pane: editor left, preview right on ≥md screens)
 *   • Delete a note permanently
 *   • Archive / unarchive notes (soft-delete)
 *   • Toggle between archived and active views
 *   • Client-side Markdown renderer (no external dependency):
 *       - Headings (#, ##, ###, ####)
 *       - Bold (**text** or __text__)
 *       - Italic (*text* or _text_)
 *       - Inline code (`code`)
 *       - Fenced code blocks (```lang\ncode```)
 *       - Unordered lists (-, *, +)
 *       - Ordered lists (1. 2. …)
 *       - Blockquotes (> text)
 *       - Horizontal rules (---, ***)
 *       - Links ([text](url)) — sanitised, https/http only
 *       - Paragraph breaks (blank lines)
 *
 * Markdown Security:
 *   The renderer produces a plain-text HTML string that is injected via
 *   dangerouslySetInnerHTML.  To prevent XSS:
 *     1. HTML special characters in the raw input are escaped first.
 *     2. Only <a href="https://…"> and <a href="http://…"> are allowed.
 *     3. All other potential injection vectors (script:, javascript:, data:)
 *        are rejected by the href allowlist.
 */

interface Note {
  id: string
  title: string
  body: string
  archived: boolean
  createdAt: number
  updatedAt: number
}

// ─── Minimal Markdown Renderer ───────────────────────────────────────────────

/**
 * Escape HTML special characters to prevent XSS from raw user input.
 * Applied to all user-generated text before any Markdown processing.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Apply inline Markdown spans to an already-HTML-escaped line:
 * bold, italic, inline code, and links.
 *
 * Order matters — code spans are applied first so that backtick content is
 * not further processed by bold/italic regexps.
 */
function renderInline(s: string): string {
  return s
    // Inline code (must run before bold/italic to protect backtick content)
    .replace(/`([^`]+)`/g, '<code class="md-code-inline">$1</code>')
    // Bold + italic combined (***text***)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold (**text** or __text__) — handle before single-star/underscore italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic (*text* or _text_) — match single delimiter not adjacent to another of the same kind.
    // Avoid negative lookbehind (unsupported on Safari < 16.4): instead match
    // [^*] boundary on both sides, allowing start-of-string via alternation.
    .replace(/(^|[^*])\*([^*\s][^*]*?[^*\s]|\S)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\s][^_]*?[^_\s]|\S)_(?!_)/g, '$1<em>$2</em>')
    // Links — only allow http/https URLs to prevent javascript: XSS
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>'
    )
}

/**
 * Convert Markdown to safe HTML.
 *
 * Implements a line-by-line state machine:
 *   State: normal | ul | ol | blockquote | fence
 *   Each line is classified and either appended to the current block or
 *   starts a new one after flushing the previous.
 */
function renderMarkdown(raw: string): string {
  const lines = raw.split('\n')
  const out: string[] = []
  type State = 'none' | 'ul' | 'ol' | 'blockquote' | 'fence'
  let state: State = 'none'
  let fenceLang = ''
  let fenceLines: string[] = []
  let paragraphLines: string[] = []

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      out.push(`<p class="md-p">${paragraphLines.join('<br>')}</p>`)
      paragraphLines = []
    }
  }

  const flushList = () => {
    if (state === 'ul') { out.push('</ul>'); state = 'none' }
    else if (state === 'ol') { out.push('</ol>'); state = 'none' }
  }

  const flushBlockquote = () => {
    if (state === 'blockquote') { out.push('</blockquote>'); state = 'none' }
  }

  for (const rawLine of lines) {
    // ── Fenced code block ────────────────────────────────────────────────
    if (state === 'fence') {
      if (rawLine.trimStart().startsWith('```')) {
        const code = fenceLines.map(escapeHtml).join('\n')
        const langClass = fenceLang ? ` class="language-${escapeHtml(fenceLang)}"` : ''
        out.push(`<pre class="md-pre"><code${langClass}>${code}</code></pre>`)
        fenceLines = []; fenceLang = ''; state = 'none'
      } else {
        fenceLines.push(rawLine)
      }
      continue
    }

    if (rawLine.trimStart().startsWith('```')) {
      flushParagraph(); flushList(); flushBlockquote()
      fenceLang = rawLine.trimStart().slice(3).trim()
      state = 'fence'
      continue
    }

    const line = escapeHtml(rawLine)

    // ── Headings ─────────────────────────────────────────────────────────
    const h4 = line.match(/^####\s+(.+)/); const h3 = line.match(/^###\s+(.+)/)
    const h2 = line.match(/^##\s+(.+)/);  const h1 = line.match(/^#\s+(.+)/)
    if (h4 || h3 || h2 || h1) {
      flushParagraph(); flushList(); flushBlockquote()
      if (h4)      out.push(`<h4 class="md-h4">${renderInline(h4[1])}</h4>`)
      else if (h3) out.push(`<h3 class="md-h3">${renderInline(h3[1])}</h3>`)
      else if (h2) out.push(`<h2 class="md-h2">${renderInline(h2[1])}</h2>`)
      else if (h1) out.push(`<h1 class="md-h1">${renderInline(h1[1])}</h1>`)
      continue
    }

    // ── Horizontal rule ──────────────────────────────────────────────────
    if (/^(-{3,}|\*{3,})$/.test(rawLine.trim())) {
      flushParagraph(); flushList(); flushBlockquote()
      out.push('<hr class="md-hr">'); continue
    }

    // ── Unordered list ───────────────────────────────────────────────────
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)/)
    if (ulMatch) {
      flushParagraph(); flushBlockquote()
      if (state !== 'ul') { flushList(); out.push('<ul class="md-ul">'); state = 'ul' }
      out.push(`<li class="md-li">${renderInline(ulMatch[2])}</li>`); continue
    }

    // ── Ordered list ─────────────────────────────────────────────────────
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)/)
    if (olMatch) {
      flushParagraph(); flushBlockquote()
      if (state !== 'ol') { flushList(); out.push('<ol class="md-ol">'); state = 'ol' }
      out.push(`<li class="md-li">${renderInline(olMatch[2])}</li>`); continue
    }

    // ── Blockquote ───────────────────────────────────────────────────────
    const bqMatch = line.match(/^&gt;\s?(.*)/)
    if (bqMatch) {
      flushParagraph(); flushList()
      if (state !== 'blockquote') { out.push('<blockquote class="md-bq">'); state = 'blockquote' }
      out.push(`<p class="md-bq-p">${renderInline(bqMatch[1])}</p>`); continue
    }

    // ── Blank line → flush blocks ────────────────────────────────────────
    if (rawLine.trim() === '') {
      flushParagraph(); flushList(); flushBlockquote(); continue
    }

    // ── Normal paragraph line ────────────────────────────────────────────
    flushList(); flushBlockquote()
    paragraphLines.push(renderInline(line))
  }

  flushParagraph(); flushList(); flushBlockquote()
  if (state === 'fence' && fenceLines.length > 0) {
    out.push(`<pre class="md-pre"><code>${fenceLines.map(escapeHtml).join('\n')}</code></pre>`)
  }

  return out.join('\n')
}

// ─── Main Notes Page ─────────────────────────────────────────────────────────

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editMode, setEditMode] = useState<'edit' | 'preview'>('edit')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null

  const loadNotes = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/notes${showArchived ? '?archived=1' : ''}`, { cache: 'no-store' })
      if (!res.ok) { setError('Unable to load notes.'); return }
      const data = await res.json()
      setNotes(data.items || [])
    } catch { setError('Unable to load notes.') }
    finally { setLoading(false) }
  }, [showArchived])

  useEffect(() => { loadNotes() }, [loadNotes])

  useEffect(() => {
    if (selectedNote) { setEditTitle(selectedNote.title); setEditBody(selectedNote.body); setSaveError(null) }
  }, [selectedNote])

  const createNote = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Note', body: '' }),
      })
      if (!res.ok) { setError('Failed to create note.'); return }
      const { id } = await res.json()
      await loadNotes()
      setSelectedId(id)
    } catch { setError('Failed to create note.') }
    finally { setCreating(false) }
  }

  const saveNote = async () => {
    if (!selectedId) return
    setSaving(true); setSaveError(null)
    try {
      const res = await fetch('/api/notes', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedId, title: editTitle, body: editBody }),
      })
      if (!res.ok) { setSaveError('Failed to save.'); return }
      await loadNotes()
    } catch { setSaveError('Failed to save.') }
    finally { setSaving(false) }
  }

  const archiveNote = async (id: string, archive: boolean) => {
    try {
      await fetch('/api/notes', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, archived: archive }),
      })
      if (selectedId === id) setSelectedId(null)
      await loadNotes()
    } catch { setError('Failed to update note.') }
  }

  const deleteNote = async (id: string) => {
    if (!confirm('Permanently delete this note?')) return
    try {
      await fetch('/api/notes', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (selectedId === id) setSelectedId(null)
      await loadNotes()
    } catch { setError('Failed to delete note.') }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className={`flex items-center justify-between flex-wrap gap-3 ${mounted ? 'blur-reveal' : 'opacity-0'}`}>
        <div>
          <h1 className="text-2xl font-medium text-foreground">Notes</h1>
          <p className="text-sm text-foreground/50 mt-0.5">
            {showArchived ? 'Archived notes' : 'Private markdown notes stored in Turso'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setShowArchived((v) => !v); setSelectedId(null) }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/5 text-foreground/60 text-xs hover:bg-foreground/10 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">{showArchived ? 'inbox' : 'archive'}</span>
            {showArchived ? 'Active notes' : 'Archived'}
          </button>
          {!showArchived && (
            <button
              onClick={createNote}
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              New Note
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Layout: list | editor */}
      <div className={`flex gap-4 ${mounted ? 'blur-reveal-1' : 'opacity-0'}`} style={{ minHeight: '480px' }}>
        {/* Notes list */}
        <div className="w-64 shrink-0 rounded-2xl bg-glass backdrop-blur-sm border border-glass-border flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-foreground/5">
            <p className="text-xs font-medium text-foreground/50">
              {loading ? 'Loading…' : `${notes.length} note${notes.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-foreground/5">
            {notes.length === 0 && !loading && (
              <p className="text-sm text-foreground/40 p-4">
                {showArchived ? 'No archived notes.' : 'No notes yet. Create one above.'}
              </p>
            )}
            {notes.map((note) => (
              <button
                key={note.id}
                onClick={() => setSelectedId(note.id)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  selectedId === note.id ? 'bg-foreground/10' : 'hover:bg-foreground/5'
                }`}
              >
                <p className="text-sm font-medium text-foreground truncate">{note.title || 'Untitled'}</p>
                <p className="text-xs text-foreground/40 mt-0.5">
                  {new Date(note.updatedAt).toLocaleDateString()}
                </p>
                {note.body && (
                  <p className="text-xs text-foreground/30 mt-0.5 leading-relaxed" style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>
                    {note.body.slice(0, 80)}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Editor / Preview pane */}
        <div className="flex-1 rounded-2xl bg-glass backdrop-blur-sm border border-glass-border flex flex-col overflow-hidden">
          {selectedNote ? (
            <>
              {/* Toolbar */}
              <div className="px-5 py-3 border-b border-foreground/5 flex items-center justify-between gap-3 flex-wrap">
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={saveNote}
                  placeholder="Note title…"
                  className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-foreground/30 focus:outline-none min-w-0"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex rounded-full bg-foreground/5 p-0.5">
                    {(['edit', 'preview'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setEditMode(mode)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                          editMode === mode ? 'bg-foreground text-background' : 'text-foreground/50 hover:text-foreground/70'
                        }`}
                      >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => archiveNote(selectedNote.id, !selectedNote.archived)}
                    title={selectedNote.archived ? 'Unarchive' : 'Archive'}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-foreground/5 text-foreground/50 text-xs hover:bg-foreground/10 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">{selectedNote.archived ? 'unarchive' : 'archive'}</span>
                  </button>
                  <button
                    onClick={() => deleteNote(selectedNote.id)}
                    title="Delete note"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs hover:bg-red-100 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              </div>

              {/* Editor / Preview */}
              <div className="flex-1 overflow-hidden">
                {editMode === 'edit' ? (
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    onBlur={saveNote}
                    placeholder={'# Heading\n\nStart writing in **Markdown**…\n\n- Bullet points\n- `inline code`\n\n```js\nconsole.log("Hello")\n```\n\n[Link](https://example.com)'}
                    className="w-full h-full resize-none bg-transparent px-5 py-4 text-sm text-foreground placeholder:text-foreground/20 focus:outline-none leading-relaxed font-mono"
                  />
                ) : (
                  <div
                    className="px-5 py-4 overflow-y-auto h-full md-prose text-sm text-foreground leading-relaxed"
                    // Safe: escapeHtml applied to all user input in renderMarkdown;
                    // only http/https href links pass through the inline renderer.
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(editBody) || '<p class="md-p text-foreground/30">Nothing to preview yet.</p>' }}
                  />
                )}
              </div>

              {/* Status bar */}
              <div className="px-5 py-2 border-t border-foreground/5 flex items-center justify-between text-xs text-foreground/30">
                <span>{saving ? 'Saving…' : saveError ? <span className="text-red-500">{saveError}</span> : 'Auto-saved on blur'}</span>
                <span>{editBody.length.toLocaleString()} chars · Updated {new Date(selectedNote.updatedAt).toLocaleString()}</span>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <span className="material-symbols-outlined text-4xl text-foreground/20">description</span>
                <p className="text-sm text-foreground/40">
                  {notes.length === 0
                    ? showArchived ? 'No archived notes.' : 'Create your first note using the button above.'
                    : 'Select a note from the list to edit.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Markdown syntax reference */}
      <details className={`group ${mounted ? 'blur-reveal-2' : 'opacity-0'}`}>
        <summary className="text-xs text-foreground/30 cursor-pointer hover:text-foreground/50 transition-colors select-none rounded-xl bg-glass backdrop-blur-sm border border-glass-border px-4 py-3">
          Markdown Syntax Reference
        </summary>
        <div className="mt-2 rounded-xl bg-glass backdrop-blur-sm border border-glass-border p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-foreground/50">
          {[
            ['# Heading 1', '<h1>'], ['## Heading 2', '<h2>'],
            ['**bold**', '<strong>'], ['*italic*', '<em>'],
            ['`code`', 'inline code'], ['```lang\\ncode```', 'fenced block'],
            ['- item', 'unordered list'], ['1. item', 'ordered list'],
            ['> quote', 'blockquote'], ['---', 'horizontal rule'],
            ['[text](url)', 'link (http/https only)'],
          ].map(([syntax, desc]) => (
            <div key={syntax} className="flex gap-2">
              <code className="shrink-0 text-foreground/60">{syntax}</code>
              <span className="text-foreground/30">→ {desc}</span>
            </div>
          ))}
        </div>
      </details>

      {/* Global Markdown styles injected as a scoped style tag */}
      <style>{`
        .md-h1 { font-size: 1.5rem; font-weight: 500; margin: 1.25rem 0 0.5rem; }
        .md-h2 { font-size: 1.25rem; font-weight: 500; margin: 1rem 0 0.5rem; }
        .md-h3 { font-size: 1.1rem; font-weight: 500; margin: 0.875rem 0 0.375rem; }
        .md-h4 { font-size: 1rem; font-weight: 500; margin: 0.75rem 0 0.25rem; }
        .md-p  { margin: 0.5rem 0; opacity: 0.85; line-height: 1.7; }
        .md-ul, .md-ol { margin: 0.5rem 0 0.5rem 1.25rem; padding: 0; }
        .md-li { margin: 0.25rem 0; opacity: 0.85; }
        .md-ul { list-style-type: disc; }
        .md-ol { list-style-type: decimal; }
        .md-bq { border-left: 3px solid rgba(10,10,10,0.15); margin: 0.75rem 0; padding: 0.5rem 0.75rem; }
        .dark .md-bq { border-left-color: rgba(255,255,255,0.2); }
        .md-bq-p { margin: 0; opacity: 0.6; font-style: italic; }
        .md-hr { border: none; border-top: 1px solid rgba(10,10,10,0.1); margin: 1rem 0; }
        .dark .md-hr { border-top-color: rgba(255,255,255,0.1); }
        .md-pre { background: rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.06); border-radius: 0.5rem; padding: 0.75rem 1rem; margin: 0.75rem 0; overflow-x: auto; }
        .dark .md-pre { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); }
        .md-pre code { font-family: var(--font-mono, monospace); font-size: 0.8125rem; opacity: 0.9; }
        .md-code-inline { background: rgba(0,0,0,0.06); border-radius: 0.25rem; padding: 0.1em 0.35em; font-family: var(--font-mono, monospace); font-size: 0.875em; opacity: 0.9; }
        .dark .md-code-inline { background: rgba(255,255,255,0.08); }
        .md-link { color: #3b82f6; text-decoration: underline; text-underline-offset: 2px; }
        .md-link:hover { opacity: 0.8; }
      `}</style>
    </div>
  )
}

