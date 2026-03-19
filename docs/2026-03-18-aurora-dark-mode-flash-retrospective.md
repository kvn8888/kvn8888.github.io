# From Race Condition to Root Cause: Fixing kevinc.dev's Dark Mode Flash

Three fixes that all looked correct — one that caused a flash of white, one that broke the aurora, and a final solution built on understanding a CSS rule most developers never need to know.

---

## The Starting Point

After the previous session's performance work, kevinc.dev went from Lighthouse Score 35 → 97 (on a dev server) with FCP dropping from 12.32s to 0.77s. The big wins: adding `export const dynamic = 'force-static'` to force static generation (eliminating cold-start Lambda latency on Vercel's Hobby tier), and removing a `mounted` React state guard that was keeping the entire page invisible until JavaScript hydrated.

But two bugs came out of that work:

1. **Dark mode flashed white when navigating between pages.** It hadn't done this before.
2. **The /projects section showed pure black instead of the aurora gradient background.** This turned out to be a pre-existing bug, but one that got worse.

The /projects bug was new information — nobody had looked closely before. Time to investigate both.

---

## Step 1: Find Where the Flash Was Coming From

My first hypothesis: during a page navigation in Next.js App Router, there's a brief React "commit window" where the old page's DOM is removed and the new page's DOM is being painted. In that window, if no element has a background, the browser shows its default canvas color — white.

Since the `body` element has `background: var(--background)` (dark in dark mode), this shouldn't happen. Unless...

The `body` background requires the `.dark` class to be on `<html>` for `--background` to resolve to `#0d0a08`. The ThemeProvider component (in the root `layout.tsx`) maintains that class. But ThemeProvider is a `'use client'` component, which means it's initialized via JavaScript. If there's **any frame** where React's hydration hasn't applied the class yet, the canvas defaults to white.

But this happened *after* my changes. Before them, the `mounted` state made all page content `opacity: 0` until after hydration. That opacity gate was accidentally masking the flash — content was invisible, so even if the background briefly flashed, you couldn't tell.

My first fix: add `background-color` to the `<html>` element via the inline script in `layout.tsx` and via CSS. This would ensure even before CSS loads, the canvas is dark.

```js
// In layout.tsx's inline <script> (runs before first paint)
if (dark) {
  document.documentElement.classList.add('dark');
  document.documentElement.style.backgroundColor = '#0d0a08'; // ← new
} else {
  document.documentElement.style.backgroundColor = '#ffffff';
}
```

And in `globals.css`:
```css
html {
  background: var(--background); /* ← new */
}
```

This seemed correct. It compiled. The flash should be fixed. Except it made the /projects aurora completely disappear.

---

## The Gotcha: CSS Background Propagation

This is where it gets interesting. Let me explain CSS background propagation, because almost every developer who hasn't debugged this exact issue has never heard of it.

**The rule:** When `html` has a transparent background (unset), the browser takes the `body` element's background and uses it as the **canvas** — the base layer behind everything else. As part of this, the browser marks `body`'s own painted box as transparent. The body gave its color to the canvas; it doesn't also paint it on itself.

**Why this matters for aurora:** The aurora gradient is a `position: fixed; z-index: -1` element. In CSS's stacking order, it paints at step 2 (negative z-index elements), which is *before* block-level elements like body (step 3). It sits between the canvas and body's painted box.

If `body`'s painted box is transparent (because background propagated to canvas), the aurora is visible above the dark canvas. If `body`'s painted box is opaque (because `html` now has its own background, stopping propagation), body covers the aurora at step 3. The aurora is hidden behind an opaque wall.

```
BEFORE my "fix":
Canvas (dark, from body propagation)
  ↑
Aurora (z-index:-1, visible above canvas) ← always here
  ↑
Body box (transparent, gave background to canvas)
  ↑
Page content
```

```
AFTER my "fix":
Canvas (dark, from html's background — body propagation stopped)
  ↑
Aurora (z-index:-1) ← hidden behind body's opaque box!
  ↑
Body box (opaque, body now keeps its own background)
  ↑
Page content
```

