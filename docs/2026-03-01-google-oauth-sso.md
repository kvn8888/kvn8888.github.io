# Building a Private API Usage Dashboard with Google SSO on a Portfolio Site

My portfolio site at kevinc.dev is a public resume site — but I wanted a hidden back room. A private section behind Google sign-in, housing internal tools I actually use. The first tool: a live dashboard that tracks how much of my API credits across nine different services I've burned through, complete with burn rate projections and warnings when I'm about to run out.

This is the full story of building that, from zero to a working OAuth-protected dashboard tracking Tavily, Vercel, Render, OpenRouter, GCP, Azure, Turso, The Odds API, and Venice AI. Every integration taught me something different. Two broke me for a few hours. One surprised me with an API design I'd never seen before.

By the end of this post, you'll be able to build the same thing.

---

## The Setup

The site runs Next.js 15 with the App Router, deployed to Vercel on the `dia-design` branch. Tailwind v4, Framer Motion, TypeScript throughout. The `main` branch deploys to GitHub Pages as a static export — but that branch can never run OAuth because static exports don't do server-side anything.

The `dia-design` branch on Vercel gives us full SSR, server components, and API routes. That's what makes this possible.

The goal:

- Lock `/projects/*` behind Google sign-in with an email whitelist
- Build server-side API proxy routes that hold the API keys
- Build a client-side dashboard that fetches from those routes
- Make it actually useful, not just a demo

---

## Part 1: Authentication

### Choosing the Auth Stack

In early 2026, the main options for Next.js authentication are:

| Option | Pros | Cons |
|---|---|---|
| **Auth.js v5** | No vendor lock-in, no database required, great Next.js integration | Still in beta, docs sometimes lag the API |
| **Clerk** | Incredible DX, drop-in UI components, 30-min setup | Vendor lock-in, pricing tiers, heavy JS bundle |
| **Firebase Auth** | Google-backed, generous free tier | Heavy SDK, overkill for minimal use cases |
| **Supabase Auth** | Best if you're already on Supabase | Unnecessary when you have no database at all |

I went with **Auth.js v5** (the package is `next-auth@beta`) for one reason: my requirements were trivial. One Google OAuth provider, no database, no roles. Auth.js with JWT sessions means the session lives in an encrypted cookie — there's no database to stand up, no schema to write, no Prisma to configure.

### The Configuration

Auth.js v5 uses a single config file. The entire thing:

```typescript
// src/auth.ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({
    clientId: process.env.AUTH_GOOGLE_ID!,
    clientSecret: process.env.AUTH_GOOGLE_SECRET!,
  })],
  session: { strategy: "jwt" },
  callbacks: {
    signIn({ profile }) {
      if (!profile?.email) return false
      return ALLOWED_EMAILS.includes(profile.email.toLowerCase())
    },
    authorized({ auth, request: { nextUrl } }) {
      if (nextUrl.pathname.startsWith("/projects")) return !!auth?.user
      return true
    },
  },
})
```

Two callbacks do all the work:

- **`signIn`** — fires when someone completes Google login. Checks the email against the whitelist. Returns `false` to reject, `true` to allow. That's it. No database, no user table.
- **`authorized`** — fires on every request via middleware. Checks if the requested path needs auth, and whether the session has a user. This is what makes `/projects/*` private.

The middleware is two lines:

```typescript
// src/middleware.ts
export { auth as default } from "@/auth"
export const config = { matcher: ["/projects/:path*"] }
```

The `matcher` tells Next.js which routes to run the middleware on. Without this, the `authorized` callback would run on every single request — including static assets — which is wasteful.

