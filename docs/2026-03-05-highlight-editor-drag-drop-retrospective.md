# From `×` Character to Squircle Cursor — Making contentEditable Do Things It Doesn't Want To Do

The Cover Letter Workbench had a working highlight editor: blocks of text wrapped in colored inline `<span>` elements, drag-from-library, a floating delete button. But the interaction model was all wrong. Blocks behaved like text — click on one and you'd get a text cursor, try to drag and you'd select text instead. The delete button was a plain `×` character that appeared on hover and vanished instantly. There was no sense of "this is an object I can manipulate." This session rewrote the editor's interaction layer: squircle close button, click-to-select, drag-to-reorder, double-click-to-edit, undo stack, and a visual drop indicator. Each feature surfaced a different `contentEditable` footgun.

## The Starting Point

The highlight editor sits inside a Next.js 15 App Router page at `/projects/tools/coverletter`. It's a `contentEditable` div where blocks of text are wrapped in `<span class="hl-card">` elements with colored backgrounds (one color per category). The editor already had:

- Drag-and-drop from the library panel (using native DOM event listeners to bypass React's synthetic event system, which `contentEditable` intercepts)
- A floating `×` button positioned with `getBoundingClientRect()` on mouseenter
- `box-decoration-break: clone` for multi-line highlight backgrounds
- `localStorage` persistence of editor content

What it didn't have: any concept of a block as a *thing*. Blocks were just styled text. You couldn't select one, drag it to reorder, or undo your last action. The delete button was a squished `×` character with `border-radius: 6px` that had no depth or affordance.

## Step 1: The Squircle Close Button — CSS Masks and the Shadow Problem

The reference design used a "squircle" — a superellipse shape that's smoother than `border-radius` because it uses cubic Bézier curves instead of circular arcs. The shape is defined as an SVG path in a CSS mask:

```css
.squircle {
  mask-image: url("data:image/svg+xml,%3Csvg width='100' height='100' 
    xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 50 0 C 12 0 0 12 
    0 50 C 0 88 12 100 50 100 C 88 100 100 88 100 50 C 100 12 88 0 
    50 0 Z'/%3E%3C/svg%3E");
  mask-size: contain;
}
```

The SVG path defines control points that create a smooth curve between what would be the straight edges and rounded corners of a regular `border-radius` box. At small sizes (28×28px for this button), the visual difference from `border-radius: 8px` is subtle but perceptible — the shape feels more organic, like iOS app icons.

### The shadow problem

Standard `box-shadow` disappears under a CSS mask — the browser clips the shadow along with everything outside the mask path. The fix is a wrapper `<div>` with `filter: drop-shadow()`:

```tsx
{/* Shadow wrapper: drop-shadow hugs the mask shape */}
<div className="hl-floating-x group/x inline-flex 
  drop-shadow-sm hover:drop-shadow-md"
>
  <button className="squircle relative w-7 h-7 bg-white/90 
    dark:bg-neutral-800/90 flex items-center justify-center
    text-neutral-400 group-hover/x:text-red-500"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" 
      stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  </button>
</div>
```

`filter: drop-shadow()` on the wrapper renders the shadow based on the *visual output* of its children — including the masked shape. So the shadow follows the squircle curve perfectly, unlike `box-shadow` which would try to shadow the pre-mask rectangular box.

The named Tailwind group `group/x` is important: the editor wrapper already uses `group` for other purposes, so `group-hover/x:text-red-500` targets specifically the squircle wrapper's hover state, not any ancestor group.

## Step 2: Making Blocks Draggable — The contentEditable Arms Race

The first step toward "blocks as objects" was making them draggable. The approach:

```typescript
// In attachCardEvents (called for every .hl-card span)
span.draggable = true           // HTML5 drag-and-drop
span.contentEditable = 'false'  // Make it a discrete block, not editable text
span.style.cursor = 'grab'     // Visual affordance

span.addEventListener('dragstart', (e: DragEvent) => {
  const blockData = {
    id: span.dataset.blockId || '',
    category: span.dataset.category || 'Custom',
    text: span.textContent || '',
    source: 'editor',  // flag to distinguish from library drags
  }
  e.dataTransfer?.setData('application/json', JSON.stringify(blockData))
  e.dataTransfer!.effectAllowed = 'move'
  span.style.opacity = '0.4'  // ghost the original during drag
})
```

Setting `contentEditable='false'` on the spans is the key move. Inside a `contentEditable='true'` parent div, these spans become atomic blocks — the caret can't enter them, text selection doesn't flow through them, and drag-and-drop works on the whole span as a unit. Without this, clicking and dragging would select text instead of initiating a drag.

The CSS backup is equally important:

```css
.hl-card {
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
  transition: opacity 0.25s ease, filter 0.2s, box-shadow 0.2s;
}
```

`user-select: none` prevents any residual text selection from competing with the drag gesture. The `transition: opacity` creates a smooth fade-in/fade-out for the ghost effect during drag, instead of snapping between 0.4 and 1.0.

But this creates a problem: blocks are now *never editable*. You can drag them, but you can't fix a typo. The solution is double-click-to-edit:

```typescript
span.addEventListener('dblclick', (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
  span.contentEditable = 'true'   // temporarily switch to editable
  span.draggable = false          // disable drag while editing
  span.style.cursor = 'text'
  span.focus()
  
  // Select all text for easy replacement
  const sel = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(span)
  sel?.removeAllRanges()
  sel?.addRange(range)
})

span.addEventListener('blur', () => {
  span.contentEditable = 'false'  // back to block mode
  span.draggable = true
  span.style.cursor = 'grab'
  if (!span.textContent?.trim()) {
    span.parentNode?.removeChild(span)  // auto-delete if emptied
  }
  saveContent()
})
```

And a CSS override re-enables text selection in edit mode:

```css
.hl-card[contenteditable="true"] {
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
}
```

This creates a clean interaction hierarchy: single-click selects the block, drag moves it, double-click edits it. Each state has a clear visual indicator.

## Step 3: The Selection Model — Blocks as Objects

Being able to drag blocks isn't enough. In design tools like Figma, you click an object to select it — it gets a visual ring, a delete button appears, and keyboard shortcuts apply to it. Highlight blocks needed the same treatment.

The selection model has three components: the click handler on each span, the visual CSS state, and a document-level keyboard handler.

### Click to select

Each span gets a click handler in `attachCardEvents`:

```typescript
span.addEventListener('click', (e: MouseEvent) => {
  e.stopPropagation()  // prevent editor click from immediately deselecting
  if (span.contentEditable === 'true') return  // don't select in edit mode

  // Deselect any previously selected card
  const prevSelected = editorRef.current?.querySelector('.hl-selected')
  if (prevSelected) prevSelected.classList.remove('hl-selected')

  // Select this card
  span.classList.add('hl-selected')
  setSelectedCard(span)
  positionXBtn(span)  // show the squircle X button
})
```

`e.stopPropagation()` is critical. The editor div itself has an `onClick` handler that deselects:

```tsx
<div
  ref={editorRef}
  contentEditable
  onClick={(e) => {
    // Only fires for clicks on empty space (not on cards)
    if (!(e.target as HTMLElement).closest?.('.hl-card')) {
      const prev = editorRef.current?.querySelector('.hl-selected')
      if (prev) prev.classList.remove('hl-selected')
      setSelectedCard(null)
      setXBtnPos(null)
    }
  }}
/>
```

Without `stopPropagation` on the card click, both handlers would fire — the card would be selected and then immediately deselected by the editor.

### The visual state

```css
.hl-card.hl-selected {
  outline: 2px solid rgba(59, 130, 246, 0.6);
  outline-offset: 2px;
  filter: brightness(1.05);
}

:is(.dark .hl-card.hl-selected) {
  outline-color: rgba(96, 165, 250, 0.7);
}
```

`outline` instead of `border` is deliberate — `outline` doesn't affect layout. Adding a `border` would increase the element's box size and shift surrounding text. The `outline-offset: 2px` creates a gap between the highlight background and the ring, making the selection feel like a separate visual layer.

### Keyboard deletion

The squircle X button works for deletion, but selected blocks should also respond to Delete/Backspace. The challenge: the keyboard handler is a `useEffect` that attaches a `document.addEventListener('keydown', ...)`, but it needs to know which card is currently selected. React state (`selectedCard`) isn't available inside a stale closure.

The solution is a synced ref:

```typescript
// Always keep a ref pointing to the current selectedCard
const selectedCardRef = useRef<HTMLSpanElement | null>(null)
useEffect(() => { selectedCardRef.current = selectedCard }, [selectedCard])

// The keydown handler reads from the ref, not from the closure
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCardRef.current) {
      if (selectedCardRef.current.contentEditable === 'true') return
      e.preventDefault()
      removeCard(selectedCardRef.current)
      setSelectedCard(null)
    }
  }
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [removeCard])
```

The `selectedCardRef` is updated by a separate `useEffect` that depends on `selectedCard`. This avoids including `selectedCard` in the keydown effect's dependency array, which would cause the event listener to be removed and re-added on every selection change.

The mouseleave handler on spans also needed updating — it should keep the X button visible when a card is selected, even after the mouse leaves:

```typescript
span.addEventListener('mouseleave', (e: MouseEvent) => {
  const related = e.relatedTarget as HTMLElement | null
  if (related?.closest?.('.hl-floating-x')) return
  setXBtnPos((prev) => {
    if (prev?.card === span && span.classList.contains('hl-selected')) {
      return prev  // keep X visible for selected cards
    }
    return null    // hide X for non-selected cards
  })
})
```

This creates the interaction the user expects: hover shows the X, click selects and *keeps* the X, click elsewhere deselects and hides the X.

## Step 4: Cursor-Position Insertion — Remembering Where You Clicked

When you click a library block to insert it, where should it go? The original behavior was "append at the end of the editor." But that's not how writing works — you're assembling a letter, and the new block should go wherever you just put your cursor.

The implementation tracks the last known caret position with a ref:

```typescript
const lastRangeRef = useRef<Range | null>(null)
```

Every time the user interacts with the editor (mouseup or keyup), the `checkSelection` callback saves the current caret position:

```typescript
const checkSelection = useCallback(() => {
  setTimeout(() => {
    const sel = window.getSelection()
    if (!sel || !editorRef.current) return

    // Save the caret range regardless of whether text is selected
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      if (editorRef.current.contains(range.startContainer)) {
        lastRangeRef.current = range.cloneRange()
      }
    }

    // ... rest of selection detection for "Create Card" popup ...
  }, 10)
}, [])
```

`range.cloneRange()` is important — the Selection's range is live and can be invalidated by subsequent user actions. Cloning creates an independent copy that persists until we use it.

Then `insertBlock` checks this saved position:

```typescript
const insertBlock = useCallback((block: Block) => {
  if (!editorRef.current) return
  pushUndo()
  const span = createHighlightSpan(block.text, block.category)

  const savedRange = lastRangeRef.current
  if (savedRange && editorRef.current.contains(savedRange.startContainer)) {
    // Walk up from the saved position to check we're not inside a card
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
      span.after(document.createTextNode('\u00A0'))
      lastRangeRef.current = null  // consume the position
      recount()
      saveContent()
      return
    }
  }

  // Fallback: append at end
  editorRef.current.appendChild(span)
}, [createHighlightSpan, recount, saveContent, pushUndo])
```

The `insideCard` check prevents blocks from being nested — if the cursor was inside an existing highlight, the insertion falls back to appending at the end rather than creating a span-inside-a-span. After successful cursor-position insertion, `lastRangeRef` is cleared (`null`) so the next insert goes to the end unless the user clicks again.

## Step 5: The Undo Stack — innerHTML Snapshots

With blocks being dragged, deleted, created, and reordered, Cmd+Z is essential. I chose the simplest approach that works: snapshot the editor's entire `innerHTML` before each mutation, push it onto a stack, pop on undo.

```typescript
const undoStackRef = useRef<string[]>([])
const MAX_UNDO = 50

const pushUndo = useCallback(() => {
  if (!editorRef.current) return
  const stack = undoStackRef.current
  stack.push(editorRef.current.innerHTML)
  if (stack.length > MAX_UNDO) stack.shift()  // drop oldest
}, [])
```

Every mutation calls `pushUndo()` before changing the DOM:

```typescript
// In insertBlock:
pushUndo()
const span = createHighlightSpan(block.text, block.category)

// In removeCard:
pushUndo()
while (card.firstChild) { parent.insertBefore(card.firstChild, card) }

// In handleDrop:
pushUndo()
// ... position calculation and insertion ...

// In createCardFromSelection:
pushUndo()
// ... wrap selection in new span ...
```

The Cmd+Z handler restores the innerHTML and re-attaches event listeners:

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      const stack = undoStackRef.current
      if (stack.length === 0 || !editorRef.current) return
      e.preventDefault()
      e.stopPropagation()
      const prevState = stack.pop()!
      editorRef.current.innerHTML = prevState
      // Re-attach events — innerHTML wipes all event listeners
      editorRef.current.querySelectorAll('.hl-card').forEach((card) => {
        attachCardEvents(card as HTMLSpanElement)
      })
      setSelectedCard(null)
      setXBtnPos(null)
      recount()
      saveContent()
    }
  }
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [attachCardEvents, recount, saveContent])
```

The critical line is the `querySelectorAll('.hl-card').forEach(attachCardEvents)` after restoring innerHTML. Setting `innerHTML` destroys *all* DOM nodes and creates new ones. The old event listeners die with the old nodes. So we must walk the new spans and re-attach hover, click, drag, and edit handlers.

### Why not a command pattern?

A proper undo system would store discrete operations ("moved block X from position A to B") with inverse operations ("move block X from B to A"). This is more memory-efficient and supports redo. But innerHTML snapshots are simpler, and for an editor with 200-400 words of content, 50 snapshots at ~2KB each is ~100KB — negligible.

The tradeoff: we can't do redo (there's no "redo stack" to push to when undoing). If that becomes important, a command pattern is the way to go. But for a v1, innerHTML snapshots eliminate an entire class of bugs (operations that don't have clean inverses).

## The Gotcha: Three Iterations of Drop Positioning

This was the most educational debugging journey of the session. The drop handler — the code that decides *where* a dragged block lands — went through three complete rewrites, each fixing the previous version's blind spot.

### Iteration 1: `caretRangeFromPoint` Only

The initial approach assumed `caretRangeFromPoint(x, y)` would always return a valid text position:

```typescript
// Version 1: naive caretRangeFromPoint
const handleDrop = (e: DragEvent) => {
  const range = document.caretRangeFromPoint(e.clientX, e.clientY)
  if (range && editorRef.current.contains(range.startContainer)) {
    range.insertNode(span)
  } else {
    editorRef.current.appendChild(span)  // fallback
  }
}
```

**The problem:** `caretRangeFromPoint` returns a caret position — a point *between characters* where a text cursor could be placed. But our highlight spans have `contentEditable='false'`, which means the browser can't place a caret inside or adjacent to them. When the user drops a block near an existing highlight, `caretRangeFromPoint` either returns `null` or a position at the editor's edge, not the expected insertion point.

This worked for the original editor (before we made blocks non-editable) because all text was editable and caret positions existed everywhere.

### Iteration 2: Block-Based Y Comparison

The fix: compare the drop's Y coordinate against each block's vertical midpoint:

```typescript
// Version 2: block-based positioning
const allCards = Array.from(el.querySelectorAll('.hl-card'))
let targetCard = null
let insertBefore = true

