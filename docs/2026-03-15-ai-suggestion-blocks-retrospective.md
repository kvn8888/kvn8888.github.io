# From Block Matcher to Structural Coach: Adding AI Suggestion Blocks to the Cover Letter Workbench

The cover letter workbench could already match your existing library blocks to a job posting. What it couldn't do was tell you what was *missing*. This session added that: a second layer of Gemini-powered intelligence that looks at your current draft, identifies which structural paragraphs you haven't written yet, and generates placeholder blocks for them — all without touching the database.

## The Starting Point

The workbench has a block library — a Turso-backed database of reusable sentences and paragraphs organized by category (Intro, Work Experience, Full-Stack, Closer, etc.). The "Match Blocks" button sends the library plus a pasted job posting to a Gemini endpoint (`/api/coverletter/match`) and gets back a list of `{ id, reason }` pairs. Matched blocks float to the top of the library panel and get a colored "MATCH" badge.

That's useful, but it only works on what you *have*. If your library is missing a closing paragraph entirely, the matcher has nothing to surface. The feature request was: look at what's in the editor, check it against a known 5-paragraph structure, and for anything missing, generate a fresh draft block on the fly. These "AI suggestion" blocks would look visually different, show up at the very top of the library, and disappear when you re-run the match — they're ephemeral, never persisted to the database.

The 5-paragraph structure to check against:
- **Hook + Why This Company** → category `Intro`
- **Most Relevant Experience** → category `Work Experience`
- **Projects / Breadth** → category `Full-Stack`
- **Mission Alignment + Fit Summary** → category `Soft Skills`
- **Close** → category `Closer`

## Step 1: Extending the Types

Before touching any API or UI code, I needed a new type. `Block` is the existing library entry shape — it has a database-backed `id`, a `category`, `text`, and an array of `tags`. AI suggestion blocks share some of this structure but have meaningfully different semantics: they have a `paragraphLabel` (e.g. "Hook + Why This Company") instead of a real category, no tags, and a temporary non-database id.

I could have reused `Block` with optional fields or a union type, but the cleaner move was a dedicated `AISuggestionBlock` interface in `types.ts`:

```typescript
export interface AISuggestionBlock {
  id: string             // temporary, e.g. "ai-suggestion-0"
  paragraphLabel: string // "Hook + Why This Company"
  category: string       // "Intro" — used for category filter matching
  text: string           // Gemini-generated draft
  reason: string         // why this paragraph is missing
}
```

The `category` field is what lets AI suggestions play nicely with the existing filter system — if you've filtered to "Intro", you'll see Intro suggestions alongside Intro library blocks. The `paragraphLabel` is what actually renders as the card header.

## Step 2: One Gemini Call, Two Jobs

The original `/api/coverletter/match` endpoint made one Gemini call and returned only `{ matches }`. The simplest extension was to add a second job to the same prompt rather than creating a separate endpoint or making two sequential calls. Two reasons:

1. **Latency** — one round-trip to Gemini instead of two.
2. **Context** — Gemini can see the full block library while generating suggestions, so the drafts it writes can reflect the candidate's actual experience as shown in the existing blocks.

The request body gained one optional field: `editorContent` — the plain text of the current cover letter (read via `editorRef.current?.getPlainText()`). The prompt now does two named tasks:

```
**TASK 1 — MATCH**: From the available blocks below, identify the 3-4 most relevant...

**TASK 2 — SUGGEST**: Analyze the current cover letter draft against this 5-paragraph framework.
For each paragraph that is MISSING, generate a concise draft block (2-4 sentences)...
```

Gemini's structured JSON response schema grew a `suggestions` array alongside `matches`:

```typescript
suggestions: [{
  paragraphLabel: string,
  category: string,
  text: string,
  reason: string
}]
```

On the API side, I added a `VALID_CATEGORIES` guard before returning suggestions — since Gemini could theoretically hallucinate a category name, only the five known paragraph categories are allowed through:

```typescript
const VALID_CATEGORIES = new Set(['Intro', 'Work Experience', 'Full-Stack', 'Soft Skills', 'Closer'])
const suggestions = Array.isArray(parsed?.suggestions)
  ? parsed.suggestions.filter((s) =>
      typeof s?.paragraphLabel === 'string' && VALID_CATEGORIES.has(s.category) ...
    )
  : []
```

## Step 3: Wiring Up the Client State

The `matchBlocks` function in `page.tsx` already built a `matchMap` lookup from API results. I extended it to also handle suggestions:

```typescript
setAiSuggestions(
  (data.suggestions ?? []).map((s: AISuggestionBlock, i: number) => ({
    ...s,
    id: `ai-suggestion-${i}`,
  }))
)
```

The `id` stamping happens client-side because the API returns suggestion objects without an id — they don't come from a database, so there's no natural key. `ai-suggestion-0`, `ai-suggestion-1` etc. are stable within a single match run, which is all React's `key` prop needs.

In the derived data section, `filteredSuggestions` mirrors how `sortedLibrary` handles the category filter:

