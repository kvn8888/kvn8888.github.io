# From Calendar Math to Daily Snapshots

The earlier March 6 retrospective covered the first wave of work: fixing the auth/build issues, adding GitHub billing cards, and correcting the Render bandwidth endpoint. What it did not cover is what happened after those changes met real usage data and actual deployment feedback.

This follow-up is about the second-order fixes: making the runtime secrets UI push values into Vercel, admitting that the dashboard's so-called "daily burn rate" was really a monthly estimate, and then putting a Turso-backed daily snapshot layer underneath the cards so the math could become honest.

---

## The Starting Point

Two things became obvious once the first batch of changes landed:

1. The new runtime secrets UI was useful, but it still left a gap between "works now" and "survives the next redeploy."
2. The dashboard said "Daily Burn Rate" in several places, but most cards were actually doing:

```typescript
const dailyRate = used / dayOfMonth
```

That's not daily tracking. That's month-to-date total divided by how many calendar days have elapsed.

It is a reasonable fallback. It is not the same thing as recording real day-over-day usage.

---

## Step 1: Saving to Turso and Vercel in One Click

The runtime secrets flow already wrote encrypted overrides into Turso first, and `getSecret()` already preferred those overrides over `process.env`. That meant the app could start using a new key immediately.

The missing piece was persistence for the next redeploy.

So the `/api/secrets` POST path now does two things in sequence:

1. save the override in Turso
2. best-effort upsert the same key into Vercel project envs

The important design choice was **not** making Vercel sync a prerequisite for the local save. Turso is the runtime source of truth. Vercel sync is a mirror for future deployments.

```typescript
await setSecretOverride(key, value, session.user.email)
const vercelSync = await syncSecretToVercel(key, value)
return NextResponse.json({ success: true, vercelSync })
```

That way a temporary Vercel API failure doesn't block the app from working right now.

---

## Step 2: The Burn Rate Wasn't Actually Daily

Once I looked at the existing cards side by side, the pattern was everywhere:

- Tavily
- Codespaces
- Azure
- Turso
- Odds API
- Venice

Each card took the current cumulative usage for the month, divided it by the day number, and projected forward. Useful, but still a monthly estimate.

The fix needed a place to store one cumulative total per service per day.

---

## Step 3: A Tiny Snapshot Table Changes the Whole Dashboard

I added a Turso-backed helper that stores normalized daily totals by service, metric, and billing period.

```typescript
CREATE TABLE IF NOT EXISTS usage_metric_snapshots (
  service TEXT NOT NULL,
  metric TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  period_key TEXT NOT NULL,
  total_value REAL NOT NULL,
  captured_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (service, metric, snapshot_date, period_key)
)
```

This is intentionally boring schema design. Boring is good here.

The key insight was to store **cumulative totals**, not per-day deltas. Providers already expose month-to-date totals naturally. If I store today's cumulative total and yesterday's cumulative total, the daily delta falls out of subtraction. That keeps the write path simple and resilient.

---

## Step 4: One History Route, Many Smarter Cards

Instead of teaching every card how to query Turso directly, the dashboard now fetches one shared route:

```text
/api/usage/history
```

That route returns the current billing period's stored snapshots. The page uses them to compute a real daily average whenever at least two snapshot points exist. If there isn't enough history yet, it falls back to the old calendar-based estimate.

That fallback matters. A good migration doesn't require perfect historical data on day one.

---

## Step 5: GitHub Copilot Needed a Real Limit

The GitHub Copilot card originally showed per-model premium request counts, but it didn't know the actual student-plan cap the user cared about.

That cap is 300 premium requests, so I added it as an explicit limit and gave Copilot the same meter + burn projection treatment as the other tracked services.

```typescript
const INCLUDED_PREMIUM_REQUESTS = 300
```

This seems small, but it changes the card from "interesting telemetry" into "actionable budget tracking."

---

## The Gotcha: Better Math Still Depends on Real Cadence

The snapshot system is more accurate than dividing by the calendar day, but it's still opportunistic right now. Snapshots are written when the relevant usage routes are hit.

That means the burn math gets better as the dashboard gets visited more consistently.

The clean final version would add a scheduled daily job so snapshots arrive even when nobody opens the page. But the current version is still a meaningful improvement because it turns "pretend daily" into "actual daily whenever observed," which is a real step forward.

---

## What's Next

- Add a scheduled daily capture so the snapshot cadence is no longer user-driven.
- Use the same history layer for GCP month-end spend projection once the billing export is confirmed live.
- Add a small UI note indicating whether a card is using snapshot-backed burn or fallback estimation.

---

The easiest metric to fake is a daily average. The most useful metric to build is the one that admits where its data comes from.