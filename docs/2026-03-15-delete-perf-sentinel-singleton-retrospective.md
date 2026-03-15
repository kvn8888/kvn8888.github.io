# From 14 Turso Round-Trips to 1: Fixing Slow Deletes with a Sentinel Pattern

Every click of "Delete Block" in the cover letter workbench was taking a noticeable second or two. The actual delete — removing a row from a database — should be nearly instant. Something was burning time on every single mutation.

---

## The Starting Point

The cover letter workbench is a Next.js app (App Router, TypeScript) deployed to Vercel as serverless functions. It talks to [Turso](https://turso.tech/) — a hosted SQLite database that speaks over HTTP. Unlike a traditional Postgres connection where you can keep a socket open, Turso's model sends each query as an HTTP request to a remote server, which means latency per call is real and adds up.

The relevant source files were `src/lib/jobsDb.ts` (creates the DB client) and `src/lib/coverLetterDb.ts` (schema init + CRUD operations). Before this session, every mutation (create, update, delete) went through this sequence:

```
DELETE block clicked
  → getJobsDb()                          // new createClient() every single time
    → getSecret('JOBS_TURSO_DATABASE_URL')  // may itself hit Turso
    → getSecret('JOBS_TURSO_AUTH_TOKEN')    // may itself hit Turso
  → ensureCoverLetterSchema(db)          // NO guard — runs unconditionally
    → executeMultiple(DDL × 5)           // CREATE TABLE IF NOT EXISTS round-trip
    → seedLegacyBlocks()
      → INSERT ... ON CONFLICT DO NOTHING  // × 12 sequential round-trips
  → DELETE FROM cover_letter_block_tags  // actual work
  → DELETE FROM cover_letter_blocks      // actual work
```

That's roughly **14 Turso HTTP round-trips before the real delete even starts.** The delete itself was 2 statements. The "tax" was 12× the actual work.

---

## Step 1: Understanding Why `ensureCoverLetterSchema` Ran Every Time

The `ensureCoverLetterSchema` function's job is to create the tables if they don't exist — a bootstrapping concern. It should run once on a fresh database and never again.

`jobsDb.ts` actually had a `schemaInitialized` boolean flag, but it was only checked inside `ensureJobsSchema` (for the job applications table). The `coverLetterDb.ts` file never imported or referenced that flag. Every call to any cover letter mutation function walked the full DDL + seed path.

The `seedLegacyBlocks` function was the most expensive part. It existed to migrate 12 hard-coded cover letter text blocks (which previously lived in `localStorage`) into the database once. It used `ON CONFLICT(seed_key) DO NOTHING` so re-runs were safe — but safety doesn't make them free. Each of the 12 inserts was a separate `await db.execute(...)` in a `for...of` loop:

```typescript
// Before: 12 HTTP round-trips, every mutation, forever
async function seedLegacyBlocks(db: Client) {
  for (const block of LEGACY_SEED_BLOCKS) {
    await db.execute({
      sql: `INSERT INTO cover_letter_blocks (seed_key, category, text)
            VALUES (?, ?, ?)
            ON CONFLICT(seed_key) DO NOTHING`,
      args: [block.seedKey, block.category, block.text],
    })
  }
}
```

This is a classic async-loop anti-pattern: each iteration waits for the previous one before firing, serializing what could (in principle) be parallelized — or in this case, eliminated entirely.

---

## Step 2: The Serverless Singleton Question

Before fixing anything, I needed to understand whether a module-level singleton would even survive in a Vercel serverless environment.

The short answer: **yes, between requests; no, across cold starts.**

Vercel's serverless functions run as Node.js processes. When a function is invoked, Vercel either:
- Spins up a **new process** (cold start) — all module-level variables initialize from scratch
- Reuses an **existing warm process** — module-level variables from the previous invocation are still in memory

This is different from a traditional server where a single process runs continuously. But it's also not as bad as "no state at all." A module-level variable acts as a request-scoped cache on cold starts and a cross-request cache on warm reuse.

For the Turso client, a module-level singleton means:
- **Warm container:** zero overhead — return the cached `Client` object immediately
- **Cold start:** pays the `createClient()` + `getSecret()` cost once, then caches it

This is exactly the [Prisma + Vercel recommended pattern](https://www.prisma.io/docs/guides/other/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices) (using `globalThis.prisma`). We used a simpler module-level `let` since we don't need the `globalThis` dance for our setup.

One meaningful tradeoff: if someone rotates the `JOBS_TURSO_AUTH_TOKEN` via the runtime secrets UI, the cached client holds the old token until the next cold start (i.e., redeployment or container recycling). For a personal tool, that's acceptable.

```typescript
// After: one client per warm container lifetime
let cachedJobsClient: Client | null = null

export async function getJobsDb(): Promise<Client> {
  if (cachedJobsClient) return cachedJobsClient  // hot path

  const url = (await getSecret('JOBS_TURSO_DATABASE_URL')) || process.env.JOBS_TURSO_DATABASE_URL
  const authToken = (await getSecret('JOBS_TURSO_AUTH_TOKEN')) || process.env.JOBS_TURSO_AUTH_TOKEN
  // ... validation ...

  cachedJobsClient = createClient({ url, authToken })
  return cachedJobsClient
}
```

---

## Step 3: The Schema Sentinel — A Two-Layer Guard

With the singleton handling warm containers, we still had the cold-start problem: a fresh Node.js process has no in-memory state, so `ensureCoverLetterSchema` would always run on the first request after a cold start.

The fix was a "schema sentinel" — a simple marker row in a `_schema_meta` table that proves the schema has already been applied. Conceptually this is the same mechanism every major migration tool uses (Flyway, Liquibase, `schema_migrations` in Rails). The check is a single `SELECT`:

```typescript
const SCHEMA_SENTINEL_KEY = 'cover_letter_v1'

export async function ensureCoverLetterSchema(db: Client) {
  // Hot path: warm container already verified this — zero DB round-trips
  if (coverLetterSchemaInitialized) return

  // Cold-start fast path: 1 SELECT instead of 14 round-trips
  try {
    const result = await db.execute({
      sql: 'SELECT 1 FROM _schema_meta WHERE key = ?',
      args: [SCHEMA_SENTINEL_KEY],
    })
    if (result.rows.length > 0) {
      coverLetterSchemaInitialized = true
      return
    }
  } catch {
    // _schema_meta doesn't exist yet — fresh DB, fall through to full init
  }

  // First run only: create tables + write the sentinel
  await db.executeMultiple(`CREATE TABLE IF NOT EXISTS cover_letter_blocks ...`)
  await db.execute({
    sql: 'INSERT INTO _schema_meta (key) VALUES (?) ON CONFLICT DO NOTHING',
    args: [SCHEMA_SENTINEL_KEY],
  })
  coverLetterSchemaInitialized = true
}
```

The `try/catch` around the sentinel SELECT handles the edge case where `_schema_meta` itself doesn't exist yet (i.e., the very first ever deployment against a blank database). Turso throws on a query against a nonexistent table rather than returning empty rows, so catching and falling through is the correct behavior.

The `SCHEMA_SENTINEL_KEY = 'cover_letter_v1'` versioning is intentional. If we ever need to run a migration (rename a column, add an index), we bump it to `'cover_letter_v2'`, which forces every container — warm and cold — to go through full initialization once on the next request.

### Combined latency profile

| Scenario | Before | After |
|---|---|---|
| Warm container | 14+ Turso round-trips | 0 (in-memory flag) |
| Cold start, schema exists | 14+ Turso round-trips | 1 SELECT |
| Cold start, fresh DB | 14+ Turso round-trips | 5 DDL statements (executeMultiple) + write sentinel |

---

## Step 4: Removing the Dead Seed Code

Since the legacy blocks are being removed from the database anyway, `seedLegacyBlocks` and the `LEGACY_SEED_BLOCKS` constant (120+ lines of hard-coded text) were removed entirely. This simplified `ensureCoverLetterSchema` and eliminated the largest single contributor to the latency — the 12 sequential no-op inserts.

The data was originally migrated from `localStorage` to Turso in a previous session. With the actual rows living in the DB, the seed function served no ongoing purpose. The `ON CONFLICT DO NOTHING` safety net had effectively been doing nothing useful for a while.

---

## What This Also Fixed: The Auth OAuth Callback

Unrelated to the delete perf work, we also found that Google OAuth sign-in was returning `{"error":"Authentication required"}`. The culprit: `next.config.ts` had a catch-all rewrite:

```typescript
// Before — this intercepted EVERY /api/* request, including /api/auth/callback/google
{
  source: "/api/:path*",
  destination: "https://polymarket-ev-bot-docker.onrender.com/api/:path*",
},
```

This was routing the OAuth callback to a completely different app (the Polymarket bot on Render), which had no idea what to do with it. The fix was removing that rule — the Polymarket proxy only needed the two `/polymarket` and `/polymarket/:path*` rules that were explicitly documented for it.

This is a good example of a rewrite rule being *too expressive*. `/api/:path*` matches everything under `/api/`, which includes Auth.js internals. Always prefer the most specific route match possible in proxy configurations.

---

## What's Next

The remaining latency issue identified but not yet addressed is in `getCoverLetterStorageClient()` ([coverLetterStorage.ts](../homepage/src/lib/coverLetterStorage.ts)): 4 sequential `getSecret()` calls happen before every S3 operation (letters and reference resume deletes), and a fresh `S3Client` is constructed each time. The same singleton + parallel secret resolution pattern would apply there, cutting the S3 delete path from ~4 Turso lookups + 1 S3 call down to 1 S3 call on warm containers.

A `syncBlockTags` batching improvement is also pending — it currently inserts N tag-links sequentially in a `for...of` loop. A single multi-row `INSERT INTO cover_letter_block_tags (block_id, tag_id) VALUES (?, ?), (?, ?)...` would replace N round-trips with 1 for the common case of tagging blocks.

---

The actual delete was never slow. We just made it wait in line behind 14 round-trips that had already done their job years ago.
