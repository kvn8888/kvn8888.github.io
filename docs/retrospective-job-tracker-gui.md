# From CLI Tool to Full-Stack GUI in One Session

I had a Python CLI for tracking job applications — a little script called `job_parser.py` that parsed postings with Gemini, wrote to a SQLite-backed Turso database, and logged everything to Google Sheets. It worked. It was also completely useless at 2am when I wanted to check how many applications I'd sent this week without opening a terminal. This session was about closing that gap: a real web GUI, three tabs, no compromises on design.

## The Starting Point

The existing setup was a classic "it works on my machine" situation:

- `job_parser.py`: a Python CLI with `argparse`
- Turso (a distributed SQLite-as-a-service): schema already existed, data was there
- No web interface anywhere

The schema was already battle-tested:

```sql
CREATE TABLE job_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    description TEXT,
    date TEXT,
    source TEXT,
    type TEXT,
    cover_letter TEXT,
    resume_type TEXT,
    interviewed INTEGER DEFAULT 0
);
```

Simple. Boring. Perfect. The goal was to expose it through a protected Next.js app that already had Auth.js (Google OAuth) and a glassmorphism design system. Four API routes. One frontend page. Let's go.

## Step 1: API Routes — The Boring Part That's Actually Load-Bearing

I needed four routes: GET + POST `/api/jobs`, POST `/api/jobs/parse`, GET `/api/jobs/stats`, and PATCH `/api/jobs/[id]`. The good news: `@libsql/client` (the JavaScript SDK for Turso) was already in `package.json`. The bad news: I'd never used it before in this codebase.

The pattern I followed for every route was inherited from existing API proxies:

```typescript
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // ... actual work
}
```

Auth check first. Always. The middleware already protects `/projects/*` routes on the frontend, but API routes are a separate surface — they can be called directly. Defense in depth.

The `PATCH /api/jobs/[id]` route was the most interesting to get right. I needed to let callers update any *allowed* field without letting them inject arbitrary column names into the SQL query. My approach: a static allowlist, then a dynamic `SET` clause:

```typescript
const ALLOWED_FIELDS = ['company', 'role', 'type', 'source', 'cover_letter',
                        'resume_type', 'interviewed', 'description'] as const
type AllowedField = (typeof ALLOWED_FIELDS)[number]

const updates: Partial<Record<AllowedField, unknown>> = {}
for (const field of ALLOWED_FIELDS) {
  if (field in body) updates[field] = body[field]
}

const setClauses = Object.keys(updates).map((f) => `${f} = ?`).join(', ')
```

The column names come from the allowlist, not the request. The values are parameterized. No SQL injection surface.

## Step 2: Gemini Structured Output — The Interesting Part

The "Parse with Gemini" feature was the reason to build this tool at all. Instead of manually typing company name, role, and type into form fields, you paste the whole job description and Gemini extracts the fields. The Python CLI did this with `google-generativeai`. The JS version uses the REST API directly.

The key was using `responseMimeType: 'application/json'` with a `responseSchema` — Gemini's structured output mode. It forces the model to return exactly the shape you define:

```typescript
generationConfig: {
  responseMimeType: 'application/json',
  responseSchema: {
    type: 'OBJECT',
    properties: {
      company: { type: 'STRING' },
      role: { type: 'STRING' },
      type: { type: 'STRING' },
      description: { type: 'STRING' },
    },
    required: ['company', 'role', 'type', 'description'],
  },
},
```

No JSON parsing errors. No `JSON.parse` wrapped in a try/catch hoping for the best. Gemini either returns valid structured output or fails — and you handle the failure cleanly.

I used `gemini-2.0-flash` here (not `gemini-2.5-flash-preview-tts` which is already used for text-to-speech elsewhere). The 2.0 model is cheaper and faster for simple extraction tasks. The parsing prompt is direct:

> Extract the following fields from this job posting. Return ONLY valid JSON with these exact keys: company, role, type, description.

Explicit. No ambiguity. Models respond well to "return ONLY X."

## Step 3: The Stats Route — Week Boundaries Are Annoying

