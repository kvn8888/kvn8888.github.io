# My First PR Was Written by an AI — And I Merged It in 60 Minutes

PR #1 on my portfolio repo wasn't written by me. GitHub Copilot's coding agent opened it, wrote 2,722 lines across 24 files, deployed a preview to Vercel, and I merged it an hour later. Here's what happened.

## The Prompt

I opened an issue on my own repo:

> Add an S3-backed resume uploader tool page. The homepage Resume button should point to a stable `/api/resume` endpoint instead of a hardcoded S3 URL. The uploader should live under `/projects/tools/resume` with drag-and-drop PDF upload, session gating, and S3 upload via `@aws-sdk/client-s3`.

That's it. One issue. Copilot's agent picked it up, created a branch (`copilot/add-s3-bucket-resume-page`), and started committing.

## What the Agent Built

Three commits over ~30 minutes:

### Commit 1: `Initial plan`
The agent wrote a markdown plan file outlining its approach. It didn't just dive into code — it mapped out the route structure, identified which environment variables it would need, and noted the auth integration points. This is the kind of thing a junior engineer does in a design doc before their first PR review.

### Commit 2: `Add S3-backed resume uploader tool page`
The bulk of the work. Five new files:

**`/projects/tools/resume/page.tsx`** — A client component with drag-and-drop UX:
```tsx
const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
  event.preventDefault()
  setIsDragging(false)
  onFileSelected(event.dataTransfer.files?.[0] ?? null)
}
```
The component handles file validation (PDF only, 10MB max), upload state management, and success/error feedback. It correctly uses the existing design system — `bg-glass`, `backdrop-blur-sm`, `border-glass-border`, `blur-reveal` classes, and Material Symbols icons.

**`/api/tools/resume/route.ts`** — The upload endpoint:
- Session-gated via `auth()` (Auth.js v5)
- Accepts multipart form data
- Validates MIME type and file size
- Uploads to S3 via `PutObjectCommand`
- Sets `CacheControl: "no-cache"` so the latest resume is always served fresh

**`/api/resume/route.ts`** — The stable redirect:
```typescript
export async function GET() {
  const resumeUrl = resolveResumeUrl()
  return NextResponse.redirect(resumeUrl)
}
```
This is the clever bit. Instead of the homepage linking directly to `https://my-bucket.s3.amazonaws.com/resume.pdf`, it links to `/api/resume` which resolves the URL from environment config. Change the S3 bucket, CloudFront domain, or object key — no code changes to the homepage.

**`/tools/page.tsx`** — A redirect page that auth-gates and forwards to `/projects/tools/resume`. This prevents anonymous access to the upload tool via a shorter URL.

**`.env.example`** — Added all S3 config vars with documentation.

### Commit 3: `Address review feedback and secure /tools route`
The agent also updated the Tools hub page to include a "Resume Uploader" card alongside the existing Speech Lab card. It picked up the exact card pattern — icon, title, description, glassmorphism styling.

## What the Agent Got Right

**Design system adherence.** The agent used `bg-glass`, `border-glass-border`, `text-foreground/50`, `blur-reveal` classes — all the CSS variable-based design tokens I'd set up. It didn't hardcode any colors. This is notable because the design system was established just hours earlier in a different session. The agent either read the globals.css or inferred the patterns from existing pages.

**Auth integration.** Every protected route uses `auth()` from Auth.js correctly. The upload endpoint checks session before processing. The `/tools` redirect page checks session before redirecting. No middleware needed — each route is self-protecting.

**File handling.** The drag-and-drop implementation is complete: `dragover`, `dragleave`, `drop` handlers, visual feedback on hover, file type validation before upload, and a hidden `<input type="file">` as fallback. It even calculates human-readable file sizes:

```tsx
const helperText = useMemo(() => {
  if (!file) return 'Drop a PDF here or choose a file.'
  if (file.size < 1024) return `${file.name} (${file.size} B)`
  return `${file.name} (${Math.round(file.size / 1024)} KB)`
}, [file])
```

**Error handling.** Both the API route and the client handle errors gracefully. The API distinguishes between missing config (500), invalid input (400), and auth failure (401). The client catches network errors and displays them in a styled error banner.

## What the Agent Got Wrong

**New icon without subset update.** The uploader uses `picture_as_pdf` — an icon that wasn't in the self-hosted font subset. The font subset built earlier in the session only included 19 specific icons. This icon would render as invisible text (the ligature fires but the glyph is missing). However, since we switched from the 1.6KB subset to the 306KB pinned-axis font that includes all icons, this actually works fine now.

**No dark mode on error/success banners.** The error and success feedback messages use hardcoded light-mode colors:
```tsx
className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl"
```
These should use the dark-mode-aware status color classes that were added to globals.css. Minor fix, but shows the agent didn't fully account for the dark mode system.

**Redundant `/tools` redirect.** The agent created a top-level `/tools/page.tsx` that redirects to `/projects/tools/resume`. But `/projects/tools` already exists as the tools hub. Having a separate `/tools` route feels like the agent didn't fully understand the routing hierarchy — or it wanted a short URL for convenience.

## The Process

The whole cycle took about an hour:
1. **0:00** — I opened the issue
2. **~0:05** — Copilot's agent started work, pushed the plan commit
3. **~0:20** — Main implementation commit landed, triggered Vercel preview deploy
4. **~0:35** — Review feedback commit (securing the `/tools` route)
5. **~0:45** — I reviewed the code, checked the Vercel preview
6. **~0:55** — Merged into `dia-design`
7. **~1:00** — Production deploy live on kevinc.dev

Three commits. Three Vercel preview deployments. Each commit got its own live preview URL. I could click through the drag-and-drop UX, verify the auth gating, and test the upload flow before merging.

## The Meta Observation

This PR was opened on a repo where I'd spent the entire day building with GitHub Copilot Chat in VS Code. The Speech Lab, dark mode, performance fixes — all built interactively with Copilot as a pair programmer. Then I stepped away, opened a GitHub issue, and Copilot's agent independently built a feature on a branch, following the design patterns I'd established hours earlier.

The agent and I never communicated directly. It read the codebase, inferred the design system from the existing code, matched the component patterns, and shipped working code. The resume uploader looks like I built it. It *feels* like part of the same session's work.

2,722 lines added. 862 deleted. Zero back-and-forth. One merge.

---

The hardcoded red error banners still need fixing though. Some things you've got to do yourself.