### The API Route

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth"
export const { GET, POST } = handlers
```

That's the entire file. Auth.js handles all the OAuth dance — redirecting to Google, receiving the callback, validating the code, creating the JWT, setting the cookie.

### Environment Variables

```bash
AUTH_SECRET=<random 32+ char string>    # JWT encryption key
AUTH_GOOGLE_ID=<from Google Console>    # OAuth client ID
AUTH_GOOGLE_SECRET=<from Google Console> # OAuth client secret
AUTH_TRUST_HOST=true                    # Required on Vercel — tells Auth.js to trust X-Forwarded-Host
ALLOWED_EMAILS=you@gmail.com,other@gmail.com
```

Generate `AUTH_SECRET` with `openssl rand -base64 32`.

`AUTH_TRUST_HOST=true` is critical on Vercel. Without it, Auth.js can't correctly infer the callback URL from behind Vercel's proxy infrastructure.

---

## Part 2: The Dashboard Architecture

### Why Server-Side Proxy Routes?

The dashboard at `/projects/usage` needs to call nine external APIs. I could call those APIs directly from the browser — but that would expose the API keys. Instead, the pattern is:

```
Browser → /api/usage/tavily (server route) → Tavily API
Browser → /api/usage/azure (server route) → Azure API
...
```

The server routes hold the API keys in environment variables. The browser never sees them. Each route also checks for a valid session before doing anything:

```typescript
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // ... call external API
}
```

This double-layer of protection means that even if someone finds the API URL, they still can't use it without an active session cookie.

### The Frontend

`/projects/usage/page.tsx` is a client component (`"use client"`) that fetches from all nine routes on mount:

```typescript
useEffect(() => {
  fetchData()
}, [])

async function fetchData() {
  const [tavily, vercel, render, ...] = await Promise.allSettled([
    fetch("/api/usage/tavily").then(r => r.json()),
    fetch("/api/usage/vercel").then(r => r.json()),
    fetch("/api/usage/render").then(r => r.json()),
    // ...
  ])
}
```

`Promise.allSettled` is the right choice here — unlike `Promise.all`, it doesn't fail-fast. If one API is down, the other eight still load. The dashboard handles each card's loading/error state independently.

Each card shows:

- A progress meter (green < 50%, amber 50–80%, red > 80%)
- Current usage vs. limit
- A burn rate banner ("On track" or "⚠ Will exhaust by March 18")
- A link to the service's dashboard

The layout is a 3-column CSS grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`) with a max width of `max-w-7xl` — wide enough that all nine cards don't feel cramped.

---

## Part 3: The API Integrations

This is where it gets interesting. Every service has a different opinion about how APIs should work.

### Tavily — The Gold Standard

Tavily's usage API is what I wish every API looked like:

```bash
curl -H "Authorization: Bearer $TAVILY_API_KEY" \
  https://api.tavily.com/usage
```

Returns:

```json
{
  "key": {
    "plan": "Starter",
    "plan_usage": 340,
    "plan_limit": 1000,
    "usage_type": "credits"
  },
  "account": {
    "plan_usage": 340,
    "plan_limit": 1000,
    "breakdown": {
      "search": 280,
      "extract": 60
    }
  }
}
```

Two API keys, each returning their own usage. Breakdown by feature type. Clean, versioned, documented. The only quirk: the API has eventual consistency with the dashboard — it can lag by several minutes. The fix is to set `cache: "no-store"` so you're not serving stale data from a cached stale response.

One note on the `breakdown` object: the keys (`search`, `extract`, `crawl`, `map`, `research`) map directly to the Tavily operations. This is useful for understanding what's eating your credits — I discovered 80% of my usage was `search`, which led me to batch some queries.

### Burn Rate Projections

The most useful feature of the Tavily card — and later, Turso, Azure, and The Odds API — is the month-end projection. The math:

```typescript
const now = new Date()
const dayOfMonth = now.getDate()                                          // e.g., 15
const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() // e.g., 28
const daysRemaining = daysInMonth - dayOfMonth                            // e.g., 13

const dailyRate = usedSoFar / dayOfMonth                                  // credits per day
const projected = usedSoFar + dailyRate * daysRemaining                   // estimated month-end

if (projected > limit) {
  const burnoutDay = Math.floor(dayOfMonth + (limit - usedSoFar) / dailyRate)
  // "Will exhaust around March 18"
}
```

