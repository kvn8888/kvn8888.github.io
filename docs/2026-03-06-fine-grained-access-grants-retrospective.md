# Fine-Grained Access Grants for Invited Accounts

## Why This Change Was Needed

The existing invite flow was binary: an email was either approved for the protected site or it was not.

That worked for personal use, but it broke down the moment invited accounts needed scoped access.
If someone only needed `/projects/usage`, the old model still gave them `/tools/secrets`, `/tools/notes`, `/projects/job-tracker`, and every protected API behind those pages.

The important realization was that page-level gating alone was not enough.
If `/projects/usage` was hidden but `/api/usage/*` still accepted any authenticated session, the restriction was cosmetic.

## The Core Design

The final design uses a shared grant registry in `homepage/src/lib/accessGrants.ts`.

Each grant key represents a capability, not just a single URL.
That capability can include:

- A primary page route
- Legacy aliases that still exist in the app
- Backing protected API prefixes
- Which hub, if any, should expose that capability

That produced a structure like this:

```ts
{
  key: 'usage-monitor',
  label: 'API Usage Monitor',
  hubPaths: ['/projects'],
  pathPrefixes: ['/projects/usage', '/api/usage'],
}
```

This avoided storing raw paths directly in the database.
If the route surface changes later, the grant key can stay stable while the registry evolves.

## What Changed

### 1. Turso now stores per-email grant keys

`login_access_grants` was added alongside `login_attempts`.
The approval model is now:

- `ALLOWED_EMAILS` owners: full access, no grant checks
- Approved invited emails with no grant rows: legacy full access
- Approved invited emails with grant rows: restricted to those grant capabilities

Keeping “no grant rows means full access” preserved backwards compatibility for already-approved accounts.

### 2. Auth enforcement moved to the actual boundary

`src/proxy.ts` now covers not only `/projects/*` and `/tools/*`, but also selected protected API families such as:

- `/api/usage/*`
- `/api/secrets`
- `/api/logins`
- `/api/jobs/*`
- `/api/speech/*`

`auth.ts` then uses the shared registry to decide whether the current session can reach the requested path.

For blocked API requests, it returns JSON `403` or `401`.
For blocked page requests, it redirects the user to the best hub they still have access to.

### 3. Sign-In Manager became an access editor

The manager UI now supports two modes per invited account:

- Full access
- Selected pages only

That sounds small, but it matters operationally.
An admin can now approve a login attempt and limit the account in the same action, or revisit an approved account later and tighten or expand its scope.

## The Non-Obvious Part

The subtle part of the implementation was hub access.

Some grants have legacy aliases like `/projects/logins`, but that does not mean they should light up the entire `/projects` hub.
To solve that, the registry separates:

- `pathPrefixes`: what the grant can actually open
- `hubPaths`: which top-level hub should expose that grant in navigation

That prevented legacy aliases from leaking visibility into the wrong hub.

## Tradeoffs

The main tradeoff is that new protected pages now have one more integration point.
Adding a route under `/projects/*` is not enough if it should be grantable to invited users.
It also has to be registered in `accessGrants.ts`, and any protected API it depends on has to be listed there too.

That extra maintenance cost is acceptable because it makes the permission model explicit instead of implicit.

## Follow-Up Work

Two things would improve this further:

1. Add a dedicated “Access denied” page for logged-in users who hit a route they no longer have.
2. Add grant-aware checks closer to high-value data operations as a second line of defense, not just in proxy/auth.

The current implementation is already materially safer than the old binary approval model because it closes the API bypass path, which was the real weakness.