# One Secrets UI, Two Execution Models

The trap with environment management is assuming there are only two choices:

1. fully runtime-manageable
2. not worth showing in the app at all

That sounds clean, but it breaks down the moment a variable is painful to manage manually and still cannot safely be applied at runtime.

That was the exact problem here.

The secrets UI already handled runtime overrides well enough for keys that flowed through `getSecret()`, but the env template had outgrown that model. The user still had to open the Vercel dashboard for keys like:

- `JOBS_TURSO_DATABASE_URL`
- `JOBS_TURSO_AUTH_TOKEN`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`

The UI had become a partial control plane instead of the real one.

## The Better Split

The fix was to stop treating “shown in the UI” and “runtime-overridable” as synonyms.

Every key in `homepage/.env.example` now exists in `homepage/src/lib/managedSecrets.ts`, but each one declares a strategy:

```ts
strategy: 'runtime-override' | 'env-sync-only'
```

That made the UI honest instead of simplistic.

- **Runtime override** means the value is stored in Turso, read through `getSecret()`, and can take effect immediately.
- **Env sync only** means the value is managed from the same UI but only written to Vercel envs, because the code consumes it at bootstrap.

That distinction matters because some values are structurally unsafe to route through the live override system.

## Why Bootstrap Keys Are Different

The most important example is `AUTH_SECRET`.

The runtime secrets store encrypts values with a key derived from `AUTH_SECRET`. If the UI tried to treat `AUTH_SECRET` like an ordinary runtime override, it would create a circular dependency: the secret store would depend on a secret that the secret store is trying to replace.

The same logic applies to the primary Turso connection pair:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

Those are needed before the secret override database can be reached.

So those entries now live in the UI as **env-sync-only** keys. That keeps them manageable without pretending they can be hot-swapped safely.

## The Jobs Database Pair Was the Interesting Edge Case

`JOBS_TURSO_DATABASE_URL` and `JOBS_TURSO_AUTH_TOKEN` were different.

They do not bootstrap the secrets system itself. They only configure the separate jobs database. That meant they were good candidates to graduate from “manual Vercel env only” to “true runtime-manageable secret.”

The fix was to move the jobs DB loader onto `getSecret()`:

```ts
const url =
  (await getSecret('JOBS_TURSO_DATABASE_URL')) ||
  process.env.JOBS_TURSO_DATABASE_URL ||
  process.env.TURSO_DATABASE_URL
```

That one change turned the jobs DB pair into a real first-class part of the secrets system without destabilizing the primary Turso connection.

## The `env set` Badge

The other problem was feedback.

Before this change, the UI could tell you a key was overridden in Turso, but it could not tell you whether the underlying env already existed in Vercel. That mattered because the UI was also syncing values into Vercel for future deploys.

The updated `/api/secrets` route now returns per-key status metadata, and the page shows an `env set` badge when the project env is already present.

When the Vercel project lookup is unavailable, it falls back to the current deployment env instead of showing nothing.

That makes the UI useful as an inventory, not just as a write form.

## What Changed in Practice

This change gave the repo three concrete improvements:

1. `homepage/.env.example` and the secrets UI now cover the same inventory.
2. The UI distinguishes between values that apply immediately and values that require redeploy.
3. The dedicated jobs database pair no longer has to be managed manually in the Vercel dashboard.

That is a much better operational model than a half-runtime, half-dashboard setup where the user has to remember which envs belong to which interface.