It's linear extrapolation, which is wrong — usage is actually bursty, not uniform. A heavy research day might burn 50 credits while a quiet day burns 2. A rolling 7-day average would be more accurate, but that requires storing historical data somewhere. The linear version is good enough for "will I probably run out this month?" and costs zero infrastructure.

The UI shows a green banner ("On track for X/1000") or a red warning ("⚠ At this rate, you'll exhaust credits around March 18").

### OpenRouter — Also Clean

```bash
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/credits
```

Returns `{ data: { total_credits, total_usage } }`. Calculate `remaining = total_credits - total_usage`. That's the whole integration. Took about ten minutes.

### Render — Known Limits + Live Service Status

Render's API doesn't expose usage data directly. There's no billing or quota endpoint. What it *does* expose is a services list:

```bash
curl -H "Authorization: Bearer $RENDER_API_KEY" \
  https://api.render.com/v1/services?limit=20
```

The response wraps each service in an extra object: `[{ service: { id, name, type, plan, suspended, ... } }, ...]`. You have to unwrap it:

```typescript
const services = data.map((item: { service: RenderService }) => item.service)
```

The card shows each service's name, type, and a green/amber dot for running/suspended status. The free-tier limits (750 instance-hours, 100 GB bandwidth, 500 build minutes) are hardcoded constants — Render doesn't expose them via API.

Render has a bandwidth endpoint (`/v1/bandwidth`) but it's undocumented and may not work on all plans. I call it with a try/catch and silently skip it if it fails.

### Vercel — JSONL and Graceful Fallback

Vercel's billing API returns data in JSONL format — newline-delimited JSON, where each line is a separate JSON object. This is an unusual format you won't encounter often:

```typescript
const text = await response.text()
const lines = text.split("\n").filter(line => line.trim())
const records = lines.map(line => JSON.parse(line))
```

The billing API is mainly useful for Pro/Enterprise plans. On Hobby (free), it often returns empty. The card gracefully falls back to hardcoded Hobby limits and shows a note explaining why the numbers might be zeros.

### The Odds API — Headers as Data

This one surprised me. The Odds API doesn't have a dedicated usage endpoint. Instead, usage information comes from **response headers** on every API call:

```bash
curl "https://api.the-odds-api.com/v4/sports/?apiKey=$ODDS_API_KEY"
# Response headers include:
# x-requests-used: 47
# x-requests-remaining: 453
```

The server route just calls the lightest available endpoint (`/v4/sports/`) to trigger a response, then reads the headers:

```typescript
const res = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${apiKey}`)
const used = parseInt(res.headers.get("x-requests-used") ?? "0")
const remaining = parseInt(res.headers.get("x-requests-remaining") ?? "0")
const limit = used + remaining
```

It's actually elegant — you're always getting fresh usage data alongside whatever data you're already requesting, with no extra round trip. The downside: to check usage, you have to make a real API call.

### Turso — Row-Level SQLite Usage

Turso is an edge SQLite database. Their organization usage API is well-designed:

```bash
curl -H "Authorization: Bearer $TURSO_API_TOKEN" \
  https://api.turso.tech/v1/organizations/$TURSO_ORG_SLUG/usage
```

Returns detailed breakdowns at the org level and per-database:

```json
{
  "organization": {
    "usage": {
      "rows_read": 1240000,
      "rows_written": 8500,
      "storage_bytes": 45000000,
      "bytes_synced": 12000,
      "databases": 3,
      "groups": 1,
      "locations": 1
    },
    "databases": [
      { "uuid": "...", "rows_read": 800000, ... }
    ]
  }
}
```

The card tracks rows read (limit: 1B on Starter), rows written (limit: 25M), and storage (limit: 9GB). Rows read is the primary concern for read-heavy apps — burn rate projection targets that metric.

`bytes_synced` is Turso's replication metric — data synced to edge locations. It's not billed on the Starter plan, but it's good visibility into what your replicas are doing.

### Azure — Two APIs, Two Auth Methods

Azure was the most complex integration. The challenge: Azure has two different billing API designs depending on account type.

**Authentication** uses OAuth2 client credentials flow. No user login — just service principal credentials:

```typescript
// Step 1: Get access token
const tokenRes = await fetch(
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://management.azure.com/.default",
    }),
  }
)
const { access_token } = await tokenRes.json()
```

**Credits API** (for MCA billing profiles):

```
GET https://management.azure.com/providers/Microsoft.Billing/billingAccounts/{id}/
    billingProfiles/{id}/providers/Microsoft.Consumption/credits/balanceSummary
    ?api-version=2024-08-01
