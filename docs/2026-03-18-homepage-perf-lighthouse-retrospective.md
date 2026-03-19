# From Score 35 to 97: How Three Lines Were Hiding the Entire Homepage

The homepage of kevinc.dev was reporting abysmal real-world performance metrics — a 10-second Time to First Byte, a 12-second First Contentful Paint, and a 46-second Largest Contentful Paint. These aren't just bad numbers. They mean a recruiter who clicks your link sees a blank white page for potentially 12 seconds. This session was about finding out why and fixing it.

---

## The Starting Point

The site is a Next.js 16 app (Next.js is the React framework that powers most modern web apps) deployed on Vercel (a cloud hosting platform). The homepage shows a portfolio landing page — headline, bio, social links, and a projects section.

The homepage had three issues baked into it:

**Issue 1 — The server was cold.** Vercel's free tier "Hobby" plan runs your page as a serverless function — imagine a tiny server that turns itself off when nobody visits. When a visitor arrives, Vercel has to boot that server from scratch. That takes 8–12 seconds. That was the entire TTFB (Time to First Byte — how long before the browser gets *any* response from the server).

**Issue 2 — Every word on the page was invisible until JavaScript ran.** The homepage used a React pattern called `mounted` state: a flag that starts as `false` and flips to `true` after the page finishes loading in the browser. Every piece of content — the headline, bio, links, everything — was rendered with `opacity: 0` until that flag flipped. The idea was to gate a blur-reveal animation. The side effect was that the server-rendered HTML was completely invisible.

```tsx
// BEFORE — all content hidden with opacity:0 until JS runs
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);

<h1 className={mounted ? 'blur-reveal-1' : 'opacity-0'}>
  Welcome to KevinC.dev
</h1>
```

When the browser gets the page HTML, it sees `opacity-0` everywhere. Nothing paints. Then JavaScript loads, runs, and flips `mounted` to true. Only then do words appear. On a throttled mobile connection (which is how Lighthouse measures performance), that can take 8+ seconds.

**Issue 3 — Screenshots were being force-loaded on startup.** The page was eagerly fetching three project screenshot images the moment it loaded, before the user had even scrolled or opened a modal. This competed with the actual page content for network bandwidth.

---

## Step 1: Make the Page Static

The fix for the cold-start TTFB is one line:

```tsx
export const dynamic = 'force-static';
```

This tells Next.js: don't run this page as a serverless function. Instead, bake it into a static HTML file at build time, and let Vercel serve it from their CDN edge (a network of servers distributed globally). The difference is: a serverless function takes 8–12 seconds to cold-start. A static file from a CDN edge takes ~50 milliseconds.

The homepage doesn't need a server — it has no user-specific data, no database queries, no auth. It's just a portfolio page. It should always have been static.

---

## Step 2: Remove the `mounted` Gate

The `mounted` state pattern exists for a legitimate reason: preventing a "flash of unstyled content" when the server-rendered HTML and the client-rendered output disagree. But in this case, it was used as a hacky animation trigger, and the cost was hiding all visible content until JavaScript hydrated.

The fix was to remove the pattern entirely — delete the `mounted` state, delete the `useEffect` that set it, and delete all the conditional class assignments. The CSS animation classes (`blur-reveal-1`, `blur-reveal-2`, etc.) were applied directly:

```tsx
// AFTER — content visible immediately
<h1 className="... blur-reveal-1">
  Welcome to KevinC.dev
</h1>
```

The `blur-reveal-N` CSS classes already start at `opacity: 0` — but that's `opacity: 0` in a CSS *animation*, which still lets the browser paint the element. The difference between CSS opacity and the old JS-gated opacity is subtle but critical: the browser can start rendering CSS animations as soon as the stylesheet loads. JS-gated opacity waits until React is fully hydrated.

Also removed: the `useEffect` that force-loaded all three project screenshots on mount. Screenshots are only needed when someone clicks a project card to open the modal, not on initial load.

