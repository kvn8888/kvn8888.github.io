# Three Bugs Hidden in Plain Sight: Proxy Entry Points, Billing APIs, and Runtime Secrets

I started this session expecting a routine dashboard update. Instead, I ended up tracing an auth redirect bug, wiring two GitHub billing endpoints into the usage monitor, fixing a Render metrics call that had been pointed at a nonexistent endpoint, and then cleaning up a Next.js 16 deployment break that only showed up once Vercel tried to build the branch.

The interesting part wasn't any one feature. It was how each fix exposed the next assumption hiding underneath it.

---

## The Starting Point

The app has a private `/projects` area behind Google OAuth and a usage dashboard that already tracks multiple services. Two new requests came in together:

- add **GitHub Codespaces** usage to the dashboard
- add **individual GitHub Copilot** premium request usage

At the same time, there was a production auth symptom: visiting `/projects` while signed out, authenticating with Google, and then seeing a raw JSON response instead of landing back on the app.

There was also one more wrinkle: the site proxies a separate Render-hosted Polymarket app under `/polymarket`, and that Render app has its own Google OAuth configuration. That meant I had to be careful not to conflate the main site's auth flow with the proxied app's auth flow.

---

## Step 1: Protecting Routes the Next 16 Way

This codebase is on **Next.js 16**, and that matters because Next renamed the edge entrypoint from `middleware.ts` to `proxy.ts`.

The auth setup already had the correct Auth.js export in place:

```typescript
// src/proxy.ts
export { auth as proxy } from '@/auth'

export const config = {
  matcher: ['/projects/:path*', '/tools/:path*'],
}
```

That file is what activates the `authorized` callback inside `auth.ts`.

The callback itself originally only treated `/projects` as protected:

```typescript
authorized({ auth, request: { nextUrl } }) {
  const isLoggedIn = !!auth?.user
  const isProtected = nextUrl.pathname.startsWith('/projects')
  return isProtected ? isLoggedIn : true
}
```

That worked for the main project hub, but it didn't line up with the proxy matcher, which also included `/tools`. The fix was to make the callback match the routes the proxy actually guards:

```typescript
const isProtected =
  nextUrl.pathname.startsWith('/projects') ||
  nextUrl.pathname.startsWith('/tools')
```

That kind of mismatch is subtle. The proxy decides *which requests are checked*. The `authorized` callback decides *what happens to those checked requests*. If those two pieces drift apart, you get behavior that feels random even though each file looks locally reasonable.

---

## Step 2: The Build Broke Because I Fixed It Like It Was Still Next 15

This was the most instructive mistake of the session.

My first auth fix followed the older `middleware.ts` pattern. That would have been fine in a previous Next.js release. But after a pull, the project was now on Next 16, and Vercel made that very explicit:

```text
Error: Both middleware file "./src/src/middleware.ts" and proxy file "./src/src/proxy.ts" are detected.
Please use "./src/src/proxy.ts" only.
```

So the real fix was not “add middleware.” It was:

1. keep `src/proxy.ts`
2. delete `src/middleware.ts`
3. align `authorized` with the proxy matcher

This is a good example of why framework version drift matters. The code change that looked obviously correct in isolation was wrong for the actual runtime the repo had already moved to.

---

## Step 3: GitHub Codespaces and Copilot Usage in One Route

GitHub's billing APIs now expose enough data to build a genuinely useful personal usage card.

The two endpoints I needed were:

- `GET /users/{username}/settings/billing/usage` for itemized product usage, including Codespaces
- `GET /users/{username}/settings/billing/premium_request/usage` for Copilot premium requests by model and SKU

I combined both into a single server route, `/api/usage/github`, so the client only has one thing to fetch and only one place needs the PAT.

The interesting bit was that the Codespaces limits for the student plan are **not** returned by the API. So the route has to mix live usage with hardcoded plan constants:

```typescript
const INCLUDED_MINUTES = 10800
const INCLUDED_STORAGE_GB = 20
```

The route filters GitHub's billing data down to `product === 'Codespaces'`, groups minute usage by SKU, and separately totals storage reported as `GB` or `GB-month`. Then it fetches Copilot premium request usage in parallel and returns both in a single payload.

I used `Promise.allSettled()` instead of `Promise.all()` because billing integrations fail in annoying ways: missing permissions, preview rollouts, regional differences, temporary platform issues. If Codespaces works and Copilot fails, the dashboard should still show Codespaces instead of hard-failing the entire card.