```

**Cost Management Query** (for student subscriptions):
```typescript
const body = {
  type: "ActualCost",
  timeframe: "Custom",
  timePeriod: {
    from: startOfMonth.toISOString(),
    to: now.toISOString(),
  },
  dataset: {
    granularity: "None",
    aggregation: { totalCost: { name: "Cost", function: "Sum" } },
  },
}
// POST to /subscriptions/{id}/providers/Microsoft.CostManagement/query
```

The Cost Management query returns `properties.rows` — an array where the first column is the cost value. The $100 student credit limit is hardcoded (there's no API to query remaining student credit balance; you can only query spend).

Required environment variables:

```bash
AZURE_TENANT_ID
AZURE_CLIENT_ID
AZURE_CLIENT_SECRET
AZURE_SUBSCRIPTION_ID
AZURE_BILLING_ACCOUNT_ID   # optional, for credits API
AZURE_BILLING_PROFILE_ID   # optional, for credits API
```

### GCP — RSA Key Signing with JOSE

Google Cloud doesn't use simple bearer tokens for server-to-server auth. You need a **service account** — a JSON key file containing an RSA private key. The authentication flow:

1. Parse the service account JSON from an environment variable
2. Build a JWT with specific claims
3. Sign it with the private key using RS256
4. Exchange the JWT for a short-lived access token

The tricky part is step 3 — signing RSA in Node.js. I used `jose` (JSON Object Signing and Encryption), which happens to be a transitive dependency of `next-auth`, meaning zero new packages:

```typescript
import { SignJWT, importPKCS8 } from "jose"

const sa = JSON.parse(Buffer.from(process.env.GCP_SERVICE_ACCOUNT_KEY!, "base64").toString("utf-8"))
const key = await importPKCS8(sa.private_key, "RS256")

const now = Math.floor(Date.now() / 1000)
const jwt = await new SignJWT({
  iss: sa.client_email,
  sub: sa.client_email,
  scope: "https://www.googleapis.com/auth/cloud-billing.readonly",
  aud: "https://oauth2.googleapis.com/token",
  iat: now,
  exp: now + 3600,
})
  .setProtectedHeader({ alg: "RS256", typ: "JWT" })
  .sign(key)

// Exchange JWT for access token
const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  }),
})
const { access_token } = await tokenRes.json()
```

**Why base64 for the service account key?** The JSON key file contains a PEM private key with literal `\n` newline characters. Environment variables don't handle newlines cleanly across all platforms (shell escaping, `.env` parsing, Vercel dashboard). Base64-encoding the whole JSON file makes it a single safe string:

```bash
# Encode once
cat key.json | base64 | tr -d '\n'

# Decode in code
const sa = JSON.parse(Buffer.from(env, "base64").toString("utf-8"))
```

The GCP card shows billing accounts (active/closed) and linked projects. Actual dollar amounts require setting up BigQuery billing export — a much heavier lift. For now, this tells me which projects are live and billable.

### Venice AI — Currency by a Different Name

Venice AI uses a proprietary token called **DIEM** (an epoch-based allocation that resets on a schedule) plus USD for top-ups. Their billing balance API:

```bash
curl -H "Authorization: Bearer $VENICE_API_KEY" \
  https://api.venice.ai/api/v1/billing/balance
