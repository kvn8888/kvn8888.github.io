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
  onCreateCard?: (block: Block) => void        // Called when user creates a card from selection (saves to library)
  isDragOver: boolean                          // Visual state for drop zone
  setIsDragOver: (v: boolean) => void          // Updates drag state in parent
}

// ─── Component ──────────────────────────────────────────────────────────────

const HighlightEditor = forwardRef<HighlightEditorHandle, HighlightEditorProps>(
  function HighlightEditor({ onBlockCountChange, onCopy, onCreateCard, isDragOver, setIsDragOver }, ref) {

  // Refs for the contentEditable editor and its wrapper (for positioning)
  const editorRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // UI state
  const [popup, setPopup] = useState<{ x: number; y: number } | null>(null)
  const [popupCategory, setPopupCategory] = useState('Custom') // Category for "Create Card" popup
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

  // ── Attach hover + drag events to a highlight span ──
  // - Hover: calculate bounding rect relative to wrapper, show floating X
  // - Drag: make the span a draggable block for reordering within the editor
  //   Setting contentEditable=false on the span prevents text-selection drag
  //   from intercepting the HTML5 drag-and-drop API.
  const attachCardEvents = useCallback((span: HTMLSpanElement) => {
    // Make the span a discrete draggable element, not editable inline text
    span.draggable = true
    span.contentEditable = 'false'
    span.style.cursor = 'grab'

    // Hover: position the floating X button at the span's top-right corner
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

    // Drag: serialize the block data so the drop handler can distinguish
    // a reorder (existing card in editor) from a new insert (library card).
    // We set a 'source:editor' flag so the drop handler knows to MOVE
    // rather than COPY.
    span.addEventListener('dragstart', (e: DragEvent) => {
      const blockData = {
        id: span.dataset.blockId || '',
        category: span.dataset.category || 'Custom',
        text: span.textContent || '',
        source: 'editor',  // distinguishes from library cards
      }
      e.dataTransfer?.setData('application/json', JSON.stringify(blockData))
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      span.style.opacity = '0.4'  // visual feedback: ghost the original
      setXBtnPos(null)             // hide X button during drag
    })
    span.addEventListener('dragend', () => {
      span.style.opacity = '1'    // restore opacity after drag
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
    // Two modes:
    //   1. Library → editor (source !== 'editor'): create a NEW span (copy)
    //   2. Editor → editor (source === 'editor'): MOVE the existing span
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      // Try to read library block data from the drag payload
      const jsonData = e.dataTransfer?.getData('application/json')
      if (jsonData) {
        try {
          const data = JSON.parse(jsonData)
          const isReorder = data.source === 'editor'

          // For reorder: find and detach the original span first
          let existingSpan: HTMLSpanElement | null = null
          if (isReorder && el) {
            // Find the span by matching text content and category
            const allCards = el.querySelectorAll('.hl-card')
            for (const card of allCards) {
              if (
                card.textContent === data.text &&
                (card as HTMLSpanElement).dataset.category === data.category
              ) {
                existingSpan = card as HTMLSpanElement
                break
              }
            }
            // Remove the original from its current position
            if (existingSpan?.parentNode) {
              existingSpan.parentNode.removeChild(existingSpan)
            }
          }

          // Create the span to insert (reuse existing for reorder, new for library)
          const span = existingSpan || createHighlightSpan(data.text, data.category)

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
  // Uses the category chosen in the popup dropdown (popupCategory state).
  // Also saves the new block to the library via onCreateCard callback.
  const createCardFromSelection = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    const selectedText = range.toString().trim()
    if (!selectedText) return

    // Use the selected category's color, or fall back to palette cycling
    const cat = CATEGORIES[popupCategory]
    const color = cat
      ? { bg: cat.bg, darkBg: cat.darkBg, border: cat.dot }
      : nextPaletteColor()

    const span = document.createElement('span')
    span.className = 'hl-card'
    span.dataset.category = popupCategory
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

    // Save the new block to the library so it persists and is reusable
    onCreateCard?.({
      id: Date.now().toString(),
      category: popupCategory,
      text: selectedText,
    })

    recount()
    saveContent()
  }, [resolvedTheme, popupCategory, recount, saveContent, attachCardEvents, onCreateCard])

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
            top-right of whichever highlight card is hovered.

            Structure: shadow wrapper div > squircle-masked button
            - The wrapper uses drop-shadow filter because CSS masks clip
              standard box-shadow. drop-shadow hugs the mask shape.
            - The button uses a superellipse SVG mask (.squircle class)
              for smooth iOS-style corners instead of border-radius.
            - On hover: lifts up (-translate-y-0.5), deeper shadow,
              background turns red to signal destructive action.
            - On active: presses down, smaller shadow, slight scale. */}
        {xBtnPos && (
          <div
            className="hl-floating-x absolute z-50 group/x inline-flex drop-shadow-sm hover:drop-shadow-md transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 active:drop-shadow-sm active:scale-95"
            style={{ left: xBtnPos.x, top: xBtnPos.y }}
            onMouseLeave={() => setXBtnPos(null)}
          >
            <button
              className="squircle relative w-6 h-6 bg-white dark:bg-neutral-700 flex items-center justify-center text-neutral-400 group-hover/x:bg-red-500 group-hover/x:text-white transition-colors duration-200 cursor-pointer focus:outline-none"
              aria-label="Remove highlight"
              onClick={() => { if (xBtnPos.card) removeCard(xBtnPos.card) }}
            >
              {/* SVG X icon — two crossed lines */}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* ── "Create Card" popup ──
            Appears above text when the user selects text in the editor.
            Contains a category dropdown and a button to wrap the selection
            in a new highlight span and save it to the library. */}
        {popup && (
          <div
            className="absolute z-50 bg-foreground text-background rounded-xl text-xs font-medium shadow-lg flex items-center gap-1.5 px-2 py-1.5"
            style={{
              left: popup.x,
              top: popup.y,
              transform: 'translate(-50%, 0)',
              animation: 'popIn 0.15s cubic-bezier(0.34,1.56,0.64,1) both',
            }}
          >
            {/* Category dropdown — lets user choose where to file the new block */}
            <select
              value={popupCategory}
              onChange={(e) => setPopupCategory(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="bg-background/20 text-background border border-background/20 rounded-lg px-1.5 py-1 text-[10px] font-medium outline-none cursor-pointer"
            >
              {Object.keys(CATEGORIES).map((cat) => (
                <option key={cat} value={cat} className="text-foreground bg-background">{cat}</option>
              ))}
              <option value="Custom" className="text-foreground bg-background">Custom</option>
            </select>
            {/* Create button — wraps selection in highlight + saves to library */}
            <button
              onClick={createCardFromSelection}
              className="bg-background/20 hover:bg-background/30 text-background border-none px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors"
            >
              + Create Card
            </button>
          </div>
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
