---
name: kevinc-project
description: Architecture and infrastructure context for the KevinC.dev portfolio site. Use when modifying auth, API routes, middleware, environment config, protected pages, or deployment. Also use when adding new /projects/* pages, new API proxy routes, or modifying the authentication flow. Complements kevinc-design (which covers visual patterns).
---

# KevinC.dev Project Architecture

Personal portfolio at **kevinc.dev** (+ kevin-chen.dev, k3vnc.dev). Next.js 16 App Router on Vercel, `dia-design` branch.

## Repository Layout

```
homepage/                    # Next.js app root (run all commands here)
├── src/
│   ├── auth.ts              # Auth.js v5 config (Google OAuth, JWT, email whitelist)
│   ├── proxy.ts             # Next.js 16 route protection for /projects/* and /tools/*
│   ├── lib/secrets.ts       # Runtime secret overrides (Turso-backed, encrypted)
│   └── app/
│       ├── page.tsx          # Public homepage (resume/portfolio)
│       ├── globals.css       # Aurora, blur animations, dark mode vars, status overrides
│       ├── components/       # Shared: AuroraBackground, BackButton, ProfileMenu, ThemeProvider, ThemeToggle, etc.
│       ├── auth/signin/      # Custom Google sign-in page
│       ├── projects/         # Protected project hub
│       │   ├── page.tsx      # Hub with card navigation
│       │   ├── layout.tsx    # Header with user info, sign-out, back nav (BackButton)
│       │   ├── usage/        # API usage monitoring dashboard
│       │   └── tools/        # Tools & utilities sub-hub
│       │       ├── page.tsx  # Tools hub with card navigation
│       │       └── speech/   # Speech Lab (TTS, STT, Pronunciation)
│       └── api/
│           ├── auth/[...nextauth]/  # Auth.js handler (2 lines)
│           ├── secrets/      # Runtime secret override API for /tools/secrets
│           ├── usage/        # Server-side API proxies (tavily, vercel, render, etc.)
│           │   ├── history/  # Snapshot-backed daily usage history for burn-rate projections
│           └── speech/       # Speech tool API proxies
│               ├── tts/      # Gemini 2.5 Flash TTS (POST, GEMINI_API_KEY)
│               ├── stt/      # Voxtral Transcribe/Realtime 2 (POST, MISTRAL_API_KEY)
│               └── pronunciation/  # Azure Speech pronunciation (POST, AZURE_SPEECH_KEY)
├── .env.local               # Local env vars (gitignored)
└── next.config.ts           # Image remote patterns, etc.
docs/                        # Local retrospectives (gitignored)
CLAUDE.md                    # Flat project context file
```

## Authentication

Auth.js v5 (`next-auth@beta`) with Google OAuth, JWT sessions (no database).

**Key patterns:**
- `src/auth.ts` exports `{ handlers, auth, signIn, signOut }`
- Email whitelist in `signIn` callback reads `ALLOWED_EMAILS` env var
- `authorized` callback runs via `src/proxy.ts` on `/projects/*` and `/tools/*`
- Unauthenticated users redirect to `/auth/signin`
- `AUTH_TRUST_HOST=true` required for multi-domain Vercel deployment

**Adding a new protected route:** Put it under `src/app/projects/` or `src/app/tools/` and ensure `src/proxy.ts` plus `auth.ts`'s `authorized` callback both match the new path family.

## Runtime Secrets

API keys can be overridden at runtime via `/tools/secrets` without a redeploy.

**Key patterns:**
- `src/lib/secrets.ts` exposes `getSecret()` which checks Turso overrides first, then `process.env`
- Overrides are encrypted at rest using a key derived from `AUTH_SECRET`
- `/api/secrets` manages the overrides for authenticated users
- After a successful save, `/api/secrets` can also upsert the same key into Vercel project envs when `VERCEL_API_TOKEN` and `VERCEL_PROJECT_ID` (or `VERCEL_PROJECT_NAME`) are configured
- Use `getSecret("KEY_NAME")` in API routes instead of reading `process.env.KEY_NAME` directly when the value may be rotated via the UI

## API Routes

### Usage Proxies (`/api/usage/*`)

All follow the same GET pattern with auth check:

```typescript
import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const apiKey = await getSecret("SERVICE_API_KEY")
  // Fetch from external API using runtime override or env var token
  // Return proxied data
}
```

Services with on-track/burn-rate logic on the dashboard:
- **Tavily** — monthly credits with plan limit
- **GitHub** — Codespaces usage + Copilot premium requests via personal billing endpoints
- **Usage snapshots** — daily cumulative totals persisted to Turso and read back through `/api/usage/history`
- **Turso** — rows read/written against Starter plan limits
- **Odds API** — request count against monthly limit
- **Venice AI** — DIEM epoch allocation vs remaining balance
- **Azure** — student credit balance with cost projection
- **OpenRouter** — prepaid credits usage
- **Render** — service inventory plus month-to-date bandwidth via `/v1/metrics/bandwidth`

Add `next: { revalidate: 60 }` to fetch options for caching.

### Speech Tool Proxies (`/api/speech/*`)

All follow POST pattern with auth check + request body/formData:

- **`/api/speech/tts`** — Gemini 2.5 Flash TTS (`gemini-2.5-flash-preview-tts`)
  - Body: `{ text, voice?, instructions? }`
  - Voice default: `Gacrux` (30 available voices)
  - Returns: `{ audio: base64, mimeType }`
  - Env: `GEMINI_API_KEY`

- **`/api/speech/stt`** — Mistral Voxtral transcription
  - FormData: `audio` (file), `model?`
  - Models: `voxtral-mini-transcribe-2602` (batch, default), `voxtral-mini-transcribe-realtime-2602` (streaming)
  - Returns: `{ text, segments? }`
  - Env: `MISTRAL_API_KEY`

- **`/api/speech/pronunciation`** — Azure Speech pronunciation assessment
  - FormData: `audio` (file), `referenceText`, `language?`
  - Returns: Azure NBest assessment (AccuracyScore, FluencyScore, etc.)
  - Env: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`

## Environment Variables

See [references/env-and-deploy.md](references/env-and-deploy.md) for full list and deployment details.

Required: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_TRUST_HOST`, `ALLOWED_EMAILS`

Optional (usage dashboard):
- `TAVILY_API_KEY`, `VERCEL_API_TOKEN`, `RENDER_API_KEY`
- `VERCEL_PROJECT_ID`, `VERCEL_PROJECT_NAME`, `VERCEL_TEAM_ID`, `VERCEL_TEAM_SLUG`
- `GITHUB_PAT`, `GITHUB_USERNAME`
- `GCP_BILLING_EXPORT_PROJECT_ID`, `GCP_BILLING_EXPORT_DATASET`
- `OPENROUTER_API_KEY`, `ODDS_API_KEY`, `VENICE_API_KEY`
- `TURSO_API_TOKEN`, `TURSO_ORG_SLUG`
- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
- `GCP_KEY_JSON`

Optional (speech tools):
- `GEMINI_API_KEY` — Google AI API key for TTS
- `MISTRAL_API_KEY` — Mistral API key for Voxtral STT
- `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` — Azure Speech Service for pronunciation

## Tech Stack

- Next.js 16 (App Router, TypeScript, Turbopack dev)
- Tailwind CSS v4 (`@tailwindcss/postcss`)
- Framer Motion (animations)
- Auth.js v5 (`next-auth@5.0.0-beta.30`)
- No database — JWT sessions in encrypted cookies

## Theming

Class-based dark mode: `.dark` on `<html>`, managed by `ThemeProvider`.

**Architecture:**
1. Inline `<script>` in `<head>` reads `localStorage('theme')` before paint → prevents flash
2. `ThemeProvider` (client component) wraps entire app in root `layout.tsx`
3. CSS variables in `globals.css` swap between `:root` and `.dark`
4. `ThemeToggle` component on homepage (fixed top-right)
5. `ProfileMenu` dropdown has theme toggle on projects pages

**Adding a new themed surface:** Use `bg-glass`, `border-glass-border`, `text-foreground` etc. 
Never use hardcoded `bg-white`, `text-gray-N`, or `bg-black`. See kevinc-design skill for full var list.

## Branches

- **`dia-design`** — Active development, deployed to Vercel with SSR
- **`main`** — Legacy static export to GitHub Pages

## Common Tasks

**Add a new protected page:**
1. Create `src/app/projects/<name>/page.tsx`
2. If it's under `/projects/*` or `/tools/*`, make sure `src/proxy.ts` and `auth.ts` already cover that path family

**Add a new tool to the Tools hub:**
1. Create `src/app/projects/tools/<name>/page.tsx` for the UI
2. Create `src/app/api/<name>/route.ts` (or appropriate api path) for the backend proxy
3. Add a card to `src/app/projects/tools/page.tsx`

**Add a new API proxy route:**
1. Create `src/app/api/usage/<service>/route.ts`
2. Follow the auth-check pattern above
3. Fetch secrets via `getSecret()` so runtime overrides work
4. If the route feeds burn-rate UI, record a daily cumulative total in `src/lib/usageSnapshots.ts`
5. Add a card to `src/app/projects/usage/page.tsx`

**Add a new OAuth callback domain:**
1. Register URI in Google Cloud Console: `https://<domain>/api/auth/callback/google`
2. `AUTH_TRUST_HOST=true` handles the rest

## ESLint Rules

- Use `<Link>` not `<a>` for internal navigation
- Use `<Image>` not `<img>` — add external domains to `next.config.ts` `images.remotePatterns`

## References

- **Env vars & deployment**: See [references/env-and-deploy.md](references/env-and-deploy.md)