```

Returns:

```json
{
  "balances": { "diem": 850, "usd": 0.00 },
  "diemEpochAllocation": 1000,
  "consumptionCurrency": "diem",
  "canConsume": true
}
```

The usage meter shows `diemEpochAllocation - balances.diem` as "used". If `canConsume` is `false`, the status indicator turns red. USD balance only shows when > 0.

I initially tried to use Venice's models list endpoint as a proxy for "connected" status (the first iteration of this card). After realizing there was an actual billing API, I switched to it — cleaner data, more useful information.

---

## Part 4: The Bugs

### Bug 1: `/project` vs `/projects`

I built everything under `/project` (singular). When I typed the URL to test it, I typed `/projects` (plural). 404.

After a moment of "wait, what did I even name it?", I realized the answer was obvious: rename it. URLs are UX. The URL you type without thinking about it is the right URL.

This also required updating the `middleware.ts` matcher:
```typescript
// Before
matcher: ["/project/:path*"]

// After
matcher: ["/projects/:path*"]
```

Easy to miss. Easy to get wrong. The matcher is a string pattern, not linked to the filesystem.

### Bug 2: ESLint and Next.js's Native Elements

Next.js's build will fail if you use bare `<a>` or `<img>` tags instead of the framework's optimized versions. The errors look like:

```
Error: Do not use `<a>` to navigate. Use Link from `next/link` instead.
Error: Do not use `<img>`. Use Image from `next/image` instead.
```

`<Link>` handles client-side navigation and prefetching. `<Image>` handles lazy loading, responsive sizing, and format optimization. Using the native elements means opting out of all that for no benefit.

For `<Image>`, external domains need to be explicitly allowed in `next.config.ts`:

```typescript
images: {
  remotePatterns: [
    { hostname: "lh3.googleusercontent.com" }, // Google profile images
  ],
},
```

Without this, Next.js will refuse to optimize external images as a security measure.

### Bug 3: The Hydration Mismatch

Two hydration issues appeared in the dev console.

**The first** wasn't my code at all. The warning was about a `jf-ext-button-ct` attribute appearing on button elements. This is a browser extension injecting DOM attributes between when the server sends HTML and when React tries to hydrate it. React's hydration process compares the server-rendered DOM with what the client would render — if they differ by even one attribute, you get a warning.

The lesson: not every hydration warning is your bug. Browser extensions, password managers, and accessibility tools all modify the DOM. This one was cosmetic noise.

**The second** was real:

```typescript
// Bug: server renders at time T, client hydrates at time T+1
// They produce different toLocaleTimeString() output → mismatch
const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

// Fix: null on server, populated on client after mount
const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

useEffect(() => {
  setLastRefresh(new Date())
}, [])
```

The rule: never put time-dependent, random, or environment-specific values in initial state for server-rendered components. The server renders at deployment time (or request time, for SSR). The client hydrates milliseconds later. Those aren't the same moment, and `new Date()` will produce different strings.

Use `null` as the initial value and populate it in `useEffect`, which only runs on the client after hydration.

### Bug 4: redirect_uri_mismatch

This was the ugliest one. After deploying and clicking "Sign in with Google" on the real domain, I got:

```
Error 400: redirect_uri_mismatch
The redirect URI in the request did not match.
```

Here's what happened. Auth.js infers the OAuth callback URL from the incoming request's `Host` header. On Vercel, with `AUTH_TRUST_HOST=true`, it trusts that header. The browser hit `www.kevinc.dev` — and Auth.js correctly used `www.kevinc.dev` as the callback URL. But in Google Cloud Console, I had only registered `kevinc.dev` (no `www`).

```
Registered: https://kevinc.dev/api/auth/callback/google        ← not a match
Actual:     https://www.kevinc.dev/api/auth/callback/google    ← what Google received
```

OAuth redirect URIs are **exact string comparisons**. `www.example.com` and `example.com` are different strings. Google sees them as different origins.

The investigation: the browser URL bar showed `callbackUrl=https%3A%2F%2Fwww.kevinc.dev%2Fprojects`. The `www` was right there, encoded in the URL. This is always the first place to look.

The fix I applied: add every possible variant to Google Console. For three domains (kevinc.dev, kevin-chen.dev, k3vnc.dev), that's:

- `https://kevinc.dev/api/auth/callback/google`
- `https://www.kevinc.dev/api/auth/callback/google`
- `https://kevin-chen.dev/api/auth/callback/google`
- `https://www.kevin-chen.dev/api/auth/callback/google`
- `https://k3vnc.dev/api/auth/callback/google`
- `https://www.k3vnc.dev/api/auth/callback/google`
- `http://localhost:3000/api/auth/callback/google`