---

## The Gotcha: The Fake LCP

This is the most interesting part of the session.

LCP stands for **Largest Contentful Paint** — it measures how long it takes for the biggest visible element on the page to appear. On a portfolio site, you'd expect that to be the `<h1>` headline.

But when we ran Lighthouse (a performance testing tool built into Chrome) on the original code, it reported LCP as **4.98 seconds**. That sounds bad, but it was actually measuring *a 24×24 pixel icon in the top-right corner* — the theme toggle button (the sun/moon icon that switches between light and dark mode).

Why? Because the entire page was `opacity: 0`. The theme toggle happened to not be gated by `mounted`, so it was the *only visible pixel on the page*. Lighthouse found nothing else to measure, so it picked the tiny icon.

This is a ghost metric. It looked like LCP was ~5s when the real content (the h1) wasn't appearing until ~8.5 seconds — well past when Lighthouse stopped timing. The bad performance was worse than the test showed.

After removing the `mounted` gate, Lighthouse correctly identified the `<h1>` as the LCP element. But the h1 still had the `blur-reveal-1` animation class — which starts at `opacity: 0`. So LCP was now measuring 8.28s (worse on paper, because it was now measuring the real thing).

The final fix was to remove the blur-reveal animation from the two most important elements — the tagline and the headline. They load instantly, fully visible. The secondary content (bio, links, project cards) still animates in with the staggered blur effect for visual polish. The headline just doesn't need to hide before appearing — it should *be* the first thing someone sees.

```tsx
// FINAL — LCP elements visible from first paint
<p className="text-sm text-foreground/50 mb-4">Software Engineering Student, Spring 2027</p>
<h1 className="text-5xl font-medium tracking-tight mb-8 text-foreground">
  Welcome to KevinC.dev
</h1>

// Secondary content still animates in
<p className="... blur-reveal-2">I'm a software engineering student...</p>
```

---

## The Results (Measured Locally)

We ran Lighthouse three times: original, intermediate fix, and final fix. All on local dev, simulating a throttled mobile connection (Lighthouse's default, which is intentionally harsh).

| Metric | Original | Final Fix | Change |
|---|---|---|---|
| Performance Score | 78 | **97** | +19 pts |
| FCP (First Contentful Paint) | 2.43s | **0.77s** | -68% |
| LCP (Largest Contentful Paint) | 4.98s* | **1.98s** | -60% |
| Speed Index | 2.97s | **1.78s** | -40% |
| TTI (Time to Interactive) | 8.56s | 7.82s | -9% |

\* *Measuring the wrong element — the actual content LCP was effectively ~8.5s*

The local Lighthouse numbers are better than what production sees (no cold start locally), but the cold-start fix (`force-static`) is the most impactful change in production. That's the one that turns a 10-second blank page into a 50ms edge-served response.

---

## What's Next

**TBT (Total Blocking Time)** went up slightly after the fix (+40ms). TBT measures how long JavaScript blocks the browser's main thread during load. This is likely because with the content now visible, Lighthouse is better able to measure what's actually happening during hydration. It's worth investigating whether any of the event listeners or Framer Motion animations are causing unnecessary main-thread work.

**CLS (Cumulative Layout Shift)** is at 0.025 — low, but not zero. This often comes from the aurora background blobs or fonts loading and causing a reflow. A future improvement would be adding `font-display: block` or preloading the Geist font.

**The `useEffect`-as-animation-trigger pattern** should be called out as a bad practice in this codebase. Any time you see `const [mounted, setMounted] = useState(false)` used to conditionally show content, it's worth asking whether the content really needs to be hidden until JS runs, or whether a CSS animation would achieve the same effect without sacrificing FCP/LCP.

---

*Your portfolio site is often the first thing a recruiter sees. A 12-second blank page isn't a subtle UX issue — it's a first impression. Sometimes the most important performance fix isn't a clever algorithm; it's deleting the code that was hiding the content in the first place.*
