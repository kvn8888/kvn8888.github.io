'use client'

// ─── HighlightEditor Component ──────────────────────────────────────────────
// A contentEditable text editor where blocks appear as inline highlighted text.
// Blocks from the library get inserted as colored spans that wrap tightly
// around text like a highlighter pen — using box-decoration-break: clone
// so highlights flow seamlessly across line breaks with no gaps.
//
// Key behaviors:
//   - Drop blocks from library to insert as highlighted spans
//   - Click library blocks to insert (via parent calling insertBlock)
//   - Select text + "Create Card" popup to wrap text in a highlight
//   - Floating squircle X button on hover to delete a highlight
//   - Edit text inline — the highlight shrink-wraps around changes
//   - Auto-delete highlights when all their text is removed
//   - Content persisted to localStorage as raw HTML
//
// Architecture notes:
//   - Drag-and-drop uses NATIVE event listeners (not React synthetic events)
//     because contentEditable intercepts React's synthetic drop handling
//   - The X button is React-rendered as a floating absolute element,
//     positioned at the top-right of whichever card is hovered
//   - Exposes insertBlock() to the parent via useImperativeHandle/forwardRef
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { useTheme } from '@/app/components'
import { Block, CATEGORIES, nextPaletteColor } from './types'

// ─── Public interface for parent access ─────────────────────────────────────

export interface HighlightEditorHandle {
  insertBlock: (block: Block) => void
}

interface HighlightEditorProps {
  onBlockCountChange: (count: number) => void  // Reports block count changes
  onCopy: () => void                           // Called after copy-to-clipboard
  isDragOver: boolean                          // Visual state for drop zone
  setIsDragOver: (v: boolean) => void          // Updates drag state in parent
}

// ─── Component ──────────────────────────────────────────────────────────────