Seven redirect URIs. The cleaner long-term fix is configuring Vercel to redirect `www` → non-www at the edge, so there's only one canonical host that OAuth ever sees. That's a one-line config in `vercel.json`:

```json
{
  "redirects": [
    {
      "source": "/:path*",
      "has": [{ "type": "host", "value": "www.kevinc.dev" }],
      "destination": "https://kevinc.dev/:path*",
      "permanent": true
    }
  ]
}
```

**The lesson, for real this time**: OAuth redirect URIs are exact-match string comparisons. When you deploy to a new environment, test from the exact URL a user would arrive at — not localhost, not the Vercel preview URL, the actual production domain. And include `www` in your Google Console registrations or set up a canonical redirect.

---

## Part 5: API Design Patterns in the Wild

Building nine integrations gave me an involuntary tour of how different teams think about API design. Here's the taxonomy:

| Service | Auth | Usage Endpoint | Data Quality |
|---|---|---|---|
| **OpenRouter** | Bearer token | `GET /api/v1/credits` | ✅ Two fields, perfect |
| **Tavily** | Bearer token | `GET /usage` | ✅ Rich breakdown, eventually consistent |
| **The Odds API** | Query param | Any endpoint (headers) | ✅ Always fresh, unusual delivery |
| **Turso** | Bearer token | `GET /v1/organizations/{slug}/usage` | ✅ Per-database breakdown |
| **Venice AI** | Bearer token | `GET /api/v1/billing/balance` | ✅ DIEM + USD balances |
| **Render** | Bearer token | No usage endpoint | ⚠️ Services only, limits hardcoded |
| **GCP** | Service account JWT | Billing accounts, not cost data | ⚠️ Structure without numbers |
| **Azure** | OAuth2 client credentials | Cost Management query | ⚠️ Complex, requires multiple env vars |
| **Vercel** | Bearer token | Charges (JSONL!) | ⚠️ Limited on Hobby plan |
| **GitHub Copilot** | N/A | No individual user API | ❌ IDE-level token only |
| **Anthropic** | Admin key | Org-level only | ❌ Not available for individual accounts |

A few patterns stand out:

**Headers as a data channel** (The Odds API): Every response carries usage metadata in `x-requests-used` / `x-requests-remaining`. You get quota data for free alongside your actual data. No extra round trip. I'd never seen this before — and I genuinely like it.

**Proprietary currencies** (Venice AI): DIEM tokens with epoch-based allocation and USD as an overflow currency. Epoch-based means "you get a fresh allocation every N days." This is a clever way to prevent hoarding and ensure active users always have resources.

**The JWT auth ceremony** (GCP): Four steps, one RSA-signed assertion, and a short-lived access token you have to cache. It's the right architecture for machine-to-machine auth that's not a simple API key — but it's 40 lines of code instead of 2.

**Fallback to known limits** (Vercel, Render): When the API doesn't expose what you need, hardcode the public limits from the docs. It's not real-time data, but it gives the user a frame of reference. A dashboard that says "Hobby plan: 1M edge requests" is more useful than a dashboard that says nothing.

---

## Replicating This Project

Here's the exact setup checklist:

### 1. Prerequisites

```bash
npx create-next-app@latest my-site --typescript --tailwind --app
cd my-site
npm install next-auth@beta jose
```

### 2. Google OAuth Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → APIs & Services → Credentials → Create OAuth Client ID
3. Application type: **Web application**
4. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://yourdomain.com/api/auth/callback/google`

Copy the Client ID and Client Secret.

### 3. Auth Configuration

Create `src/auth.ts` with the config from Part 1. Create `src/middleware.ts`:

```typescript
export { auth as default } from "@/auth"
export const config = { matcher: ["/projects/:path*"] }
```

Create `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/auth"
export const { GET, POST } = handlers
```

