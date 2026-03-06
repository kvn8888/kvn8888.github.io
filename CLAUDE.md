# KevinC.dev — Project Context

## Overview

Personal portfolio/resume site for Kevin C at **kevinc.dev** (also kevin-chen.dev, k3vnc.dev).
Built with **Next.js 16** (App Router), **Tailwind v4**, **Framer Motion**, deployed on **Vercel**.

## Repository Structure

- `homepage/` — The Next.js application (all source code lives here)
- `docs/` — Local retrospectives/journey docs (gitignored, not deployed)
- `.github/workflows/` — GitHub Actions (deploys `main` branch to GitHub Pages as static export)

## Branches

- **`main`** — Static export deployed to GitHub Pages (legacy)
- **`dia-design`** — Active development branch, deployed to Vercel with full SSR

## Tech Stack

- Next.js 16 (App Router, TypeScript)
- Tailwind CSS v4 (with `@tailwindcss/postcss`)
- Framer Motion for animations
- Auth.js v5 (`next-auth@beta`) for Google OAuth
- No database — JWT sessions stored in encrypted cookies

## Authentication (`/projects/*`, `/tools/*`)

- **Auth.js v5** with Google OAuth provider
- `/projects/*` and `/tools/*` are protected via Next.js proxy (`src/proxy.ts`) + `auth.ts` `authorized` callback
- Email whitelist via `ALLOWED_EMAILS` env var (comma-separated)
- Non-owner invited accounts can be limited to selected protected pages via Turso-backed `login_access_grants`
- `ALLOWED_EMAILS` owner accounts bypass page-level grants and retain full access
- The Sign-In Manager can approve full access or a multi-select set of page grants per invited email
- Matching protected API families (for example `/api/usage/*`, `/api/secrets`, `/api/logins`) are gated by the same grants in `src/proxy.ts`
- Config in `src/auth.ts`, API route at `src/app/api/auth/[...nextauth]/route.ts`
- Custom sign-in page at `src/app/auth/signin/page.tsx`

## Protected Pages

- `/projects` — Project hub with card-based navigation
- `/projects/usage` — API usage monitor dashboard (Tavily, Vercel, Render)
- `/tools` — Internal tools hub (notes, project dashboard, runtime secrets, sign-in manager)
- `/tools/sign-in-manager` — Admin UI for login approvals and page-level grant management

## API Routes

- `/api/auth/[...nextauth]` — Auth.js handlers
- `/api/secrets` — Runtime secret override management (encrypted, Turso-backed)
- `/api/usage/github` — GitHub personal billing usage (Codespaces + Copilot premium requests)
- `/api/usage/history` — Turso-backed daily usage snapshots for burn-rate projections
- `/api/usage/tavily` — Proxies Tavily usage API (live credits/limits)
- `/api/usage/vercel` — Proxies Vercel billing API (or shows known Hobby limits)
- `/api/usage/render` — Proxies Render management API (services list + bandwidth metrics)
- All `/api/usage/*` routes require auth session

## Runtime Secrets

- `/tools/secrets` now covers the full `homepage/.env.example` inventory in one registry-driven UI
- Runtime-capable entries can override values immediately; bootstrap-only entries are marked as Vercel env sync only and apply on redeploy
- `src/lib/secrets.ts` checks Turso-backed encrypted overrides first, then falls back to `process.env`
- `src/lib/managedSecrets.ts` is the source of truth for the keys and related config exposed by `/tools/secrets`
- `/api/secrets` can also mirror saved keys into Vercel preview/production envs when Vercel sync credentials are configured; the UI shows `env set` when the project env is already present
- `JOBS_TURSO_DATABASE_URL` and `JOBS_TURSO_AUTH_TOKEN` are now runtime-manageable through `getSecret()` in `src/lib/jobsDb.ts`
- Use `getSecret()` in server routes for any secret that may be rotated via the UI

## Usage Snapshots

- `src/lib/usageSnapshots.ts` stores one cumulative total per service/metric/day in Turso
- `/api/usage/history` returns the current billing period's snapshots to the dashboard
- Burn-rate cards now prefer snapshot-backed daily averages when history exists, and fall back to month-to-date/day-of-month math until enough history accumulates

## Environment Variables

Set in `.env.local` (local) and Vercel dashboard (production):

Canonical template: `homepage/.env.example`

Required auth vars:
- `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_TRUST_HOST`, `ALLOWED_EMAILS`

Common optional groups:
- Email verification: `AUTH_EMAIL_FROM`, `RESEND_API_KEY`
- Google / Gemini / GCP: `GEMINI_API_KEY`, `GCP_SERVICE_ACCOUNT_KEY`, `GCP_BILLING_EXPORT_PROJECT_ID`, `GCP_BILLING_EXPORT_DATASET`
- Azure speech / billing: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `AZURE_OPENAI_*`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SUBSCRIPTION_ID`, `AZURE_BILLING_ACCOUNT_ID`, `AZURE_BILLING_PROFILE_ID`
- Usage monitoring: `TAVILY_API_KEY`, `GITHUB_PAT`, `GITHUB_USERNAME`, `OPENROUTER_API_KEY`, `ODDS_API_KEY`, `RENDER_API_KEY`, `REPLICATE_API_TOKEN`, `VENICE_API_KEY`
- Vercel sync: `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_PROJECT_NAME`, `VERCEL_TEAM_ID`, `VERCEL_TEAM_SLUG`
- Turso: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JOBS_TURSO_DATABASE_URL`, `JOBS_TURSO_AUTH_TOKEN`, `TURSO_API_TOKEN`, `TURSO_ORG_SLUG`
- Job tracker automation: `SHEETS_WEBHOOK_URL`
- AWS / S3: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `RESUME_S3_BUCKET`, `RESUME_S3_KEY`, `RESUME_S3_PUBLIC_URL`, `SPEECH_S3_BUCKET`

## Design Language

- Aurora gradient background (orange/yellow/blue blobs with blur)
- Glassmorphism cards (`bg-white/60 backdrop-blur-sm`)
- Blur-reveal entry animations (staggered with `blur-reveal-N` classes)
- Material Symbols Outlined icons
- Geist Sans + Geist Mono fonts
- Color scheme: dark text on light background, foreground/background CSS variables

## Proxied Routes

| Path | Destination | Notes |
|------|-------------|-------|
| `/polymarket` | `https://polymarket-ev-bot-docker.onrender.com/polymarket` | Vercel rewrite in `next.config.ts`; preserve the upstream base path |
| `/polymarket/:path*` | `https://polymarket-ev-bot-docker.onrender.com/polymarket/:path*` | Render-hosted SPA mounted under `/polymarket` |

The Polymarket Render app has its own Google OAuth client — callback URIs registered for it separately in Google Cloud Console.

## Google OAuth Setup

Callback URIs registered for **kevinc.dev Next.js app**:

- `http://localhost:3000/api/auth/callback/google`
- `https://kevinc.dev/api/auth/callback/google`
- `https://kevin-chen.dev/api/auth/callback/google`
- `https://k3vnc.dev/api/auth/callback/google`

## Notes

- `.env*` files are gitignored
- `docs/` directory is gitignored (local retrospectives only)
- `next.config.ts` allows Google profile images from `lh3.googleusercontent.com`
- The `homepage/out/` directory is for static exports (only used on `main` branch)
- Fine-grained invited-user access is defined in `homepage/src/lib/accessGrants.ts`
