# Three Sources of Truth Is Two Too Many

I started this change thinking I was just going to add a couple of missing keys to `homepage/.env.example`.

The real bug was bigger than that.

This repo had drifted into three different definitions of "what env vars matter":

1. the actual code paths under `homepage/src`
2. the checked-in template in `homepage/.env.example`
3. the runtime secrets UI at `/tools/secrets`

As long as those three lists stay aligned, everything feels fine. Once they drift, the app starts telling half-truths.

The clearest example was the secrets page. It exposed some keys, but not all of the runtime-manageable ones. Worse, a few routes still read those same values directly from `process.env`, which meant the UI could claim a key was overridable while the route quietly ignored the override.

That is the kind of bug that wastes time because nothing is obviously broken. The UI works. The API works. The env file exists. They just do not agree with each other.

---

## Step 1: Inventory the Real Env Surface Area

The first move was not editing. It was counting.

I scanned the app for both direct env reads and secret-store lookups:

```typescript
process.env.SOME_KEY
await getSecret('SOME_KEY')
```

That gave me the actual runtime inventory. From there, comparing that inventory against `homepage/.env.example` made the missing entries obvious:

- `GITHUB_PAT` and `GITHUB_USERNAME`
- `VERCEL_PROJECT_ID`, `VERCEL_PROJECT_NAME`, `VERCEL_TEAM_ID`, `VERCEL_TEAM_SLUG`
- `REPLICATE_API_TOKEN`
- `SHEETS_WEBHOOK_URL`
- `GCP_BILLING_EXPORT_PROJECT_ID`, `GCP_BILLING_EXPORT_DATASET`

There were also existing keys that belonged in the runtime secrets story but were still inconsistently wired, especially around Resend, Mistral, Azure STT config, and S3-backed features.

---

## Step 2: Make the Example File Honest Again

I expanded `homepage/.env.example` so it reflects the env vars the code actually uses today, grouped by the way the app is organized:

- auth and sign-in
- email verification
- Google, Gemini, and GCP billing
- Azure speech and billing
- usage monitoring providers
- Vercel env sync
- Turso databases and usage
- job tracker automation
- AWS and S3-backed resume or speech storage

That part sounds boring, but this file matters because it becomes the default reference when the next feature ships. If the template is incomplete, every future change starts from bad assumptions.

---

## Step 3: Remove the Hardcoded Secrets Page List

The more interesting fix was in the runtime secrets UI.

The page previously owned its own hardcoded list of keys. That guaranteed future drift because the UI list had no shared source with anything else.

So I pulled that data into a dedicated registry:

```typescript
export const MANAGED_SECRET_GROUPS: ManagedSecretGroup[] = [
  {
    label: 'Usage Monitoring',
    icon: 'monitoring',
    keys: [
      { key: 'GITHUB_PAT', description: 'GitHub billing API for Codespaces and Copilot usage' },
      { key: 'REPLICATE_API_TOKEN', description: 'Replicate account status and usage checks' },
    ],
  },
]
```

That registry now lives in `homepage/src/lib/managedSecrets.ts`, and the page renders from it instead of maintaining its own private list.

The practical benefit is simple: when a route becomes runtime-manageable, there is now one obvious place to add it.

---

## Step 4: A Secrets UI Is Useless If Routes Ignore It

This was the real root-cause fix.

Adding keys to the page is not enough. The route has to read from the same source of truth.

So I replaced direct `process.env` reads with `getSecret()` in the routes that should honor runtime overrides, including:

- job parsing with `GEMINI_API_KEY`
- email verification and Resend usage with `RESEND_API_KEY` and `AUTH_EMAIL_FROM`
- Mistral and Replicate usage routes
- job tracker dual-write via `SHEETS_WEBHOOK_URL`
- Azure OpenAI transcription deployment overrides
- S3-backed resume and speech storage config

The pattern is intentionally boring:

```typescript
const apiKey = await getSecret('MISTRAL_API_KEY')
if (!apiKey) {
  return NextResponse.json({ error: 'MISTRAL_API_KEY not configured' }, { status: 500 })
}
```

That is the right kind of boring. It means the runtime secrets layer actually behaves like a runtime secrets layer.

---

## Step 5: A Single UI Can Still Have Two Kinds of Secrets

The first version of this work stopped short of exposing the bootstrap-only variables in `/tools/secrets`.

That was defensible from a purity standpoint, but it still left a practical gap: people were falling back to the Vercel dashboard for exactly the envs that are most annoying to type by hand, including the dedicated jobs Turso connection pair.

The better split turned out to be **not** “show it in the UI or hide it entirely.”
It was “show everything in the UI, but be honest about how each key behaves.”

That produced two classes of entries:

- **Runtime override** — stored in Turso, available immediately through `getSecret()`, and also mirrored into Vercel envs when configured
- **Env sync only** — saved into Vercel envs from the same UI, but only picked up after redeploy because the code reads them during bootstrap

That keeps dangerous bootstrap values such as `AUTH_SECRET`, `AUTH_GOOGLE_*`, and the primary `TURSO_*` connection pair out of the live runtime override path without forcing the user back into the Vercel dashboard.

The page now explains that split directly, and it also shows an `env set` badge when a key is already present in the Vercel project envs.

That ended up being the right tradeoff: one inventory, one UI, but two execution models.

## Step 6: The Jobs DB Pair Needed a Better Answer

The jobs database credentials were the awkward middle ground.

They are not safe to treat like the primary `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, because those bootstrap the secrets system itself.
But they also do not need to stay deploy-only.

The fix was to move `JOBS_TURSO_DATABASE_URL` and `JOBS_TURSO_AUTH_TOKEN` onto `getSecret()` in `src/lib/jobsDb.ts`.

That means the dedicated jobs database can now be rotated from `/tools/secrets` at runtime, while the primary Turso connection pair remains env-sync-only.

That split is much better than forcing all Turso-related values into the same bucket.

---

## The One Thing I Did Not Fix

I did a targeted lint pass on the touched files, but ESLint itself failed before it could lint anything because the repo's current config is tripping a circular-structure serialization bug.

That is worth fixing, but it is a tooling problem, not part of the env-alignment change.

The source edits themselves passed editor diagnostics, and the env inventory now matches the template except for `NODE_ENV`, which is intentionally left implicit.

---

## What I Would Keep From This

The useful lesson here is that env drift is rarely just a docs problem.

It usually means one of two things:

1. the repo has more than one source of truth
2. the runtime path and the UI path are describing different systems

The fix was not "add missing keys." The fix was to make the app answer the same question the same way in three places:

- what keys exist
- which ones are safe to override at runtime versus sync only on redeploy
- which code paths actually honor those overrides

When env configuration starts feeling annoying, it is usually because the codebase is telling the truth in fragments instead of all at once.