const HighlightEditor = forwardRef<HighlightEditorHandle, HighlightEditorProps>(
  function HighlightEditor({ onBlockCountChange, onCopy, isDragOver, setIsDragOver }, ref) {

  // Refs for the contentEditable editor and its wrapper (for positioning)
  const editorRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // UI state
  const [popup, setPopup] = useState<{ x: number; y: number } | null>(null)
  const [blockCount, setBlockCount] = useState(0)
  const { resolvedTheme } = useTheme()

  // Floating X button: tracks which card is hovered and where to show the X
  const [xBtnPos, setXBtnPos] = useState<{
    x: number
    y: number
    card: HTMLSpanElement
  } | null>(null)

  // ── Count highlighted blocks in the editor ──
  const recount = useCallback(() => {
    if (!editorRef.current) return
    const count = editorRef.current.querySelectorAll('.hl-card').length
    setBlockCount(count)
    onBlockCountChange(count)
  }, [onBlockCountChange])

  // ── Persist editor HTML to localStorage ──
  const saveContent = useCallback(() => {
    if (!editorRef.current) return
    localStorage.setItem('cl-editor-html', editorRef.current.innerHTML)
  }, [])

  // ── Attach hover events to a highlight span ──
  // When the user hovers over a highlighted span, we calculate
  // its bounding rect relative to the wrapper div and position
  // a floating X button at the top-right corner.
  const attachCardEvents = useCallback((span: HTMLSpanElement) => {
    span.addEventListener('mouseenter', () => {
      const wr = wrapperRef.current?.getBoundingClientRect()
      const sr = span.getBoundingClientRect()
      if (!wr) return
      setXBtnPos({
        x: sr.right - wr.left - 4,   // 4px inset from right edge
        y: sr.top - wr.top - 4,       // 4px inset from top edge
        card: span,
      })
    })
    span.addEventListener('mouseleave', (e: MouseEvent) => {
      // Don't hide if the mouse moved to the X button itself
      const related = e.relatedTarget as HTMLElement | null
      if (related?.closest?.('.hl-floating-x')) return
      setXBtnPos(null)
    })
  }, [])

  // ── Create a highlighted span element ──
  // Used when inserting library blocks or creating cards from selection.
  // The span uses box-decoration-break: clone for seamless multi-line wrapping.
  const createHighlightSpan = useCallback((text: string, category: string): HTMLSpanElement => {
    const cat = CATEGORIES[category]
    // Pick background color based on theme
    const bgColor = cat
      ? (resolvedTheme === 'dark' ? cat.darkBg : cat.bg)
      : (resolvedTheme === 'dark' ? 'rgba(107,114,128,0.25)' : 'rgba(107,114,128,0.12)')
    const borderColor = cat ? cat.dot : '#6b7280'

    const span = document.createElement('span')
    span.className = 'hl-card'
    span.dataset.category = category
    span.style.cssText = [
      `background: ${bgColor}`,
      // box-decoration-break: clone makes the highlight paint on every line
      // fragment independently, so multi-line text looks like one continuous
      // highlight with no vertical gaps between lines.
      'box-decoration-break: clone',
      '-webkit-box-decoration-break: clone',
      'padding: 3px 8px',
      'border-radius: 6px',
      // Increased line-height ensures highlight backgrounds from adjacent
      // lines overlap slightly, eliminating visible gaps.
      'line-height: 2.2',
      'transition: filter 0.2s, box-shadow 0.2s',
      `box-shadow: 0 1px 4px ${borderColor}33`,
      'display: inline',
    ].join(';')
    span.textContent = text
    attachCardEvents(span)
    return span
  }, [resolvedTheme, attachCardEvents])

  // ── Insert a block into the editor ──
  // Called by the parent (via ref) when a library block is clicked,
  // and also called by the drop handler when a block is dropped.
  const insertBlock = useCallback((block: Block) => {
    if (!editorRef.current) return
    const span = createHighlightSpan(block.text, block.category)
    // Add line breaks for spacing between blocks
    if (editorRef.current.innerHTML.trim()) {
      editorRef.current.appendChild(document.createElement('br'))
      editorRef.current.appendChild(document.createElement('br'))
    }
    editorRef.current.appendChild(span)
    recount()
    saveContent()
  }, [createHighlightSpan, recount, saveContent])

  // ── Expose insertBlock to the parent component ──
  useImperativeHandle(ref, () => ({ insertBlock }), [insertBlock])

  // ── Load saved content on mount ──
  useEffect(() => {
    if (!editorRef.current) return
    // Clean up legacy format (old JSON-based editor state)
    localStorage.removeItem('cl-editor')
    const saved = localStorage.getItem('cl-editor-html')
    if (saved) {
      editorRef.current.innerHTML = saved
    }
    recount()
    // Re-attach hover handlers to any saved highlight cards
    editorRef.current.querySelectorAll('.hl-card').forEach((card) => {
      attachCardEvents(card as HTMLSpanElement)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Native drag-and-drop event listeners ──
  // We use native DOM event listeners instead of React's onDragOver/onDrop
  // because contentEditable elements intercept React's synthetic drag events,
  // preventing custom drop handling from working reliably.
  useEffect(() => {
    const el = editorRef.current
    if (!el) return

    // Allow drops by preventing the default dragover behavior
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }

    // Reset visual state when drag leaves the editor
    const handleDragLeave = () => {
      setIsDragOver(false)
    }

    // Handle the actual drop — read block data and insert as highlighted span
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      // Try to read library block data from the drag payload
      const jsonData = e.dataTransfer?.getData('application/json')
      if (jsonData) {
        try {
          const block: Block = JSON.parse(jsonData)
          const span = createHighlightSpan(block.text, block.category)

          // Try to insert at the exact drop position using caret detection
          let range: Range | null = null
          if (document.caretRangeFromPoint) {
            range = document.caretRangeFromPoint(e.clientX, e.clientY)
          }

          if (range && el.contains(range.startContainer)) {
            // Walk up the DOM to check we're not inside an existing card
            let node: Node | null = range.startContainer
            let insideCard = false
            while (node && node !== el) {
              if ((node as HTMLElement).classList?.contains('hl-card')) {
                insideCard = true
                break
              }
              node = node.parentNode
            }
            if (!insideCard) {
              range.insertNode(span)
              // Add a non-breaking space after for cursor flow
              const space = document.createTextNode('\u00A0')
              span.after(space)
            } else {
              // Can't insert inside a card — append at end instead
              el.appendChild(document.createElement('br'))
              el.appendChild(span)
            }
          } else {
            // Fallback: append at the end of the editor
            if (el.innerHTML.trim()) {
              el.appendChild(document.createElement('br'))
              el.appendChild(document.createElement('br'))
            }
            el.appendChild(span)
          }
          recount()
          saveContent()
        } catch { /* invalid JSON — not a library block, ignore */ }
      }
    }

    el.addEventListener('dragover', handleDragOver)
    el.addEventListener('dragleave', handleDragLeave)
    el.addEventListener('drop', handleDrop)

    return () => {
      el.removeEventListener('dragover', handleDragOver)
      el.removeEventListener('dragleave', handleDragLeave)
      el.removeEventListener('drop', handleDrop)
    }
  }, [createHighlightSpan, recount, saveContent, setIsDragOver])

  // ── Remove a highlight card (unwrap text, keep content) ──
  const removeCard = useCallback((card: HTMLSpanElement) => {
    const parent = card.parentNode
    if (!parent) return
    // Move the card's text content out of the span
    while (card.firstChild) {
      parent.insertBefore(card.firstChild, card)
    }
    parent.removeChild(card)
    // Merge adjacent text nodes for cleanliness
    parent.normalize()
    setXBtnPos(null)
    recount()
    saveContent()
  }, [recount, saveContent])

  // ── Selection detection: show "Create Card" popup above selected text ──
  const checkSelection = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim() || !editorRef.current) {
        setPopup(null)
        return
      }
      const range = sel.getRangeAt(0)
      // Don't allow creating a card inside an existing card
      let node: Node | null = range.commonAncestorContainer
      while (node && node !== editorRef.current) {
        if ((node as HTMLElement).classList?.contains('hl-card')) {
          setPopup(null)
          return
        }
        node = node.parentNode
      }
      // Position the popup centered above the selection
      const rr = range.getBoundingClientRect()
      const wr = wrapperRef.current?.getBoundingClientRect()
      if (!wr) return
      setPopup({
        x: rr.left + rr.width / 2 - wr.left,
        y: rr.top - wr.top - 46,
      })
    }, 10) // Small delay to let the selection stabilize
  }, [])

  // ── Create a card from the current text selection ──
  const createCardFromSelection = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    const color = nextPaletteColor()

    const span = document.createElement('span')
    span.className = 'hl-card'
    span.dataset.category = 'Custom'
    const bgColor = resolvedTheme === 'dark' ? color.darkBg : color.bg
    span.style.cssText = [
      `background: ${bgColor}`,
      'box-decoration-break: clone',
      '-webkit-box-decoration-break: clone',
      'padding: 3px 8px',
      'border-radius: 6px',
      'line-height: 2.2',
      'transition: filter 0.2s, box-shadow 0.2s',
      `box-shadow: 0 1px 4px ${color.border}33`,
      'display: inline',
    ].join(';')

    // Extract the selected content and wrap it in the highlight span
    try {
      const frag = range.extractContents()
      span.appendChild(frag)
    } catch {
      const text = range.toString()
      range.deleteContents()
      span.textContent = text
    }
    attachCardEvents(span)

    range.insertNode(span)
    sel.removeAllRanges()
    setPopup(null)
    recount()
    saveContent()
  }, [resolvedTheme, recount, saveContent, attachCardEvents])

  // ── Auto-remove empty cards on any input event ──
  const onInput = useCallback(() => {
    if (!editorRef.current) return
    editorRef.current.querySelectorAll('.hl-card').forEach((card) => {
      const txt = card.textContent?.trim()
      if (!txt) card.parentNode?.removeChild(card)
    })
    recount()
    saveContent()
  }, [recount, saveContent])

  // ── Copy all editor text to clipboard ──
  const handleCopy = useCallback(() => {
    if (!editorRef.current) return
    navigator.clipboard.writeText(editorRef.current.innerText)
    onCopy()
  }, [onCopy])

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border p-4 flex-1 flex flex-col min-h-[300px]">
      {/* Header with block count and copy button */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-foreground/40 font-mono">
          Cover Letter — {blockCount} block{blockCount !== 1 ? 's' : ''}
        </span>
        {blockCount > 0 && (
          <button
            onClick={handleCopy}
            className="px-3 py-1 rounded-full text-xs font-medium border border-glass-border hover:bg-foreground/5 text-foreground/50 hover:text-foreground/70 transition-all cursor-pointer"
          >
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">content_copy</span>
              Copy Text
            </span>
          </button>
        )}
      </div>

      {/* Editor surface — wrapper div provides positioning context */}
      <div ref={wrapperRef} className="relative flex-1">

        {/* ── Floating squircle X button ──
            Rendered as a React element positioned absolutely at the
            top-right corner of whichever highlight card is hovered.
            "Squircle" = rounded square (border-radius: 6px, not 50%). */}
        {xBtnPos && (
          <button
            className="hl-floating-x absolute z-50 flex items-center justify-center w-5 h-5 text-xs cursor-pointer transition-all"
            style={{
              left: xBtnPos.x,
              top: xBtnPos.y,
              borderRadius: '6px',
              background: 'rgba(0,0,0,0.15)',
              color: 'rgba(0,0,0,0.6)',
              border: 'none',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => {
              // Turn red on hover to indicate destructive action
              e.currentTarget.style.background = 'rgba(239,68,68,0.9)'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.15)'
              e.currentTarget.style.color = 'rgba(0,0,0,0.6)'
              setXBtnPos(null)
            }}
            onClick={() => { if (xBtnPos.card) removeCard(xBtnPos.card) }}
          >
            ×
          </button>
        )}

        {/* ── "Create Card" popup ──
            Appears above text when the user selects text in the editor.
            Clicking it wraps the selection in a new highlight span. */}
        {popup && (
          <button
            onClick={createCardFromSelection}
            className="absolute z-50 bg-foreground text-background border-none px-4 py-2 rounded-xl text-xs font-medium cursor-pointer shadow-lg"
            style={{
              left: popup.x,
              top: popup.y,
              transform: 'translate(-50%, 0)',
              animation: 'popIn 0.15s cubic-bezier(0.34,1.56,0.64,1) both',
            }}
          >
            Create Card
          </button>
        )}

        {/* ── The contentEditable editor area ──
            Drag events are handled by native listeners (useEffect above).
            React handles mouse/key events for selection detection. */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onMouseUp={checkSelection}
          onKeyUp={checkSelection}
          onInput={onInput}
          onBlur={() => { setTimeout(() => setPopup(null), 200); saveContent() }}
          className={`min-h-[200px] rounded-xl p-5 text-sm leading-[2.2] text-foreground outline-none transition-all ${
            isDragOver
              ? 'border-2 border-dashed border-blue-400 bg-blue-500/5'
              : 'border border-glass-border bg-foreground/[0.02]'
          }`}
          style={{ overflowWrap: 'break-word' }}
        />

        {/* Empty state overlay — only visible when editor has no blocks */}
        {blockCount === 0 && (
          <div
            className="absolute inset-0 flex items-center justify-center text-foreground/30 text-sm text-center leading-relaxed pointer-events-none rounded-xl"
            style={{ top: 40 }}
          >
            <div>
              <span className="material-symbols-outlined text-3xl block mb-2">drag_indicator</span>
              Drag blocks from the library, or
              <br />
              click a block to insert it
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

export default HighlightEditor