```typescript
const [billingResult, copilotResult] = await Promise.allSettled([
  fetch(codespacesUrl, { headers, cache: 'no-store' }),
  fetch(copilotUrl, { headers, cache: 'no-store' }),
])
```

That decision is small, but it changes the UX from “integration broken” to “partial data, still useful.”

---

## Step 4: Burn-Rate Math Works for More Than Credits

The dashboard already had a nice pattern for Tavily: show current usage, daily burn, projected month-end usage, and whether the account will run out before the cycle ends.

I reused that pattern for Codespaces core minutes. That worked well because usage math doesn't care whether the unit is credits, minutes, or dollars. The dashboard code only needs:

- current used amount
- plan limit
- current day of month

From there, the projection is the same:

```typescript
const dailyRate = used / dayOfMonth
const projected = used + dailyRate * daysRemaining
const willBurnOut = projected > limit
```

That made the GitHub card feel native to the rest of the monitor instead of like a one-off widget bolted onto the grid.

---

## Step 5: The Render API Was Pointing at a 404

The existing Render usage route tried to call:

```text
GET https://api.render.com/v1/bandwidth
```

That endpoint doesn't exist.

The actual metrics endpoint is:

```text
GET https://api.render.com/v1/metrics/bandwidth
```

And it works differently than a typical billing endpoint. You have to pass:

- a `startTime`
- an `endTime`
- one or more `resource=<serviceId>` query params

Then Render returns hourly time-series values per service. So the route now:

1. fetches services first
2. extracts their IDs
3. queries month-to-date bandwidth metrics
4. sums the hourly values per service and in aggregate

That turned the Render card from “list of services plus guessed limits” into something that can actually report real bandwidth usage for a paid account.

Just as important: I removed the old hardcoded free-tier instance-hour assumptions. Those numbers were worse than missing data because they looked authoritative while being wrong for a paid plan.

---

## Step 6: Runtime Secrets Changed the Way the Integration Should Feel

Midway through the session, I learned the repo had gained a runtime secret override system backed by Turso.

That changed the right answer for “how do we add the GitHub PAT?”

Instead of telling the app to wait on a Vercel env update and redeploy, the correct UX is now:

1. go to `/tools/secrets`
2. save `GITHUB_PAT`
3. save `GITHUB_USERNAME`
4. refresh `/projects/usage`

The `getSecret()` helper checks the encrypted database override first and falls back to `process.env` second. That means the dashboard can pick up new credentials immediately.

I also added both GitHub keys to the Runtime Secrets UI so this path is visible in the app instead of being tribal knowledge:

```typescript
{ key: 'GITHUB_PAT', description: 'GitHub billing API (Codespaces + Copilot usage)' },
{ key: 'GITHUB_USERNAME', description: 'GitHub username for personal billing endpoints' },
```

That's the sort of quality-of-life improvement that saves more time than the feature itself over the next few weeks.

---

## The Gotcha: AI Subagents Are Fast, Not Self-Verifying

I delegated parts of this work to subagents to parallelize the exploration. That helped on the GitHub and Render API research. It also created one useful failure mode.

One subagent proposed a rewrite to the Polymarket proxy config and changed the Render destination in a way that didn't match the deployed app. The correct target was:

```text
https://polymarket-ev-bot-docker.onrender.com
```

Not the alternate host it suggested.

This is the real lesson from using parallel agents in code work: they are excellent at accelerating search and synthesis, but they don't remove the need for source-of-truth verification. Fast wrong answers are still wrong answers. The only reason that didn't escape into the final state is that I re-read the actual config and compared it against what you explicitly said was deployed.

---

## What's Next

- Verify the signed-out `/projects` and `/tools` flows in production after Vercel redeploys.
- Add a bandwidth section to the Render card UI now that the API route returns real metrics.
- Consider setting `turbopack.root` in `next.config.ts` to silence the multi-lockfile warning in builds.
- If the GitHub card ends up being useful, add a small “last fetched” or “data freshness” note so billing lag is obvious.

---

The bug that finally broke the build wasn't the one I started with. It was the one created by assuming the framework still behaved like yesterday.

The fastest way to lose an afternoon is to fix the right problem with the wrong version in mind.