for (const card of allCards) {
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

if (targetCard) {
  if (insertBefore) {
    targetCard.parentNode.insertBefore(span, targetCard)
  } else {
    targetCard.parentNode.insertBefore(span, targetCard.nextSibling)
  }
}
```

**The problem:** this only works for reordering blocks relative to each other. If the user types free text in the editor and wants to drop a block into the middle of a sentence, block-based positioning can't find that position — it only looks at `.hl-card` elements.

### Iteration 3: The Hybrid Approach

The solution: try `caretRangeFromPoint` first. If it returns a position inside regular text (not inside a `contentEditable='false'` block), use it. If it lands inside a block, fall back to Y-based positioning:

```typescript
// Version 3: hybrid — check if caret is inside a card
const isInsideCard = (node: Node | null) => {
  while (node && node !== el) {
    if ((node as HTMLElement).classList?.contains('hl-card'))
      return node as HTMLSpanElement
    node = node.parentNode
  }
  return null
}

let insertionRange: Range | null = null

if (document.caretRangeFromPoint) {
  const range = document.caretRangeFromPoint(e.clientX, e.clientY)
  if (range && el.contains(range.startContainer)
      && !isInsideCard(range.startContainer)) {
    insertionRange = range  // Text position — use it!
  }
}

if (!insertionRange) {
  // Fall back to block-based positioning
  // ... Y comparison code from Iteration 2 ...
}
```

The `isInsideCard` helper walks up the DOM tree from the caret's start container, checking for the `.hl-card` class. If found, the caret is inside a non-editable block and we should ignore it.

This hybrid works in all cases. But then the real bug appeared.

### The Direction-Dependent Position Bug

**Symptom:** Dragging a block from an *earlier* position to a *later* position inserted it in the wrong place. But dragging from a *later* position to an *earlier* one worked perfectly.

**The debugging process:**

The code at this point removed the block before calculating the drop position:

```typescript
// The buggy order:
// 1. Remove the original block
existingSpan.parentNode.removeChild(existingSpan)
// 2. Calculate where to insert (using coordinates)
const range = document.caretRangeFromPoint(e.clientX, e.clientY)
// 3. Insert at calculated position
range.insertNode(span)
```

**Root cause:** `e.clientX` and `e.clientY` are the mouse coordinates at the moment of the drop. These coordinates were hovering over a specific piece of text *before* the removal. Removing content from *above* the drop target shifts all subsequent content *upward*. Now `caretRangeFromPoint(e.clientX, e.clientY)` maps to a different text position because the text that was under those coordinates has moved up.

When dragging from later to earlier, removing content *below* the drop target doesn't shift the content above it — so the coordinates remain valid.

**The visualization:**

```
BEFORE REMOVAL (block at position A, dropping at position B):

  [Block A - the one being dragged] ← remove this
  Some text here
  More text here
  Position B (where mouse is)       ← e.clientY points here

AFTER REMOVAL (content shifts up):

  Some text here                    ← shifted up
  More text here                    ← shifted up
  Position B (but different text!)  ← e.clientY still points here
                                       but different content is now at
                                       this screen position
```

**The fix:** Calculate the insertion point *while the DOM is still stable*, then remove, then insert:

```typescript
// 1. Calculate insertion point WHILE DOM IS STABLE
let insertionRange: Range | null = null
if (document.caretRangeFromPoint) {
  const range = document.caretRangeFromPoint(e.clientX, e.clientY)
  if (range && el.contains(range.startContainer)
      && !isInsideCard(range.startContainer)) {
    insertionRange = range
  }
}

// 2. THEN remove the original block
if (existingSpan?.parentNode) {
  existingSpan.parentNode.removeChild(existingSpan)
}

// 3. THEN insert at the saved Range
if (insertionRange) {
  insertionRange.insertNode(span)
}
```

**Why this works:** DOM Range objects are *live* — they track mutations to the DOM. When a node is removed, the browser adjusts any Range objects whose boundary points are affected. The Range we captured in step 1 still points to the correct text position after the removal in step 2, even though the visual coordinates have shifted. This is specified in the [DOM Living Standard](https://dom.spec.whatwg.org/#concept-range): boundary points are adjusted whenever a mutation occurs.

This is the kind of bug that's invisible in simple tests (one or two blocks) and only manifests with enough content to create a measurable layout shift.

## Step 6: The Drop Indicator — From Horizontal to Vertical

With blocks being draggable, the user needs to know *where* a block will land before they release the mouse. The first implementation showed a horizontal blue line:

```tsx
{dropIndicatorY !== null && (
  <div className="absolute left-2 right-2 z-40 pointer-events-none"
    style={{ top: dropIndicatorY }}>
    <div className="h-0.5 bg-blue-500 rounded-full" />
  </div>
)}
```

This was immediately rejected. A horizontal line shows which *line* you're inserting at, but not which *column*. For inline text (where blocks can be inserted mid-sentence), column position matters. The fix: a vertical blinking cursor, like a text caret:

```tsx
{dropIndicator && (
  <div className="absolute z-40 pointer-events-none"
    style={{
      left: dropIndicator.x,
      top: dropIndicator.y,
      height: dropIndicator.height,
    }}>
    <div className="w-0.5 h-full bg-blue-500 rounded-full animate-pulse"
      style={{ boxShadow: '0 0 4px rgba(59, 130, 246, 0.5)' }} />
  </div>
)}
```

The indicator uses `animate-pulse` for a gentle blink and a blue glow shadow for visibility. The position is calculated by a `calcDropIndicator` helper that runs in the `dragover` handler:

```typescript
const calcDropIndicator = (clientX: number, clientY: number) => {
  const wr = wrapperRef.current?.getBoundingClientRect()
  if (!wr) return null

  // Strategy 1: exact caret position in text
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(clientX, clientY)
    if (range && el.contains(range.startContainer)
        && !isInsideCard(range.startContainer)) {
      const rects = range.getClientRects()
      if (rects.length > 0) {
        const r = rects[0]
        return { x: r.left - wr.left, y: r.top - wr.top,
                 height: r.height || 20 }
      }
    }
  }

  // Strategy 2: block edge positions
  const allCards = Array.from(el.querySelectorAll('.hl-card'))
  for (const card of allCards) {
    const rect = card.getBoundingClientRect()
    if (clientY <= rect.top + rect.height / 2) {
      return { x: rect.left - wr.left - 2, y: rect.top - wr.top,
               height: rect.height }
    }
  }
  // ... fallbacks for after-last-card and empty editor ...
}
```

### The layout stability problem

The first version of the indicator was inaccurate because the editor height changed during drag:

1. Dragging a block from the library → editor content stays the same (indicator is accurate)
2. Reordering → the block is removed first, content shifts, indicator coordinates are stale

Two CSS changes fixed this:

```tsx
// BEFORE: editor grows/shrinks with content
className="min-h-[200px] border border-glass-border"

