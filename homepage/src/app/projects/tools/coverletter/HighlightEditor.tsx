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

  // Floating X button: tracks which card is hovered or selected, and where to position
  const [xBtnPos, setXBtnPos] = useState<{
    x: number
    y: number
    card: HTMLSpanElement
  } | null>(null)

  // Selected block: the currently clicked/active highlight card.
  // Used for visual selection ring, persistent X button, and keyboard delete.
  const [selectedCard, setSelectedCard] = useState<HTMLSpanElement | null>(null)

  // Drop indicator: shows a vertical cursor line where a dragged block will be inserted.
  // Stores {x, y} position relative to the wrapper div.
  const [dropIndicator, setDropIndicator] = useState<{ x: number; y: number; height: number } | null>(null)

  // Undo stack: stores previous innerHTML states for Cmd+Z support.
  // Limited to 50 entries to prevent memory bloat.
  const undoStackRef = useRef<string[]>([])
  const MAX_UNDO = 50

  // Saves the current editor state to the undo stack before a mutation.
  // Call this BEFORE any DOM change so the user can revert.
  const pushUndo = useCallback(() => {
    if (!editorRef.current) return
    const stack = undoStackRef.current
    stack.push(editorRef.current.innerHTML)
    if (stack.length > MAX_UNDO) stack.shift() // drop oldest if over limit
  }, [])

  // Last known caret position: saved on mouseup/keyup in the editor
  // so that clicking a library block inserts at this position.
  const lastRangeRef = useRef<Range | null>(null)

  // ── Position the X button relative to a card ──
  // Reused for both hover and selection states. Returns the x/y
  // relative to the wrapper div, positioned at the card's top-right corner.
  const positionXBtn = useCallback((span: HTMLSpanElement) => {
    const wr = wrapperRef.current?.getBoundingClientRect()
    const sr = span.getBoundingClientRect()
    if (!wr) return
    setXBtnPos({
      x: sr.right - wr.left - 4,
      y: sr.top - wr.top - 4,
      card: span,
    })
  }, [])

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

  // ── Attach hover, click, drag, and edit events to a highlight span ──
  //
  // Interaction model:
  //   Single click  → select the block (visual ring, X button appears)
  //   Click away    → deselect
  //   Drag          → drag the block to reorder or reposition
  //   Double-click  → enter inline text editing mode
  //   Blur (edit)   → exit edit mode, back to draggable
  //
  // Setting contentEditable=false on spans makes them discrete draggable
  // objects instead of editable text. Double-click toggles this temporarily.
  const attachCardEvents = useCallback((span: HTMLSpanElement) => {
    // Make the span a discrete draggable element, not editable inline text
    span.draggable = true
    span.contentEditable = 'false'
    span.style.cursor = 'grab'

    // Hover: show X button on mouse enter (non-selected cards)
    span.addEventListener('mouseenter', () => {
      positionXBtn(span)
    })
    span.addEventListener('mouseleave', (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null
      if (related?.closest?.('.hl-floating-x')) return
      // Only hide X on mouseleave if this card isn't selected
      // (selected cards keep the X visible)
      setXBtnPos((prev) => {
        if (prev?.card === span) {
          // Check if this span is currently selected — if so, keep X visible
          if (span.classList.contains('hl-selected')) return prev
          return null
        }
        return prev
      })
    })

    // Click: select this block (show visual ring + persistent X button)
    span.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation()
      // Don't select if we're in edit mode (contentEditable is true)
      if (span.contentEditable === 'true') return

      // Deselect any previously selected card
      const prevSelected = editorRef.current?.querySelector('.hl-selected')
      if (prevSelected) prevSelected.classList.remove('hl-selected')

      // Select this card
      span.classList.add('hl-selected')
      setSelectedCard(span)
      positionXBtn(span)
    })

    // Drag: serialize block data with 'source: editor' flag for reorder detection
    span.addEventListener('dragstart', (e: DragEvent) => {
      const blockData = {
        id: span.dataset.blockId || '',
        category: span.dataset.category || 'Custom',
        text: span.textContent || '',
        source: 'editor',
      }
      e.dataTransfer?.setData('application/json', JSON.stringify(blockData))
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      span.style.opacity = '0.4'
      setXBtnPos(null)
      // Deselect during drag
      span.classList.remove('hl-selected')
      setSelectedCard(null)
    })
    span.addEventListener('dragend', () => {
      span.style.opacity = '1'
    })

    // Double-click: enter inline edit mode
    // Switches span from draggable → editable text temporarily
    span.addEventListener('dblclick', (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // Remove selection state while editing
      span.classList.remove('hl-selected')
      setSelectedCard(null)
      setXBtnPos(null)

      span.contentEditable = 'true'
      span.draggable = false
      span.style.cursor = 'text'
      span.focus()

      // Select all text for easy replacement
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(span)
      sel?.removeAllRanges()
      sel?.addRange(range)
    })

    // Blur: exit edit mode, restore draggable behavior
    span.addEventListener('blur', () => {
      span.contentEditable = 'false'
      span.draggable = true
      span.style.cursor = 'grab'
      if (!span.textContent?.trim()) {
        span.parentNode?.removeChild(span)
        recount()
      }
      saveContent()
    })
  }, [recount, saveContent, positionXBtn])

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
  // Inserts at the last known caret position if available, otherwise at end.
  const insertBlock = useCallback((block: Block) => {
    if (!editorRef.current) return
    pushUndo()
    const span = createHighlightSpan(block.text, block.category)

    // Try to insert at the last known caret position in the editor
    const savedRange = lastRangeRef.current
    if (savedRange && editorRef.current.contains(savedRange.startContainer)) {
      // Check we're not inside an existing card
      let node: Node | null = savedRange.startContainer
      let insideCard = false
      while (node && node !== editorRef.current) {
        if ((node as HTMLElement).classList?.contains('hl-card')) {
          insideCard = true
          break
        }
        node = node.parentNode
      }
      if (!insideCard) {
        savedRange.insertNode(span)
        const space = document.createTextNode('\u00A0')
        span.after(space)
        // Clear the saved range so next insert goes to end unless user clicks again
        lastRangeRef.current = null
        recount()
        saveContent()
        return
      }
    }

    // Fallback: append at end
    if (editorRef.current.innerHTML.trim()) {
      editorRef.current.appendChild(document.createElement('br'))
      editorRef.current.appendChild(document.createElement('br'))
    }
    editorRef.current.appendChild(span)
    recount()
    saveContent()
  }, [createHighlightSpan, recount, saveContent, pushUndo])

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
  // Uses a HYBRID positioning approach with a visual drop indicator.
  // During dragover: calculates where the block would be inserted and
  // shows a blue horizontal line at that Y position.
  // On drop: inserts the block at the calculated position.
  useEffect(() => {
    const el = editorRef.current
    if (!el) return

    // Helper: check if a DOM node is inside an .hl-card span
    const isInsideCard = (node: Node | null): HTMLSpanElement | null => {
      while (node && node !== el) {
        if ((node as HTMLElement).classList?.contains('hl-card')) {
          return node as HTMLSpanElement
        }
        node = node.parentNode
      }
      return null
    }

    // Helper: calculate the vertical cursor position for the drop indicator.
    // Returns {x, y, height} relative to the wrapper div, like a text caret.
    const calcDropIndicator = (clientX: number, clientY: number): { x: number; y: number; height: number } | null => {
      const wr = wrapperRef.current?.getBoundingClientRect()
      if (!wr) return null

      // Strategy 1: caret in text area — get exact cursor position
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(clientX, clientY)
        if (range && el.contains(range.startContainer) && !isInsideCard(range.startContainer)) {
          const rects = range.getClientRects()
          if (rects.length > 0) {
            const r = rects[0]
            return {
              x: r.left - wr.left,
              y: r.top - wr.top,
              height: r.height || 20,
            }
          }
        }
      }

      // Strategy 2: near a block — show cursor at the block edge
      const allCards = Array.from(el.querySelectorAll('.hl-card')) as HTMLSpanElement[]
      for (const card of allCards) {
        const rect = card.getBoundingClientRect()
        const midY = rect.top + rect.height / 2
        if (clientY <= midY) {
          // Before this card — show cursor at its left edge
          return {
            x: rect.left - wr.left - 2,
            y: rect.top - wr.top,
            height: rect.height,
          }
        }
      }
      // After all cards — show cursor at right edge of last card
      if (allCards.length > 0) {
        const lastRect = allCards[allCards.length - 1].getBoundingClientRect()
        return {
          x: lastRect.right - wr.left + 2,
          y: lastRect.top - wr.top,
          height: lastRect.height,
        }
      }
      // No cards — use mouse position
      return { x: clientX - wr.left, y: clientY - wr.top, height: 20 }
    }

    // Allow drops + show drop indicator during dragover
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      setIsDragOver(true)
      // Calculate and show the drop indicator cursor
      const pos = calcDropIndicator(e.clientX, e.clientY)
      setDropIndicator(pos)
    }

    // Reset visual state when drag leaves the editor
    const handleDragLeave = () => {
      setIsDragOver(false)
      setDropIndicator(null)
    }

    // Handle the actual drop
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)
      setDropIndicator(null)  // hide indicator

      const jsonData = e.dataTransfer?.getData('application/json')
      if (!jsonData || !el) return

      try {
        const data = JSON.parse(jsonData)
        const isReorder = data.source === 'editor'
        pushUndo()

        // For reorder: find the original span
        let existingSpan: HTMLSpanElement | null = null
        if (isReorder) {
          const allCards = Array.from(el.querySelectorAll('.hl-card')) as HTMLSpanElement[]
          existingSpan = allCards.find(card =>
            card.textContent === data.text &&
            card.dataset.category === data.category
          ) || null
        }

        // Remove original before calculating position
        if (existingSpan?.parentNode) {
          const prev = existingSpan.previousSibling
          const prev2 = prev?.previousSibling
          if (prev?.nodeName === 'BR') prev.parentNode?.removeChild(prev)
          if (prev2?.nodeName === 'BR') prev2.parentNode?.removeChild(prev2)
          existingSpan.parentNode.removeChild(existingSpan)
        }

        const span = existingSpan || createHighlightSpan(data.text, data.category)
        let inserted = false

        // Strategy 1: caretRangeFromPoint (text areas)
        if (document.caretRangeFromPoint) {
          const range = document.caretRangeFromPoint(e.clientX, e.clientY)
          if (range && el.contains(range.startContainer) && !isInsideCard(range.startContainer)) {
            range.insertNode(span)
            const space = document.createTextNode('\u00A0')
            span.after(space)
            inserted = true
          }
        }

        // Strategy 2: block-based Y positioning
        if (!inserted) {
          const allCards = Array.from(el.querySelectorAll('.hl-card')) as HTMLSpanElement[]
          let targetCard: HTMLSpanElement | null = null
          let insertBefore = true

          for (const card of allCards) {
            if (card === existingSpan) continue
            const rect = card.getBoundingClientRect()
            const midY = rect.top + rect.height / 2
            if (e.clientY <= midY) {
              targetCard = card
              insertBefore = true
              break
            } else {
              targetCard = card
              insertBefore = false
            }
          }

          if (targetCard && targetCard.parentNode) {
            const br = document.createElement('br')
            if (insertBefore) {
              targetCard.parentNode.insertBefore(br, targetCard)
              targetCard.parentNode.insertBefore(span, targetCard)
            } else {
              const nextSib = targetCard.nextSibling
              targetCard.parentNode.insertBefore(br, nextSib)
              targetCard.parentNode.insertBefore(span, nextSib)
            }
          } else {
            if (el.innerHTML.trim()) {
              el.appendChild(document.createElement('br'))
              el.appendChild(document.createElement('br'))
            }
            el.appendChild(span)
          }
        }

        recount()
        saveContent()
      } catch { /* invalid JSON */ }
    }

    el.addEventListener('dragover', handleDragOver)
    el.addEventListener('dragleave', handleDragLeave)
    el.addEventListener('drop', handleDrop)

    return () => {
      el.removeEventListener('dragover', handleDragOver)
      el.removeEventListener('dragleave', handleDragLeave)
      el.removeEventListener('drop', handleDrop)
    }
  }, [createHighlightSpan, recount, saveContent, setIsDragOver, pushUndo])

  // ── Remove a highlight card (unwrap text, keep content) ──
  const removeCard = useCallback((card: HTMLSpanElement) => {
    const parent = card.parentNode
    if (!parent) return
    pushUndo()
    while (card.firstChild) {
      parent.insertBefore(card.firstChild, card)
    }
    parent.removeChild(card)
    parent.normalize()
    setXBtnPos(null)
    recount()
    saveContent()
  }, [recount, saveContent, pushUndo])

  // Keep a ref synced with selectedCard so the keydown handler
  // can read the latest value without re-attaching the listener.
  const selectedCardRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => { selectedCardRef.current = selectedCard }, [selectedCard])

  // ── Keyboard handlers: Cmd+Z undo + Delete/Backspace for selected card ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Z / Ctrl+Z: undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        const stack = undoStackRef.current
        if (stack.length === 0 || !editorRef.current) return
        e.preventDefault()
        e.stopPropagation()
        const prevState = stack.pop()!
        editorRef.current.innerHTML = prevState
        editorRef.current.querySelectorAll('.hl-card').forEach((card) => {
          attachCardEvents(card as HTMLSpanElement)
        })
        setSelectedCard(null)
        setXBtnPos(null)
        recount()
        saveContent()
        return
      }

      // Delete or Backspace while a card is selected: remove it
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCardRef.current) {
        if (selectedCardRef.current.contentEditable === 'true') return
        e.preventDefault()
        removeCard(selectedCardRef.current)
        setSelectedCard(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [attachCardEvents, recount, saveContent, removeCard])

  // On every mouseup/keyup: (1) save the current caret position so
  // insertBlock can use it, (2) show the "Create Card" popup if text is selected.
  const checkSelection = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || !editorRef.current) {
        setPopup(null)
        return
      }

      // Always save the current caret/selection range for cursor-position insertion
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        if (editorRef.current.contains(range.startContainer)) {
          lastRangeRef.current = range.cloneRange()
        }
      }

      // If no text is selected (just a caret), hide the popup
      if (sel.isCollapsed || !sel.toString().trim()) {
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
    pushUndo()

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
  }, [resolvedTheme, popupCategory, recount, saveContent, attachCardEvents, onCreateCard, pushUndo])

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

        {/* ── Drop indicator cursor ──
            A vertical blinking cursor that shows where a dragged block will
            be inserted. Appears during dragover, hidden on drop/dragleave. */}
        {dropIndicator && (
          <div
            className="absolute z-40 pointer-events-none"
            style={{
              left: dropIndicator.x,
              top: dropIndicator.y,
              height: dropIndicator.height,
            }}
          >
            <div
              className="w-0.5 h-full bg-blue-500 rounded-full animate-pulse"
              style={{ boxShadow: '0 0 4px rgba(59, 130, 246, 0.5)' }}
            />
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
          onClick={(e) => {
            // Deselect any selected card when clicking on empty editor space.
            // Card clicks call e.stopPropagation(), so this only fires
            // for clicks on non-card areas.
            if (!(e.target as HTMLElement).closest?.('.hl-card')) {
              const prev = editorRef.current?.querySelector('.hl-selected')
              if (prev) prev.classList.remove('hl-selected')
              setSelectedCard(null)
              // Keep X button only if still hovering a card
              setXBtnPos(null)
            }
          }}
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
