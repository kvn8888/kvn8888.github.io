# Cycle-Aware Usage Snapshot Plan

## Why This Needs a Redesign

The current usage history system is useful, but it is still built around two assumptions that do not hold for every provider:

1. snapshots are only written when someone opens the dashboard
2. every billing cycle lines up with the first day of the calendar month

That means the current burn-rate cards are good as rough estimates, but they are not a reliable answer to questions like:

- are we burning faster than yesterday?
- are we burning faster than last week?
- how does this cycle compare with the previous one?
- what happens when the provider resets on the 5th or on an epoch boundary instead of the 1st?

The goal of this plan is to move from opportunistic monthly estimates to scheduled, cycle-aware history.

## Target Outcome

The usage dashboard should eventually be able to answer all of these from stored history:

- yesterday delta
- last 7 days total
- previous 7 days total
- current cycle average per day
- previous cycle comparison
- projected exhaustion date within the active billing cycle

The job tracker stats route already uses this general shape: store dated facts first, then calculate windowed summaries from them.

## Phase 1: Reliable Daily Capture

Phase 1 is the lowest-risk improvement and should happen first.

### 1. Extract shared collectors

Move provider-specific fetch and normalization logic out of the live `/api/usage/*` routes into shared collector functions.

That lets two callers reuse the same logic:

- the existing authenticated dashboard routes
- a new cron route that records snapshots even when nobody opens the dashboard

### 2. Add a cron route

Add a route such as `/api/cron/usage-snapshots` and secure it with `CRON_SECRET`.

The Vercel config should include a scheduled invocation similar to:

```json
{
  "crons": [
    {
      "path": "/api/cron/usage-snapshots",
      "schedule": "0 6 * * *"
    }
  ]
}
```

The exact hour is flexible. The important part is having one stable daily capture that does not depend on UI traffic.

### 3. Keep writing the current table for now

Phase 1 does not need to solve arbitrary billing cycles yet.

It should continue writing the current snapshot table so the dashboard gets immediate value from a reliable cadence instead of an opportunistic one.

## Phase 2: Cycle-Aware History

Phase 2 fixes the real data-model problem.

### 1. Replace implicit monthly periods with explicit cycle metadata

The snapshot model should stop treating `YYYY-MM` as the canonical billing window.

Each snapshot should carry explicit cycle information such as:

- `cycleKey`
- `cycleStart`
- `cycleEnd`
- `windowSource`

`windowSource` should explain where the cycle boundary came from:

- provider-reported
- configured anchor day
- calendar-month fallback

### 2. Keep cumulative totals as the source of truth

Do not switch the system to storing daily increments only.

Store cumulative totals per service and metric, then derive daily or weekly deltas from adjacent snapshots. That keeps the write path idempotent and handles providers that revise totals after the fact.

### 3. Add a metric registry

Create a single registry that defines which metrics are eligible for cycle-aware history and how their cycle boundaries are determined.

Initial priority list:

- Tavily
- GitHub Codespaces
- GitHub Copilot premium requests
- Azure student credit used
- GCP billing spend
- Turso rows read
- Odds API requests used
- Venice DIEM used

Services without a stable cumulative total or usable billing API should stay out of the burn-rate model until a real collector exists.

### 4. Support provider-specific cycle rules

Use the provider's cycle window when the API exposes it.

If the API does not expose it, fall back to a configured anchor day per provider. That is the only safe way to support billing cycles that reset on days other than the 1st.

Venice should also be treated as a special case because its DIEM allocation is epoch-based rather than a simple calendar month.

## Phase 3: History API and Dashboard Upgrade

### 1. Expand the history API

`/api/usage/history` should stop returning only the current monthly bucket.

It should be able to return:

- current cycle
- previous cycle
- custom date range
- metric-specific series for charting and comparisons

### 2. Update the burn-rate math

The dashboard should stop relying on:

- `used / dayOfMonth`
- first-snapshot to last-snapshot average across the current calendar month

Instead it should compute from same-cycle snapshots and expose both:

- cycle-to-date average
- trailing 7-day average

That gives the user a stable budget projection and a more responsive short-term trend at the same time.

### 3. Add comparison views modeled after job tracker stats

The usage dashboard should grow comparison summaries similar in spirit to the job tracker stats section:

- today vs yesterday
- this 7-day window vs previous 7-day window
- this cycle vs previous cycle

## Migration Strategy

Do not throw away the current snapshot table immediately.

Treat the existing monthly rows as legacy history and prefer the new cycle-aware records once they are available. That avoids losing current burn-rate data while the new collectors and UI are being rolled out.

## Recommended Execution Order

1. Extract shared collectors from the current usage routes.
2. Add the secured Vercel cron route and reliable daily capture.
3. Introduce the cycle-aware snapshot schema and metric registry.
4. Upgrade `/api/usage/history` to support cycle and range queries.
5. Replace the dashboard burn-rate helper with cycle-aware comparisons.

This keeps the first milestone small and useful, while still steering toward the model the dashboard actually needs.