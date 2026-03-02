---
name: kevinc-project
description: Architecture and infrastructure context for the KevinC.dev portfolio site. Use when modifying auth, API routes, middleware, environment config, protected pages, or deployment. Also use when adding new /projects/* pages, new API proxy routes, or modifying the authentication flow. Complements kevinc-design (which covers visual patterns).
---

# KevinC.dev Project Architecture

Personal portfolio at **kevinc.dev** (+ kevin-chen.dev, k3vnc.dev). Next.js 15 App Router on Vercel, `dia-design` branch.

## Repository Layout

```
homepage/                    # Next.js app root (run all commands here)
├── src/
│   ├── auth.ts              # Auth.js v5 config (Google OAuth, JWT, email whitelist)
│   ├── middleware.ts         # Route protection for /projects/*
│   └── app/
│       ├── page.tsx          # Public homepage (resume/portfolio)
│       ├── globals.css       # Aurora, blur animations, base styles
│       ├── components/       # Shared components (AuroraBackground, BackButton, ProjectCard, etc.)
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
│           ├── usage/        # Server-side API proxies (tavily, vercel, render, etc.)
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
- `authorized` callback runs via middleware on `/projects/*`
- Unauthenticated users redirect to `/auth/signin`
- `AUTH_TRUST_HOST=true` required for multi-domain Vercel deployment

**Adding a new protected route:** Just add it under `src/app/projects/` — middleware already matches `/projects/:path*`.

## API Routes

### Usage Proxies (`/api/usage/*`)

All follow the same GET pattern with auth check:

```typescript
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // Fetch from external API using env var token
  // Return proxied data
}
```

Services with on-track/burn-rate logic on the dashboard:
- **Tavily** — monthly credits with plan limit
- **Turso** — rows read/written against Starter plan limits
- **Odds API** — request count against monthly limit
- **Venice AI** — DIEM epoch allocation vs remaining balance
- **Azure** — student credit balance with cost projection
- **OpenRouter** — prepaid credits usage

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
- `OPENROUTER_API_KEY`, `ODDS_API_KEY`, `VENICE_API_KEY`
- `TURSO_API_TOKEN`, `TURSO_ORG_SLUG`
- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
- `GCP_KEY_JSON`

Optional (speech tools):
- `GEMINI_API_KEY` — Google AI API key for TTS
- `MISTRAL_API_KEY` — Mistral API key for Voxtral STT
- `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` — Azure Speech Service for pronunciation

## Tech Stack

- Next.js 15 (App Router, TypeScript, Turbopack dev)
- Tailwind CSS v4 (`@tailwindcss/postcss`)
- Framer Motion (animations)
- Auth.js v5 (`next-auth@5.0.0-beta.30`)
- No database — JWT sessions in encrypted cookies

## Branches

- **`dia-design`** — Active development, deployed to Vercel with SSR
- **`main`** — Legacy static export to GitHub Pages

## Common Tasks

**Add a new protected page:**
1. Create `src/app/projects/<name>/page.tsx`
2. It's automatically protected by middleware — no config needed

**Add a new tool to the Tools hub:**
1. Create `src/app/projects/tools/<name>/page.tsx` for the UI
2. Create `src/app/api/<name>/route.ts` (or appropriate api path) for the backend proxy
3. Add a card to `src/app/projects/tools/page.tsx`

**Add a new API proxy route:**
1. Create `src/app/api/usage/<service>/route.ts`
2. Follow the auth-check pattern above
3. Add env var for the service token
4. Add a card to `src/app/projects/usage/page.tsx`

**Add a new OAuth callback domain:**
1. Register URI in Google Cloud Console: `https://<domain>/api/auth/callback/google`
2. `AUTH_TRUST_HOST=true` handles the rest

## ESLint Rules

- Use `<Link>` not `<a>` for internal navigation
- Use `<Image>` not `<img>` — add external domains to `next.config.ts` `images.remotePatterns`

## References

- **Env vars & deployment**: See [references/env-and-deploy.md](references/env-and-deploy.md)