### 4. Environment Variables

`.env.local`:

```bash
AUTH_SECRET=<openssl rand -base64 32>
AUTH_GOOGLE_ID=<from Google Console>
AUTH_GOOGLE_SECRET=<from Google Console>
AUTH_TRUST_HOST=true
ALLOWED_EMAILS=your@email.com

# API keys for whatever services you use
TAVILY_API_KEY=tvly-...
OPENROUTER_API_KEY=sk-or-...
```

### 5. Protected API Route Pattern

```typescript
// src/app/api/usage/[service]/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/auth"

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.SERVICE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 })
  }

  const res = await fetch("https://api.service.com/usage", {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  })

  const data = await res.json()
  return NextResponse.json(data)
}
```

### 6. Dashboard Page Pattern

```typescript
// src/app/projects/usage/page.tsx
"use client"
import { useEffect, useState } from "react"

export default function UsagePage() {
  const [tavilyData, setTavilyData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      const [tavily] = await Promise.allSettled([
        fetch("/api/usage/tavily").then(r => r.json()),
      ])
      if (tavily.status === "fulfilled") setTavilyData(tavily.value)
      setLoading(false)
    }
    fetchAll()
  }, [])

  // render cards
}
```

### 7. Deploy to Vercel

```bash
npx vercel --prod
```

Set all environment variables in the Vercel dashboard (Settings → Environment Variables). Add the production callback URL to Google Console. Test from the actual production URL — not just localhost.

---

## What I'd Do Differently

**Burn rate accuracy**: Linear extrapolation assumes uniform daily usage, which is false. A rolling 7-day average would give better signal. But it requires persisting historical snapshots somewhere, and I deliberately avoided any database for this project. A KV store (Vercel KV, Upstash) would be the minimal footprint solution.

**www redirect**: I should have set up `www` → non-www before deploying to a production domain, not after hitting `redirect_uri_mismatch`. Two minutes of config would have saved two hours of OAuth debugging.

**Auto-polling**: The dashboard requires a manual refresh. A `setInterval` in `useEffect` polling every 60 seconds would make it feel alive without any infrastructure changes.

**Error granularity**: The current error states show "Error loading" without much detail. Adding HTTP status codes and specific error messages to the card error state would speed up debugging when an API key rotates or an endpoint changes.

---

## The Thing I Didn't Expect

I expected the OAuth setup to be the hard part. It wasn't — Auth.js makes it genuinely easy, and once you understand that redirect URIs are exact-match string comparisons, the `redirect_uri_mismatch` bug becomes obvious to diagnose.

The actually interesting part was discovering how different every API's relationship with "usage data" is. OpenRouter has two clean fields. The Odds API puts it in headers. Azure requires navigating three different API namespaces and an OAuth2 dance just to get your current spend. GCP makes you sign RSA-encoded JWTs. Venice uses a token economy with epoch resets.

There's no standard here. Every API reflects the team that built it, the constraints they were under, and the assumptions they made about who would use it. Building integrations is partly software engineering and partly anthropology.

The dashboard now tells me, at a glance, whether I'm on track across all the services I actively use. That's the thing I'll actually open again tomorrow. The auth was the means; the visibility was the point.

### Example request I made to Copilot

Can you look at the on track logic for tavily, odds api, and turso and see if you could apply it to venice ai. And pipe your findings to kevinc-project    │
│     skill. And always use UNIX commands for docs. and your native tools for code. Cause usually the terminal breaks when you try to edit non code related      │
│     docs. And use the tavily tool to see if you could make an example google tts tool in the tools section in /projects using the gemini 2.5 flash Gacrux      │
│     voice. It should be a general speech section. and there are three "tabs". Follow the kevinc-design skill and the components.md and guidelines. But also,   │
│     feel free to remain creative too. Just let me know when you diverge from the design guidelines in the code as comments detailing the reasoning why you     │
│     diverged from the guidelines. The first tab is TTS. Second tab is STT using voxtral realtime 2. and as an option, voxtral transcribe 2. And third tab uses │
│      microsoft's pronunciation api  