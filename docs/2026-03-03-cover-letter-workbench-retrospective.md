# From Concept Sketches to Cover Letter Workbench — Building a Writing Tool That Actually Aligns With How You Should Use AI

I had three concept designs sitting in `/tmp/` — a cover letter builder, floating drag-and-drop cards, and a "highlight cards" text editor. They were vibe-coded React artifacts from Claude conversations, each exploring a different interaction pattern for assembling cover letters from reusable text blocks. The challenge: take these disconnected concepts and ship one cohesive tool that fits into an existing Next.js portfolio site with its own design system, auth layer, and deployment pipeline.

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
  ${isInEditor ? 'bg-glass backdrop-blur-sm' : 'hover:bg-glass-hover'}
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
    const savedEditor = localStorage.getItem('cl-editor')
    if (savedLibrary) setLibraryBlocks(JSON.parse(savedLibrary))
    if (savedEditor) setEditorBlocks(JSON.parse(savedEditor))
  } catch { /* ignore parse errors */ }
}, [])

// Save on change
useEffect(() => {
  localStorage.setItem('cl-library', JSON.stringify(libraryBlocks))
}, [libraryBlocks])
```

This means your custom blocks and assembled letters survive page refreshes. No database needed — this is a personal tool, localStorage is the right call for a single-user scenario.

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

This is easy to miss: if you have scratch files in your repo with `.tsx` extensions, they *will* be compiled unless explicitly excluded. Next.js type-checks everything matched by `**/*.tsx` in the `include` glob.

## What's Next

The tool works, but there are deliberate gaps that map to the conversation's honest self-critique:

1. **The blocks are pre-written by AI, not the user.** The most important improvement is starting empty with prompts like "Describe your most relevant client-facing experience in 2-3 sentences, the way you'd say it out loud." The pre-filled blocks are training wheels.

2. **No company-specific hook section.** The conversation emphasizes that every cover letter needs at least one specific reference to that company. The tool should have a freeform text area between blocks for writing connective tissue and the company-specific paragraph.

3. **No block reordering in the editor.** You can drag blocks *into* the editor, but you can't reorder them once they're there. Adding sortable drag within the editor would close this gap.

4. **No review/scoring step.** The conversation produced a cover letter rubric document. Wiring that into a "Review" button that scores the assembled letter against the criteria would close the loop completely.

---

The best tools don't replace your thinking — they organize it. This workbench is a text selection engine, not a text generation engine, and that's the whole point.