```typescript
const filteredSuggestions = aiSuggestions.filter(
  (s) => filterCategory === 'All' || s.category === filterCategory
)
```

The block list render puts suggestions first, then the existing library:

```tsx
{filteredSuggestions.map((s) => (
  <BlockCard
    key={s.id}
    block={{ id: s.id, category: s.paragraphLabel, text: s.text, tags: [] }}
    isAISuggestion={true}
    matchReason={s.reason}
    onSelect={() => {}}
    onInsert={(b) => editorRef.current?.insertBlock(b)}
    // no onManage, no onRemove — ephemeral
  />
))}
```

The trick here: I pass `paragraphLabel` as `block.category`. `BlockCard` uses `block.category` as the displayed header label. For AI suggestions, I want "Hook + Why This Company" to appear there — not the category string "Intro". The `isAISuggestion` flag then switches the header rendering to use purple styling instead of the normal category color system.

## Step 4: The BlockCard Purple Variant

`BlockCard` already had two rendering modes (library and editor). Adding a third — AI suggestion — meant branching the header row:

```tsx
{isAISuggestion ? (
  <>
    <span className="material-symbols-outlined text-sm text-purple-400">auto_awesome</span>
    <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-purple-400">
      {block.category}  {/* this is paragraphLabel, remember */}
    </span>
    <span className="ml-auto text-[10px] font-bold text-purple-300 bg-purple-500/20 rounded-full px-2 py-0.5 font-mono">
      AI SUGGESTION
    </span>
  </>
) : (
  /* standard header: dot + category + MATCH badge + edit/delete buttons */
)}
```

The card background uses an inline `style` rather than Tailwind because the gradient needs fractional opacity values that don't map cleanly to Tailwind utility classes:

```tsx
style={isAISuggestion ? {
  background: 'linear-gradient(135deg, rgba(139,92,246,0.10), rgba(167,139,250,0.04))',
} : undefined}
```

No `onManage` and no `onRemove` props are passed for suggestion cards — they're ephemeral, so there's nothing to edit or delete. The card can still be clicked to insert the generated text into the editor.

## The Gotcha: Smart Quotes Break TypeScript

This was the session's main debugging moment. After editing both `page.tsx` and `BlockCard.tsx`, the IDE lit up with dozens of `Invalid character (1127)` TypeScript errors on lines I had just written. The errors were cascading — once the parser hit the first bad character, it couldn't parse the rest of the function, generating a wall of downstream "Cannot find name" errors that looked nothing like the actual problem.

The symptom looked like a syntax error but the written code was visually correct. Something was wrong with the characters themselves.

A Python check confirmed it:

```python
with open('page.tsx', 'rb') as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    non_ascii = [(j, hex(b)) for j, b in enumerate(line) if b > 127]
    if non_ascii:
        print(f'Line {i+1}: {non_ascii}')
```

Output:
```
Line 955: [(30, '0xe2'), (31, '0x80'), (32, '0x98'), ...]
Content: b"      const res = await fetch(\xe2\x80\x98/api/coverletter/match\xe2\x80\x99, {"
```

`\xe2\x80\x98` and `\xe2\x80\x99` are the UTF-8 encodings of Unicode left and right single quotation marks (`'` and `'`). The Edit tool had silently substituted them for straight ASCII single quotes. TypeScript string literals require `'` — the curly variants are invalid characters outside of string content.

The fix was a two-line Python replacement directly on the raw bytes, run on both affected files:

```python
content = content.replace(b'\xe2\x80\x98', b"'")
content = content.replace(b'\xe2\x80\x99', b"'")
```

After that, `tsc --noEmit` came back clean.

The lesson: "Invalid character (1127)" errors near string literals almost always mean Unicode quotes got injected. The visual display in the editor may not show the difference — `'` and `'` look identical in most fonts. When TSC is complaining about characters you can't see, check the raw bytes.

## What's Next

A few things could sharpen this feature:

- **Regenerate without re-matching**: right now, clicking "Match Blocks" re-runs the full Gemini prompt. If you've already picked your matched blocks and just want fresher suggestions, you're paying for the whole call again. A separate "Refresh Suggestions" button would be more surgical.
- **"Save to Library" action on suggestion cards**: the generated text is sometimes surprisingly good. A one-click path to promote an AI suggestion into a real library block (with a category dropdown) would close the loop.
- **Suggestion quality depends on block context**: Gemini writes better drafts when the block library is rich. An empty library gives it nothing to ground the writing in. A nudge toward adding blocks when the library is sparse would help new users.
- **Editor coverage detection edge cases**: the structural coverage check is fuzzy — Gemini infers whether "Projects / Breadth" is present from natural language, which means a rambling paragraph about projects might or might not be detected. Explicit paragraph tagging in the editor (like the highlight system) could make this deterministic.

---

A feature that tells you what's missing is more useful than one that just reflects what you have — the same principle that makes a linter more valuable than a viewer.
