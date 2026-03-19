# From Full-Page Reloads to Instant Navigation — Fixing the Flash

The portfolio site had a persistent visual glitch: every time you clicked a link, the screen would flash white (or black in dark mode) before the next page rendered. It happened on every navigation — homepage to projects, projects to tools, everywhere. The root cause was deceptively simple: the site was accidentally behaving like a multi-page application instead of an SPA.

## The Starting Point

The site is built with **Next.js 16 App Router** — a framework that gives you client-side navigation for free through its `<Link>` component. The App Router keeps shared layouts mounted across navigations, only swapping page-level content. The root layout contains the aurora gradient background, theme provider, and dark mode setup.

But none of that mattered, because every internal link in the codebase was a plain `<a>` tag:

```tsx
// projects/page.tsx — every project card was a full-page reload
<a
  key={link.href}
  href={link.href}
  className="group block p-6 rounded-2xl bg-glass ..."
>
  <h2>{link.title}</h2>
</a>
```

When you click `<a href="/projects">`, the browser does a **full navigation**: it tears down the current page, requests new HTML from the server, parses it, downloads CSS, executes JavaScript, and renders. During that gap — however brief — you see the browser's default white background (or black if the OS is dark). That's the flash.

When you click `<Link href="/projects">`, Next.js intercepts the click, fetches only the new page's React Server Component payload, and swaps it into the existing layout. The root layout never unmounts. The aurora stays visible. The background never flickers. Zero flash.

## Step 1: The Audit

I searched every `.tsx` file in the app for `<a>` tags with internal `href` paths. The results:

| File | Link | Purpose |
|------|------|---------|
| `page.tsx` | `<a href="/projects">` | "Dashboard" admin link |
| `projects/page.tsx` | `<a href={link.href}>` × 7 | Project cards (Usage, Speech, Cover Letter, etc.) |
| `tools/page.tsx` | `<a href={link.href}>` × 4 | Tool cards (Sign-In Manager, Notes, Secrets, etc.) |
| `tools/project-dashboard/page.tsx` | `<a href="/projects">` | Inline text link |
| `auth/signin/page.tsx` | `<a href="/auth/signin">` | "Try again" after rejection |

External links (GitHub, LinkedIn) and API links (`/api/resume` with `target="_blank"`) correctly use `<a>` and should stay that way — they open new tabs or hit API endpoints, not navigate within the SPA.

## Step 2: The Conversion

The fix is conceptually simple — swap `<a>` for `<Link>` — but the details matter.

**Server Components**: `projects/page.tsx` and `tools/page.tsx` are async server components (they call `await auth()`). In Next.js App Router, `<Link>` from `next/link` works in both server and client components. It's not a hook — it's a component that Next.js handles specially.

```tsx
// projects/page.tsx — after
import Link from "next/link"

// Same JSX, just swap the tag
<Link
  key={link.href}
  href={link.href}
  className="group block p-6 rounded-2xl bg-glass ..."
>
  <h2>{link.title}</h2>
</Link>
```

**Client Components**: `page.tsx` (homepage) has `'use client'` at the top. Again, `<Link>` works fine here — just import and use.

The conversion touched 6 files and changed exactly one tag per navigation link. No behavioral changes, no prop differences, no refactoring needed.

## Step 3: The Hard Refresh Flash

Converting `<a>` to `<Link>` fixes all **client-side** navigation flashes. But there's a second type of flash: the **hard refresh**.

When you hit Cmd+R (or visit the URL directly), the browser starts fresh:
1. Downloads HTML
2. Paints the page (background = browser default white)
3. Downloads and parses CSS
4. Applies `body { background: var(--background) }` from the external stylesheet
5. Now the background is correct

The gap between steps 2 and 4 is visible as a white flash — even in dark mode. The site already had an inline `<script>` that adds the `.dark` class to `<html>` before paint:

```js
(function() {
  var t = localStorage.getItem('theme');
  var dark = t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
})();
```

This prevents a *theme* flash (light→dark), but it doesn't help with the *background* flash because the CSS variables (`--background`, `--foreground`) are defined in the external stylesheet, which hasn't loaded yet.

**The fix**: Duplicate the critical CSS variables and body background in an inline `<style>` tag — NOT via `style.setProperty()`:

```tsx
<head>
  <script dangerouslySetInnerHTML={{ __html: `
    (function() {
      var t = localStorage.getItem('theme');
      var dark = t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches);
      if (dark) document.documentElement.classList.add('dark');
    })();
  `}} />
  {/* Critical inline CSS — stylesheet rules, not inline styles */}
  <style dangerouslySetInnerHTML={{ __html: `
    :root { --background: #ffffff; --foreground: #0a0a0a; }
    .dark { --background: #0d0a08; --foreground: #f0ece8; }
    body { background: var(--background); color: var(--foreground); }
  `}} />
</head>
```

**Why not `style.setProperty()`?** My first attempt used `document.documentElement.style.setProperty('--background', ...)`. This works for the initial load — but inline styles have the highest CSS specificity. When the `ThemeProvider` toggles the `.dark` class, the stylesheet rules for `:root` and `.dark` can't override the inline style properties. The background color gets stuck on whatever was set at load time, and toggling light/dark mode breaks. A `<style>` tag with `:root`/`.dark` selectors has the same specificity as the external stylesheet, so class toggles work correctly.

The execution order is now:
1. HTML arrives → inline script runs → sets `.dark` class + CSS variables on `<html>`
2. Inline `<style>` is parsed → `body { background: var(--background) }` applies immediately
3. Body is painted with the correct dark/light background — **no flash**
4. External CSS loads later and takes over (same values, no visible change)

This is a classic pattern called **critical CSS inlining** — you duplicate the minimum CSS needed to prevent a flash in the `<head>`, and the external stylesheet carries the rest.

## The Gotcha: Why Not Set Background on `<html>`?

An earlier attempt in this session tried to fix the flash by setting `html { background: var(--background) }`. This *seemed* logical — set it at the highest level. But it broke the aurora gradient.

The aurora is a `position: fixed; z-index: -1` element. In CSS's paint order (the "stacking context" rules), negative z-index items paint **above** the canvas but **below** block-level descendants. When `<html>` has no background, `<body>`'s background "propagates" to the canvas — meaning body's own box becomes transparent, and the aurora is visible through it.

But when `<html>` gets ANY background, body's background stops propagating. Body paints its own opaque box, which sits *above* the aurora in the stacking order. Result: aurora invisible, pure black page.

The correct approach — and what we landed on — is to set CSS variables on `<html>` via inline style properties (which don't count as a "background" for propagation purposes) and let `body { background: var(--background) }` do its propagation magic as usual.

## What Changed

| Before | After |
|--------|-------|
| `<a href="/projects">` | `<Link href="/projects">` |
| Full page reload on every internal link | Client-side SPA navigation |
| Root layout unmounts and remounts | Root layout persists (aurora stays) |
| Browser paints blank page during navigation | Content swaps instantly |
| Hard refresh shows white flash | Inline CSS variables + style prevent flash |

## What's Next

- The `coverletter/page.tsx` still uses an old `mounted` useState pattern (start invisible, flip to visible after mount) that could be cleaned up
- View Transitions API could add smooth crossfade effects between pages, now that navigation is SPA-style
- The inline script duplicates the color values from `globals.css` — if those colors change, two places need updating. A build-time extraction step could automate this, but it's not worth the complexity for two hex codes.

---

The most expensive line of code isn't the one you wrote wrong — it's the one the framework wrote right and you accidentally bypassed.
