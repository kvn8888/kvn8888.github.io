# KevinC.dev — Project Context

## Overview

Personal portfolio/resume site for Kevin C at **kevinc.dev** (also kevin-chen.dev, k3vnc.dev).
Built with **Next.js 15** (App Router), **Tailwind v4**, **Framer Motion**, deployed on **Vercel**.

## Repository Structure

- `homepage/` — The Next.js application (all source code lives here)
- `docs/` — Local retrospectives/journey docs (gitignored, not deployed)
- `.github/workflows/` — GitHub Actions (deploys `main` branch to GitHub Pages as static export)

## Branches

- **`main`** — Static export deployed to GitHub Pages (legacy)
- **`dia-design`** — Active development branch, deployed to Vercel with full SSR

## Tech Stack

- Next.js 15 (App Router, TypeScript)
- Tailwind CSS v4 (with `@tailwindcss/postcss`)
- Framer Motion for animations
- Auth.js v5 (`next-auth@beta`) for Google OAuth
- No database — JWT sessions stored in encrypted cookies

## Authentication (`/projects/*`)

- **Auth.js v5** with Google OAuth provider
- All `/projects/*` routes are protected via Next.js middleware (`src/middleware.ts`)
- Email whitelist via `ALLOWED_EMAILS` env var (comma-separated)
- Config in `src/auth.ts`, API route at `src/app/api/auth/[...nextauth]/route.ts`
- Custom sign-in page at `src/app/auth/signin/page.tsx`

## Protected Pages

- `/projects` — Project hub with card-based navigation
- `/projects/usage` — API usage monitor dashboard (Tavily, Vercel, Render)

## API Routes

- `/api/auth/[...nextauth]` — Auth.js handlers
- `/api/usage/tavily` — Proxies Tavily usage API (live credits/limits)
- `/api/usage/vercel` — Proxies Vercel billing API (or shows known Hobby limits)
- `/api/usage/render` — Proxies Render management API (services list + free tier limits)
- All `/api/usage/*` routes require auth session

## Environment Variables

Set in `.env.local` (local) and Vercel dashboard (production):

```.env
AUTH_SECRET          — Random string for JWT encryption
AUTH_GOOGLE_ID       — Google OAuth Client ID
AUTH_GOOGLE_SECRET   — Google OAuth Client Secret
AUTH_TRUST_HOST=true — Required for Vercel
ALLOWED_EMAILS       — Comma-separated email whitelist for sign-in
TAVILY_API_KEY       — For usage monitoring
VERCEL_API_TOKEN     — For Vercel billing API (optional)
RENDER_API_KEY       — For Render services API (optional)
```

## Design Language

- Aurora gradient background (orange/yellow/blue blobs with blur)
- Glassmorphism cards (`bg-white/60 backdrop-blur-sm`)
- Blur-reveal entry animations (staggered with `blur-reveal-N` classes)
- Material Symbols Outlined icons
- Geist Sans + Geist Mono fonts
- Color scheme: dark text on light background, foreground/background CSS variables

## Google OAuth Setup

Callback URIs registered for:

- `http://localhost:3000/api/auth/callback/google`
- `https://kevinc.dev/api/auth/callback/google`
- `https://kevin-chen.dev/api/auth/callback/google`
- `https://k3vnc.dev/api/auth/callback/google`

## Notes

- `.env*` files are gitignored
- `docs/` directory is gitignored (local retrospectives only)
- `next.config.ts` allows Google profile images from `lh3.googleusercontent.com`
- The `homepage/out/` directory is for static exports (only used on `main` branch)