So my flash fix broke the aurora everywhere, not just in /projects. The /projects had already been broken (the aurora was also in each section's layout, not root layout), and the homepage was about to be broken too.

---

## Step 2: The Real Fix — Move Aurora to Root Layout

The white flash on navigation was happening because the `AuroraBackground` component was in each page's component tree (`page.tsx` for the homepage, `projects/layout.tsx` for the projects section, `tools/layout.tsx` for tools). During a React page navigation, the old page's aurora unmounts before the new page's aurora mounts. In that one-frame gap, the canvas shows through.

The correct fix isn't to mess with backgrounds at all. It's to make the aurora **never unmount** by putting it in the root layout:

```tsx
// homepage/src/app/layout.tsx
<body>
  <ThemeProvider>
    <AuroraBackground /> {/* Now lives here — persists across ALL navigations */}
    {children}
    <UpdateToast />
  </ThemeProvider>
</body>
```

Then remove `<AuroraBackground />` from:
- `homepage/src/app/page.tsx`
- `homepage/src/app/projects/layout.tsx`
- `homepage/src/app/tools/layout.tsx`
- `homepage/src/app/auth/signin/page.tsx`

With aurora in the root layout, it's part of the persistent shell. React never unmounts it during client-side navigation. The one-frame gap that was showing white is gone because the aurora is always there.

---

## The Revision: I Made It Worse Before Making It Better

My first committed "fix" actually broke things in two ways simultaneously:

1. Added `html { background: var(--background) }` to `globals.css`
2. Added `document.documentElement.style.backgroundColor = '#0d0a08'` to the inline script

Both of these set a background on `html`, which stopped body background propagation, which made body's box opaque, which covered the aurora everywhere. Then I moved aurora to root layout (a separate commit), but with the broken background CSS still in place, aurora was still invisible.

The correct final state required reverting the background changes:
- `globals.css` stays exactly as it was (body has background, html doesn't)
- The inline script stays exactly as it was (only sets `.dark` class, no backgroundColor)
- Aurora is simply moved to the root layout

Three commits to figure out what should have been one. The lesson: understand the mechanism first, then change one thing.

```
Commit history:
1. "fix: prevent dark mode white flash" → wrong, broke aurora
2. "fix: move aurora to root layout"    → half right, but had broken CSS
3. "fix: revert html/body background swap" → correct, removes the bad part of #1
```

---

## Step 3: Dev-Mode Auth Bypass

Separately, testing protected routes (`/projects/*`, `/tools/*`) during development requires a full Google OAuth dance every time — open browser, click sign in, approve scopes, get redirected. That's painful when you're iterating on UI.

The auth check lives in `src/auth.ts`'s `authorized()` callback, which is called by middleware on every request. Adding a bypass there:

```ts
// At the top of authorized(), before any auth checks:
if (process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true' && isProtected) {
  return true
}
```

Two deliberate safety conditions:
- `NODE_ENV === 'development'` — Vercel always deploys with `NODE_ENV=production`, so this branch is dead code in production no matter what
- `DEV_BYPASS_AUTH === 'true'` — explicit opt-in, must be set in `.env.local`

This means even if someone accidentally checks in `.env.local` (which is gitignored anyway), or pushes `DEV_BYPASS_AUTH=true` to a Vercel environment variable, the `NODE_ENV` check still prevents activation.

Caveat: API routes that read `auth?.user?.email` will receive `null` in bypass mode. Features that write per-user data will behave differently. This is fine for UI iteration but worth knowing.

---

## Results

Real production scores on kevinc.dev after all changes:

| Metric | Before (real world) | After |
|--------|---------------------|-------|
| Lighthouse Score | 35 | 99 (desktop) |
| FCP | 12.32s | 0.5s |
| LCP | 46.8s | 0.8s |
| TTFB | 10.31s | ~10ms |
| Aurora visible | Homepage only | Every page |
| Nav flash | Always | Never |

The 1000× TTFB improvement is from `force-static` — Vercel serves from CDN edge instead of spinning up a Lambda function. Everything else is from removing the `mounted` opacity gate and fixing the aurora architecture.

## What's Next

- **Mobile LCP** is still at 4.2s. The Geist font loads via Google Fonts' CDN — preloading it or self-hosting with `font-display: swap` would help.
- **CLS at 0.033** — small layout shifts, probably the aurora blobs repainting. Worth profiling if it creeps up.
- The **dev bypass only bypasses auth middleware**, not session data. If you need a real user session in dev, you still need Google SSO. A mock session provider (patching `auth()` in development) would be the next level of dev ergonomics.

---

*CSS background propagation: the one rule designed for the era of table-based layouts that still governs how every modern site's background actually works.*
