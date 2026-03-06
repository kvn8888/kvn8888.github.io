# From Local Blocks to a Real Cover Letter Library

The cover letter workbench started as a single-user tool. That was fine right up until I needed the blocks to be durable, shareable across sessions, and trustworthy enough for Gemini to use as the source of truth. This session was the point where I stopped treating the library like browser state and promoted it into an actual product surface backed by Turso.

## The Starting Point

The original workbench had two different storage stories.

- The editor HTML lived in `localStorage` under its own key.
- The reusable block library also lived in `localStorage`, seeded from `INITIAL_BLOCKS` inside `types.ts`.

That meant the most important part of the tool, the reusable writing library, was still essentially a client-side demo. If I changed machines, cleared storage, or wanted to evolve the library model with tags and shared CRUD routes, I was starting from sand.

The first useful constraint was to separate what actually needed to persist:

- The editor itself could remain local for now.
- The reusable library needed a proper database schema.
- Gemini matching needed to read from the same block inventory the UI was editing.

That pushed the architecture toward Jobs Turso, which was already in the project for the job tracker. SQLite over libsql was a good fit here because the data model was tiny: reusable blocks, reusable tags, and a join table.

## Step 1: Move the Library Out of the Browser

I created a dedicated helper in `src/lib/coverLetterDb.ts` and gave the workbench its own schema instead of trying to keep bolting behavior onto the job tracker tables.

```ts
await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS cover_letter_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seed_key TEXT UNIQUE,
    category TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cover_letter_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cover_letter_block_tags (
    block_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (block_id, tag_id)
  );
`)
```

I also moved the original 12 hard-coded blocks to the server side and attached stable `legacy-*` keys to them. That detail matters more than it looks like. If you seed with only raw text and no stable identifier, you can accidentally create duplicates later when the seed script evolves.

The result was a very predictable bootstrap path:

1. Ensure the schema exists.
2. Insert the legacy blocks with `ON CONFLICT(seed_key) DO NOTHING`.
3. Return the full `{ blocks, tags }` payload to the client.

That removed `INITIAL_BLOCKS` from the client bundle completely, which was the architectural line I wanted.

## Step 2: Turn the UI Into a Real CRUD Surface

Once the storage layer was real, the client had to stop thinking in terms of local array mutation and start behaving like a small admin interface.

The page component now loads the library from `/api/coverletter/library`, saves blocks through `/api/coverletter/blocks`, updates and deletes through `/api/coverletter/blocks/[id]`, and does the same for tags.

```ts
const fetchLibrary = useCallback(async (showLoading = true) => {
  if (showLoading) setLibraryLoading(true)
  setLibraryError(null)

  const res = await fetch('/api/coverletter/library', { cache: 'no-store' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to load cover letter library')

  setLibraryBlocks(data.blocks ?? [])
  setLibraryTags(data.tags ?? [])
}, [])
```

I treated tags as first-class objects instead of an afterthought. That let me add three things cleanly:

- Tag CRUD in the right panel.
- Tag assignment inside the block form.
- Tag-aware filtering in the library list.

The user-facing effect is subtle but important: the workbench is no longer just a list of paragraphs. It is a searchable writing system.

I also changed the editor's “Create Card” flow so it stops inventing a client-side id and instead asks the parent page to persist the selected text as a new reusable block. That keeps the editor focused on editing and the page focused on data ownership.

## Step 3: Make Gemini Read the Same Library the UI Edits

The matching route already existed, but it needed to evolve with the data model. Once tags became part of the reusable library, I wanted Gemini to see that context too.

The route now formats each candidate block with category and optional tags, then filters Gemini's response back down to known ids before returning it to the client.

```ts
const knownIds = new Set(
  blocks
    .map((block: { id?: string }) => String(block.id ?? ''))
    .filter(Boolean)
)

const matches = Array.isArray(parsed?.matches)
  ? parsed.matches.filter(
      (match: { id?: string; reason?: string }) =>
        typeof match?.id === 'string' &&
        typeof match?.reason === 'string' &&
        knownIds.has(match.id)
    )
  : []
```

That filtering is one of those boring defensive moves that matters a lot in practice. If the model hallucinates an id or returns malformed JSON-adjacent output, the UI should degrade to “no matches” instead of rendering nonsense.

## The Gotcha: I Built the Right Helper and Called It the Wrong Way

The most useful bug in this session was not a Turso schema issue and not a Gemini prompt issue. It was an async boundary mistake.

`getJobsDb()` already existed and correctly returned a promise. In the new cover-letter helper, I initially wrapped it like this:

```ts
export function getCoverLetterDb() {
  return getJobsDb()
}

const db = getCoverLetterDb()
await ensureCoverLetterSchema(db)
```

That looks harmless when you are moving quickly, but `db` there is a promise, not a client. The result is exactly the kind of runtime bug that wastes time because the code structure looks right at a glance.

The fix was small and completely non-negotiable:

```ts
export async function getCoverLetterDb() {
  return getJobsDb()
}

const db = await getCoverLetterDb()
await ensureCoverLetterSchema(db)
```

This is the kind of bug TypeScript should usually save you from. In this case, the editor diagnostics did not surface it when I expected them to, which is a good reminder that “no red squiggles” is not the same thing as “runtime-correct.”

## The Revision: Verification Needed Its Own Tooling

After the refactor, I still had to answer the only question that really matters: did the live database and the live Gemini call work with the new model?

That should have been a quick shell check, but the terminal got noisy and unreliable during the session. Some commands returned no visible output, and early ad hoc attempts were not giving me a clean enough signal to trust.

Instead of fighting the shell one command at a time, I wrote `scripts/seed-coverletter-library.mjs`. The script does three jobs:

1. Loads `.env.local` without putting secrets on the command line.
2. Ensures the cover-letter schema exists and seeds the 12 legacy blocks.
3. Smoke-tests block/tag CRUD and runs the Gemini match flow against the seeded library.

```js
const payload = {
  ok:
    report.legacySeedCount >= LEGACY_SEED_BLOCKS.length &&
    (!crud.checked || crud.ok) &&
    (!gemini.checked || gemini.ok),
  expectedLegacySeedCount: LEGACY_SEED_BLOCKS.length,
  crud,
  gemini,
  ...report,
}
```

That script ended up being more valuable than the one-off verification I originally intended, because now the cover-letter library has a repeatable bootstrap and smoke-test path instead of a memory of which commands happened to work on one afternoon.

The final live report showed exactly what I wanted:

- The three `cover_letter_*` tables existed in Jobs Turso.
- All 12 legacy blocks were present.
- CRUD smoke tests for a temporary tag and block passed.
- Gemini returned four valid matches using ids from the DB-backed block library.

## What's Next

The main thing I would still improve is end-to-end UI automation. Right now I have strong evidence at the storage and API-behavior level, and the React code is wired correctly, but I am still relying on implementation review rather than browser automation for the panel interactions.

If I keep pushing this tool forward, the next likely steps are:

- Add a small Playwright smoke test for block/tag CRUD.
- Decide whether editor HTML should stay local-only or also move to the server.
- Seed starter tags the same way the starter blocks are seeded, once the taxonomy settles down.

Moving data out of `localStorage` is not glamorous work, but it is the moment a tool stops pretending to be a product and starts behaving like one.