// AFTER: fixed height with scroll, consistent border width
className="h-[400px] overflow-y-auto border-2 border-transparent
           border-glass-border"
```

Fixed height (`h-[400px]` with `overflow-y-auto`) means content removal doesn't change the editor's dimensions. The border is always `2px` (transparent by default, colored during drag), eliminating the 1px shift from switching between `border` (1px) and `border-2` (2px) during drag.

## What I'd Do Differently

**Think about `contentEditable='false'` implications upfront.** The three iterations of the drop handler could have been one if I'd considered what happens to `caretRangeFromPoint` when spans aren't editable. The fix (hybrid approach) is simple; the debugging wasn't.

**Fix the container first.** The drop indicator position was wrong because the editor height changed during drag. Locking down the layout (fixed height, consistent border) should have been the *first* step, before implementing the indicator. Debugging a positioning system while the coordinate space keeps shifting is a waste of time.

**The general lesson:** When using coordinate-based APIs (`getBoundingClientRect`, `caretRangeFromPoint`, `elementFromPoint`) to determine where to insert content, always capture the position *before* mutating the DOM. Coordinates describe screen positions, and DOM mutations move things on screen. DOM Range objects track mutations; coordinates don't.

**innerHTML-based undo is good enough.** I initially considered a command pattern (store each operation with an inverse), which would support redo and be more memory-efficient. But for an editor with 200-400 words and 50 undo levels, innerHTML snapshots are trivially small (~100KB total) and eliminate an entire class of bugs (operations whose inverses are hard to define, like text editing inside a span). The simple solution was the right one.

**`contentEditable` is a negotiation, not a tool.** Every feature — drag, select, edit, undo — required working *around* the browser's built-in contentEditable behavior rather than with it. React's synthetic event system doesn't fire inside contentEditable. Text selection competes with drag. The browser wants to handle drops its own way. Each feature is a boundary negotiation between your code and the browser's assumptions about what a "content editable div" should do.

---

`contentEditable` is not a rich text editor — it's a footgun that happens to display text. Every feature you add is a negotiation with the browser about who controls the DOM.
