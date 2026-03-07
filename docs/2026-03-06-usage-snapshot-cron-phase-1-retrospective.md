# Phase 1: Stop Letting the Dashboard Decide When History Exists

The original snapshot system was already a step up from dividing by the current day of the month, but it still had one structural weakness:

history only advanced when a person opened the dashboard.

That meant the math could be technically correct for the days we observed and still be operationally incomplete.

## What Phase 1 Changed

Phase 1 did not try to solve arbitrary billing-cycle boundaries yet.

It focused on the first, smaller problem:

- move the snapshot-capable provider logic into shared collectors
- let the live `/api/usage/*` routes reuse those collectors
- add a Vercel cron route that runs the same collectors once per day

That gives the app one consistent source of provider normalization and one reliable path for daily capture.

## Why the Collector Extraction Mattered

The tempting shortcut would have been to make the cron route call the existing usage routes over HTTP.

That would have kept the code small, but it would also have baked auth concerns, route formatting, and snapshot writes into the wrong layer.

The cleaner split was:

- collectors fetch and normalize provider data
- live routes authenticate the user and return payloads
- the cron route authenticates with `CRON_SECRET` and persists snapshots

That is a much better boundary for the next phase, where cycle-aware history will need to evolve without duplicating provider logic again.

## The Other Important Follow-On

Adding a cron route also changed the environment surface.

`CRON_SECRET` is now part of the repo's real deployment contract, so it had to be added to both:

- `homepage/.env.example`
- `src/lib/managedSecrets.ts`

If that step gets skipped, the code starts drifting away from the "full env inventory in the secrets UI" rule almost immediately.

## What Phase 1 Does Not Solve

This change improves cadence, not cycle semantics.

The history layer still needs the Phase 2 redesign so providers that reset on the 5th, on a custom billing date, or on an epoch boundary are not forced into a calendar-month bucket.

But Phase 1 is still the right move because it removes the most obvious source of missing history: days where the data changed but nobody loaded the page.