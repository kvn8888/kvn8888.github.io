# From Concept Sketches to Cover Letter Workbench — Building a Writing Tool That Actually Aligns With How You Should Use AI

I had three concept designs sitting in `/tmp/` — a cover letter builder, floating drag-and-drop cards, and a "highlight cards" text editor. They were vibe-coded React artifacts from Claude conversations, each exploring a different interaction pattern for assembling cover letters from reusable text blocks. The challenge: take these disconnected concepts and ship one cohesive tool that fits into an existing Next.js portfolio site with its own design system, auth layer, and deployment pipeline.

What followed was a multi-phase build: first a monolithic 960-line page, then an editor rewrite from card-based blocks to contentEditable inline highlights, and finally a clean component split. Each phase taught something different about the gap between "concept" and "production."

## The Starting Point

The portfolio site ([kevinc.dev](https://kevinc.dev)) is a Next.js 15 App Router project with a "tools" section behind Google OAuth. It already has a job tracker, speech lab, and resume uploader. Every page follows the same visual language: glassmorphism cards, blur-reveal entry animations, theme-aware CSS variables, Material Symbols icons. No hardcoded colors — everything goes through `--foreground`, `--glass`, `--glass-border` variables that swap between light and dark mode.

The three concept files were plain React components with inline styles — no Tailwind, no design system integration, no dark mode, no auth. They were prototypes, not production code.

## Step 1: Distilling the Idea From Three Concepts

The most important step was reading the *conversations* that produced the concepts, not just the code. The conversation revealed a deliberate workflow:

1. You keep a library of reusable "building blocks" — short paragraphs written in your own voice
2. You paste a job posting and ask AI to pattern-match which blocks fit best
3. You assemble and lightly adapt those blocks yourself
4. The AI **should not** write the final text

This is philosophically different from "paste a job posting, get a cover letter." The tool's job is selection and assembly, not generation. That distinction shaped every design decision.

The three concepts each contributed something:

- **Cover letter workbench** (`cover-letter-workbench.tsx`): The dual-panel layout, category system, AI matching via API call, drag-to-editor flow
- **Floating cards** (`floating-cards.tsx`): The tactile drag-and-drop feel, snap-into-place feedback
- **Highlight cards** (`highlight-cards.tsx`): Inline editing, `contentEditable` interactions, text-as-container thinking

I merged the workbench's structure with the floating cards' drag model and the highlight cards' inline editing into one page.

## Step 2: The API Route — Server-Side AI Matching

The site already had a pattern for AI proxies: the job tracker's `/api/jobs/parse` route calls Gemini with structured output. I followed the same approach:

```typescript
// /api/coverletter/match/route.ts
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            matches: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'STRING' },
                  reason: { type: 'STRING' },
                },
                required: ['id', 'reason'],
              },
            },
          },
          required: ['matches'],
        },
      },
    }),
  }
)
```

Key decision: **Gemini's `responseSchema` for structured JSON output**. The original concept called Anthropic's API directly from the browser, which would expose the API key. By routing through a server-side Next.js API route with `auth()` session checks, I get:

- API keys stay on the server (env vars, never exposed to client)
- Auth is enforced — only logged-in users can call `/api/coverletter/match`
- Gemini's structured output schema guarantees the response shape, no fragile regex parsing

The prompt asks for `{ id, reason }` pairs — the reason is displayed as a tooltip on matched blocks so you understand *why* the AI thinks that block fits.

## Step 3: Adapting the UI to the Design System

The original concepts used inline styles with hardcoded colors (`background: '#f8f7f4'`, `color: '#1f2937'`). The site's design system uses CSS variables and Tailwind utility classes. Every surface needed translation:

```tsx
// ❌ Original concept (hardcoded, no dark mode)
style={{
  padding: '10px 14px',
  borderRadius: '8px',
  background: cat.bg,
  border: `2px solid ${isSelected ? cat.color : 'transparent'}`,
}}

// ✅ Adapted (design system, theme-aware)
className={`
group relative p-3 rounded-xl border transition-all
  ${isSelected
    ? 'border-blue-400 dark:border-blue-500 shadow-sm'
    : 'border-glass-border hover:border-glass-border-hover'
  }
`}
```

The category colors (dots and labels) still use direct color values because they're *semantically* tied to categories, not to the theme. But every surface, border, and text element uses the theme variable system.

The blur-reveal animation pattern was applied to the page header with the Safari fix:

```tsx
const [mounted, setMounted] = useState(false)
useEffect(() => { setMounted(true) }, [])

<h1 className={`text-3xl font-medium text-foreground ${mounted ? 'blur-reveal' : 'opacity-0'}`}>
  Cover Letter Workbench
</h1>
```

Safari doesn't replay CSS animations on soft navigation. The `mounted` state forces the class to be added after hydration, which triggers the animation. Server components don't need this, but this page is `'use client'` because of all the interactive state.

## Step 4: localStorage Persistence

One thing the concept didn't handle: what happens when you reload? All your carefully assembled blocks vanish. I added localStorage persistence with a minimal approach:

```typescript
// Load on mount
useEffect(() => {
  try {
    const savedLibrary = localStorage.getItem('cl-library')
    if (savedLibrary) setLibraryBlocks(JSON.parse(savedLibrary))
  } catch { /*ignore parse errors*/ }
}, [])

// Save on change
useEffect(() => {
  localStorage.setItem('cl-library', JSON.stringify(libraryBlocks))
}, [libraryBlocks])
```

This means your custom blocks and assembled letters survive page refreshes. No database needed — this is a personal tool, localStorage is the right call for a single-user scenario.

## Step 5: The Editor Rewrite — From Cards to Inline Highlights

The first version of the editor rendered blocks as rectangular bordered cards stacked vertically. It worked, but it felt like assembling a list, not composing a letter. The "highlight cards" concept had a much better idea: blocks should be inline highlighted text — like someone took a highlighter pen to a document. Each block's color tint wraps tightly around the text, flowing across line breaks with no gaps.

This required `contentEditable`, which is famously described as "the worst API in web development." Three specific problems surfaced.

### Problem 1: contentEditable intercepts React's synthetic drag events

The first approach used React's `onDragOver` and `onDrop` handlers on the editor div. They never fired. The root cause: `contentEditable` elements have their own native drag-and-drop behavior for text selection. The browser intercepts the drag events before React's synthetic event system gets them.

The fix: bypass React entirely for drag handlers and use native DOM event listeners:

```typescript
useEffect(() => {
  const el = editorRef.current
  if (!el) return

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const jsonData = e.dataTransfer?.getData('application/json')
    if (jsonData) {
      const block: Block = JSON.parse(jsonData)
      const span = createHighlightSpan(block.text, block.category)
      // Insert at drop position using caret detection
      const range = document.caretRangeFromPoint(e.clientX, e.clientY)
      if (range && el.contains(range.startContainer)) {
        range.insertNode(span)
      } else {
        el.appendChild(span)
      }
    }
  }

  el.addEventListener('drop', handleDrop)
  return () => el.removeEventListener('drop', handleDrop)
}, [createHighlightSpan])
```

Key insight: `document.caretRangeFromPoint(x, y)` converts mouse coordinates to a DOM Range — the exact text position where the user dropped. This lets blocks land precisely where the cursor is, not just appended at the end. Inside an existing card? We detect that by walking up the DOM tree and append at the end instead.

### Problem 2: Multi-line highlights with no gaps

Regular `<span>` elements with `background` and `padding` create visible gaps between wrapped lines. The text wraps, but each line fragment gets its own box, and the padding between adjacent lines creates a striped look.

The CSS property that fixes this is `box-decoration-break: clone`:

```css
span.hl-card {
  background: rgba(59, 130, 246, 0.15);
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  padding: 3px 8px;
  border-radius: 6px;
  line-height: 2.2;
  display: inline;
}
```

`box-decoration-break: clone` tells the browser to treat each line fragment as a complete box — applying the full border-radius, padding, and background to every fragment independently. Combined with a generous `line-height: 2.2`, the highlight backgrounds from adjacent lines overlap slightly, eliminating visible gaps. The result looks like someone used a physical highlighter pen.

### Problem 3: The floating X button

With inline highlights, there's nowhere to put a delete button. The highlight wraps tightly around text — sticking a button inside would break the text flow. The solution: a floating "squircle" X button (rounded square, `border-radius: 6px`, not a circle) that appears at the top-right of whichever card the user hovers over.

This is a hybrid of native DOM events and React rendering:

```typescript
// Native mouseenter on each highlight span calculates position
span.addEventListener('mouseenter', () => {
  const wrapperRect = wrapperRef.current?.getBoundingClientRect()
  const spanRect = span.getBoundingClientRect()
  if (!wrapperRect) return
  setXBtnPos({
    x: spanRect.right - wrapperRect.left - 4,
    y: spanRect.top - wrapperRect.top - 4,
    card: span,
  })
})

// React renders the button at the calculated position
{xBtnPos && (
  <button
    className="absolute z-50"
    style={{ left: xBtnPos.x, top: xBtnPos.y, borderRadius: '6px' }}
    onClick={() => removeCard(xBtnPos.card)}
  >×</button>
)}
```

The button turns red on hover to indicate it's destructive. On click, `removeCard` unwraps the span — moving its text children back into the parent node and removing the span element. The text stays; only the highlight disappears.

## Step 5: The Editor Rewrite — From Cards to Inline Highlights

The first version of the editor rendered blocks as rectangular bordered cards stacked vertically. It worked, but it felt like assembling a list, not composing a letter. The "highlight cards" concept had a much better idea: blocks should be inline highlighted text — like someone took a highlighter pen to a document. Each block's color tint wraps tightly around the text, flowing across line breaks with no gaps.

This required `contentEditable`, which is famously described as "the worst API in web development." Three specific problems surfaced.

### Problem 1: contentEditable intercepts React's synthetic drag events

The first approach used React's `onDragOver` and `onDrop` handlers on the editor div. They never fired. The root cause: `contentEditable` elements have their own native drag-and-drop behavior for text selection. The browser intercepts the drag events before React's synthetic event system gets them.

The fix: bypass React entirely for drag handlers and use native DOM event listeners:

```typescript
useEffect(() => {
  const el = editorRef.current
  if (!el) return

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const jsonData = e.dataTransfer?.getData('application/json')
    if (jsonData) {
      const block: Block = JSON.parse(jsonData)
      const span = createHighlightSpan(block.text, block.category)
      // Insert at drop position using caret detection
      const range = document.caretRangeFromPoint(e.clientX, e.clientY)
      if (range && el.contains(range.startContainer)) {
        range.insertNode(span)
      } else {
        el.appendChild(span)
      }
    }
  }

  el.addEventListener('drop', handleDrop)
  return () => el.removeEventListener('drop', handleDrop)
}, [createHighlightSpan])
```

Key insight: `document.caretRangeFromPoint(x, y)` converts mouse coordinates to a DOM Range — the exact text position where the user dropped. This lets blocks land precisely where the cursor is, not just appended at the end. Inside an existing card? We detect that by walking up the DOM tree and append at the end instead.

### Problem 2: Multi-line highlights with no gaps

Regular `<span>` elements with `background` and `padding` create visible gaps between wrapped lines. The text wraps, but each line fragment gets its own box, and the padding between adjacent lines creates a striped look.

The CSS property that fixes this is `box-decoration-break: clone`:

```css
span.hl-card {
  background: rgba(59, 130, 246, 0.15);
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  padding: 3px 8px;
  border-radius: 6px;
  line-height: 2.2;
  display: inline;
}
```

`box-decoration-break: clone` tells the browser to treat each line fragment as a complete box — applying the full border-radius, padding, and background to every fragment independently. Combined with a generous `line-height: 2.2`, the highlight backgrounds from adjacent lines overlap slightly, eliminating visible gaps. The result looks like someone used a physical highlighter pen.

### Problem 3: The floating X button

With inline highlights, there's nowhere to put a delete button. The highlight wraps tightly around text — sticking a button inside would break the text flow. The solution: a floating "squircle" X button (rounded square, `border-radius: 6px`, not a circle) that appears at the top-right of whichever card the user hovers over.

This is a hybrid of native DOM events and React rendering:

```typescript
// Native mouseenter on each highlight span calculates position
span.addEventListener('mouseenter', () => {
  const wrapperRect = wrapperRef.current?.getBoundingClientRect()
  const spanRect = span.getBoundingClientRect()
  if (!wrapperRect) return
  setXBtnPos({
    x: spanRect.right - wrapperRect.left - 4,
    y: spanRect.top - wrapperRect.top - 4,
    card: span,
  })
})

// React renders the button at the calculated position
{xBtnPos && (
  <button
    className="absolute z-50"
    style={{ left: xBtnPos.x, top: xBtnPos.y, borderRadius: '6px' }}
    onClick={() => removeCard(xBtnPos.card)}
  >×</button>
)}
```

The button turns red on hover to indicate it's destructive. On click, `removeCard` unwraps the span — moving its text children back into the parent node and removing the span element. The text stays; only the highlight disappears.

## Step 6: The Component Split — 960 Lines to Four Files

After the editor rewrite, the page had grown to 960 lines in a single `page.tsx`. Three distinct responsibilities were tangled together: type definitions and seed data, the library card component, the editor component, and the page orchestration. I split it into four files:

| File | Lines | Responsibility |
|---|---|---|
| `types.ts` | ~120 | `Block`, `MatchResult`, `CATEGORIES`, `INITIAL_BLOCKS`, `HIGHLIGHT_PALETTE` |
| `BlockCard.tsx` | ~165 | Library card — drag, click-to-insert, edit, delete |
| `HighlightEditor.tsx` | ~310 | `contentEditable` editor with highlights, X button, Create Card |
| `page.tsx` | ~230 | Layout, AI matching, library state, filter pills |

The interesting challenge was **`HighlightEditor`'s public API**. The parent needs to insert blocks when the user clicks a library card (not just on drag-and-drop). React's standard approach is controlled state, but `contentEditable` manages its own DOM — you can't "set state" to add a highlight.

The solution is `useImperativeHandle` with `forwardRef`:

```typescript
// HighlightEditor.tsx — expose insertBlock to the parent
export interface HighlightEditorHandle {
  insertBlock: (block: Block) => void
}

const HighlightEditor = forwardRef<HighlightEditorHandle, HighlightEditorProps>(
  function HighlightEditor(props, ref) {
    const insertBlock = useCallback((block: Block) => {
      const span = createHighlightSpan(block.text, block.category)
      editorRef.current?.appendChild(span)
    }, [createHighlightSpan])

    useImperativeHandle(ref, () => ({ insertBlock }), [insertBlock])
    // ...
  }
)

// page.tsx — call it when a library card is clicked
const editorRef = useRef<HighlightEditorHandle>(null)
// ...
<BlockCard onInsert={(b) => editorRef.current?.insertBlock(b)} />
```

`useImperativeHandle` is React's escape hatch for exposing imperative methods on a ref. It's the right tool here because we're bridging React's declarative world with `contentEditable`'s imperative DOM mutation.

## The Tiptap Question

Before the split, I evaluated whether to replace raw `contentEditable` with [Tiptap](https://tiptap.dev/) — a headless rich-text editor built on ProseMirror. Here's the analysis that led to staying with raw `contentEditable`:

| Feature | Tiptap provides | We need it? |
|---|---|---|
| Highlight extension | Built-in `<mark>` with custom colors | Our "highlights" are whole paragraphs, not inline marks |
| Structured document model | JSON schema, not innerHTML | Nice-to-have, not critical for single-user tool |
| Undo/redo | Built-in via ProseMirror history | Could add a simple undo stack ourselves |
| Formatting (bold/italic) | Yes | **No** |
| Collaborative editing | Yes, via Yjs | **No** |
| Bundle size | ~50-60KB gzipped (core + react + starter-kit) | We're at **0KB** |

The decisive factor: we're building a **block assembler**, not a rich text editor. There's no formatting toolbar, no collaboration, no nested lists. Tiptap would add 50KB+ of dependency weight for features we'd never use, plus ProseMirror's learning curve for writing custom node extensions to model our "block" concept. The raw approach is more work to build, but zero dependency weight and we own every behavior.

The HN gotcha sealed it: *"One of the big gotchas I've had with TipTap is that it's extremely sluggish once you get to more than 300 words."* Cover letters are 200-400 words — right in the danger zone.

## The Gotcha: TypeScript vs. Concept Files

The build broke — but not because of the new code. The `tmp/` directory containing the raw concept JSX files (with no type annotations) was being picked up by the TypeScript compiler:

```
./tmp/cover-letter-workbench.tsx:76:18
Type error: Binding element 'block' implicitly has an 'any' type.
```

The fix was a one-line addition to `tsconfig.json`:

```json
"exclude": [
  "node_modules",
  "tmp"
]
```

If you have scratch files in your repo with `.tsx` extensions, they *will* be compiled unless explicitly excluded. Next.js type-checks everything matched by `**/*.tsx` in the `include` glob. This is easy to miss if you're used to keeping concept or reference files alongside your source code.

## What's Next

The tool works end-to-end: paste a job posting, match blocks, drag or click them into the editor, edit inline, copy the result. But there are deliberate gaps:

1. **The blocks are pre-written by AI, not the user.** The most important improvement is starting empty with prompts like "Describe your most relevant client-facing experience in 2-3 sentences, the way you'd say it out loud." The pre-filled blocks are training wheels.

2. **No company-specific hook section.** Every cover letter needs at least one specific reference to that company. The tool should have a freeform text area for the company-specific paragraph — the one part that can't be a reusable block.

3. **No block reordering in the editor.** You can drag blocks *into* the editor, but reordering within the editor relies on cut-and-paste. Drag-to-reorder inside `contentEditable` is technically possible but the interaction model gets tricky when highlights are inline text, not discrete elements.

4. **No review/scoring step.** The original conversation produced a cover letter rubric. Wiring that into a "Review" button that scores the assembled letter against the criteria would close the loop — write, match, assemble, score, iterate.

5. **Create Card from selection.** The editor supports selecting text and wrapping it in a new highlight card. This could be extended to also save the new card back into the library, creating a virtuous loop: you draft, then harvest the best sentences into reusable blocks.

## What I'd Do Differently

The monolithic-first approach (one 960-line file, then split) was actually the right call for this project. Trying to split into four files from the start would have created premature abstractions — I didn't know the component boundaries until I'd built the editor twice. But I let the monolith live too long. The rewrite from cards to highlights should have been the signal to split immediately, not after another round of feature additions.

The `contentEditable` bet was correct. The three specific problems (drag interception, line gaps, floating button) each had clean solutions. If we needed undo/redo or formatting, Tiptap would be the right call, but for a block assembler, zero dependencies and full control of the DOM is the better tradeoff.

---

The best tools don't replace your thinking — they organize it. This workbench is a text selection engine, not a text generation engine, and that's the whole point.