The stats endpoint required calculating "this week" and "last week" in SQL. Sounds trivial. It's not.

The complication: weeks start on Monday (ISO 8601 convention), but JavaScript's `Date.getDay()` returns `0` for Sunday. You have to normalize:

```typescript
function getMondayISO(date: Date): string {
  const d = new Date(date)
  const day = d.getUTCDay()
  const diff = (day === 0 ? -6 : 1) - day  // Sunday → go back 6 days
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}
```

All date math uses UTC throughout to avoid timezone drift. The queries themselves are simple `WHERE date >= ?` comparisons because the schema stores dates as `TEXT` in `YYYY-MM-DD` format — and SQLite's lexicographic string comparison works correctly for ISO dates. A trick worth remembering.

Code review caught a misleading variable name: I'd called last week's end boundary `thisSunday` when it was actually "the Sunday before this Monday" — i.e., *last* Sunday. Renamed to `lastSunday`. Small thing, real confusion.

## Step 4: The Frontend — Three Tabs, One File

The UI lives at `/projects/tools/resume-tool/page.tsx` and is a client component (`'use client'`). Three tabs: Add, Browse, Stats. Same pill-tab pattern as Speech Lab.

The **Add tab** is the most complex. It has:
1. Pre-parse fields (source, cover letter toggle, resume type)
2. A paste textarea
3. "Parse with Gemini" → calls `/api/jobs/parse`
4. A parsed preview where each field is click-to-edit inline
5. A "Submit" button → calls `POST /api/jobs`

The inline edit pattern is intentionally minimal — click a field, an `<input>` appears, press Enter or click Save:

```tsx
{editField === field ? (
  <input
    autoFocus
    value={editValue}
    onKeyDown={(e) => {
      if (e.key === 'Enter') commitEdit()
      if (e.key === 'Escape') setEditField(null)
    }}
  />
) : (
  <p onClick={() => startEdit(field)}>{parsed[field]}</p>
)}
```

No modal, no popover, no library. Just state.

The **Browse tab** uses debounced search (300ms) to avoid hammering the API on every keystroke. The "toggle interviewed" is optimistic — it updates the UI immediately and reverts if the API call fails. For a personal tool this is fine; for a multi-user app you'd want to think harder about race conditions.

The **Stats tab** is intentionally static — it fetches on mount and doesn't poll. The numbers change infrequently enough that this is the right tradeoff.

## The Gotcha: TypeScript and `@libsql/client` Args

The PATCH route blew up immediately with a TypeScript error:

```
Type 'unknown[]' is not assignable to type 'InArgs | undefined'
```

The problem: `Object.values(updates)` returns `unknown[]` because `updates` is `Partial<Record<AllowedField, unknown>>`. The `@libsql/client` SDK's `execute` method has strict typing for its `args` parameter — it expects `InValue[]`, which is `string | number | boolean | null | ArrayBuffer | Uint8Array`.

The fix was explicit casting:

```typescript
const values: (string | number | boolean | null)[] = [
  ...Object.values(updates) as (string | number | boolean | null)[],
  numericId
]
```

It's not beautiful. But it's correct, and TypeScript confirms it. The alternative would be building the updates array differently from the start, but this was the minimal change that kept the dynamic query building pattern intact.

## What's Next

- **Full-text search**: The current `WHERE company LIKE '%q%'` works fine for a few hundred rows. At a few thousand it'll start hurting. Turso supports FTS5 extensions. Not needed today, worth knowing about.
- **Deletion**: The spec didn't include a delete route, and I didn't add one. Easy to add later with the same pattern as PATCH.
- **Charts**: The Stats tab has placeholder for a weekly bar chart using CSS bars. Currently just metric cards. The data to draw it is already returned from the API (`thisWeek`, `lastWeek`, etc.).
- **Google Sheets dual-write**: The webhook is wired up and works if `SHEETS_WEBHOOK_URL` is set. If not, it silently skips. This lets you turn it on without any code changes.
- **Error states in Browse**: Currently shows a simple red error message. A retry button would improve the UX.

---

*Building a GUI for your own CLI is the most honest form of dogfooding — you immediately know if the abstraction was any good.*
