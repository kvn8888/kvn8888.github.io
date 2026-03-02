# How I Cut 7.2MB From My Portfolio by Deleting One HTML Tag

My portfolio site scored 55/100 on Lighthouse. The fix took two lines of code and a 1.6KB file.

## The Crime Scene

I'd just shipped a dark mode with animated aurora blobs — organic shapes morphing through the 20-second animation cycle. Dusk theme, frosted glass cards, the works. It looked great. And then I ran Lighthouse.

```
Performance: 55
FCP: 21.2s
LCP: 39.5s
```

Twenty-one seconds to first paint. On a site that's essentially text and gradients.

## The Usual Suspects

Lighthouse gave me the standard laundry list: reduce unused JavaScript (58KB saveable), legacy polyfills (14KB), avoid chaining critical requests. But buried in the diagnostics was a number that made me double-take:

```
Avoid enormous network payloads — Total size was 7,643 KiB

Google Fonts CDN:     7,253.2 KiB
└── woff2 file:       3,774.4 KiB
└── woff2 file:       3,478.8 KiB
```

Seven megabytes. Of *fonts*. My entire JavaScript bundle was 120KB. The icons were sixty times larger than the app.

## What Was Happening

I was loading Material Symbols Outlined from Google's CDN — the variable icon font that contains every Material icon ever made. Over 4,000 glyphs. I was using nineteen of them.

The offending code in my `layout.tsx`:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" />
```

That URL doesn't just fetch one font file. Because I specified the full axis ranges (`opsz` 20–48, `wght` 100–700, `FILL` 0–1, `GRAD` -50–200), Google served the entire variable font with every OpenType variation. Twice — two Unicode range splits.

## The Fix

Google's Fonts API has a `text=` parameter that tells it to subset the font to only the glyphs needed to render specific text. For ligature fonts like Material Symbols, this means you concatenate all your icon names into the URL:

```
https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&text=descriptionclosearrow_outward...
```

Notice two things:
1. I pinned the axes to single values (`24,400,0,0`) instead of ranges — I don't need variable weight icons
2. The `text=` param includes the characters needed for the ligature rules to fire

Google returns a CSS with a `@font-face` pointing to a subset woff2. I downloaded that woff2 directly:

```bash
curl -s -L -o public/fonts/material-symbols-outlined-subset.woff2 "<subset-url>"
ls -lh public/fonts/
# 1.6K  material-symbols-outlined-subset.woff2
```

1.6 kilobytes. Not megabytes. Kilobytes.

Then I defined the `@font-face` locally in my CSS and deleted the CDN link from the layout. Two lines removed, one `@font-face` block added, one 1.6KB file committed.

## The Blob Problem

While I was profiling, Lighthouse also flagged "9 non-composited animations." My aurora background used CSS keyframes that animated `border-radius` to create organic, morphing blob shapes:

```css
@keyframes aurora {
  0%   { border-radius: 30% 70% 60% 40% / 60% 30% 70% 40%; }
  25%  { border-radius: 50% 40% 70% 30% / 40% 60% 30% 70%; }
  50%  { border-radius: 40% 60% 30% 70% / 70% 40% 60% 30%; }
  75%  { border-radius: 60% 30% 50% 40% / 30% 70% 40% 60%; }
}
```

This looks great on a beefy MacBook. On a throttled mobile CPU, it's a slideshow. Here's why: `border-radius` is not a compositable property. Every frame, the browser has to:

1. Recalculate the element's geometry (layout)
2. Repaint the element with the new border radius
3. Composite the result

Steps 1 and 2 are expensive. The compositor (GPU) can only handle `transform` and `opacity` changes without triggering layout/paint. Everything else goes through the CPU pipeline.

The fix: set `border-radius` once (static organic shape) and simulate movement with compositor-friendly transforms:

```css
.aurora-blob {
  border-radius: 30% 70% 60% 40% / 60% 30% 70% 40%;
  will-change: transform, opacity;
  contain: layout style;
}

@keyframes aurora {
  0%   { transform: translateX(0) translateY(0) scale(1) rotate(0deg); opacity: 0.5; }
  25%  { transform: translateX(10%) translateY(-10%) scale(1.1) rotate(3deg); opacity: 0.7; }
  50%  { transform: translateX(-5%) translateY(5%) scaleX(0.95) scaleY(1.05) rotate(-2deg); opacity: 0.4; }
  75%  { transform: translateX(-10%) translateY(-5%) scaleX(1.05) scaleY(0.95) rotate(4deg); opacity: 0.6; }
}
```

The `rotate()` and `scaleX/Y` distortions create the illusion of shape morphing without touching layout. Each blob gets a different static `border-radius` for variety. The `will-change: transform, opacity` hint promotes the element to its own GPU layer. And `contain: layout style` prevents the animation from invalidating anything outside the blob's subtree.

Visual difference? Negligible. Performance difference? All 9 "non-composited animation" warnings gone.

## What I Learned

**Font loading is the silent killer.** My JavaScript was 120KB. My CSS was 8.5KB. My fonts were 7,253KB. I spent hours optimizing component renders and animation easing curves while the browser was downloading every Material icon ever designed.

**The full axis range is a trap.** `opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200` looks innocent — it's just the default from Google Fonts' embed code. But it tells Google to serve the full variable font with all OpenType variations. Pin your axes to the values you actually use.

**CSS animations have two tiers.** There's the compositor shortlist — `transform`, `opacity`, `filter` — and everything else. If you're animating anything not on the shortlist, you're burning CPU on every frame. The difference isn't subtle in performance traces.

**`text=` is the subsetting API nobody talks about.** Google Fonts will subset to exactly the characters you need. For a ligature font like Material Symbols, it preserves the ligature rules for the icon names you include. My 19-icon subset was 1.6KB. The full font was 7.2MB. That's a 4,500x reduction.

## The Numbers

| Metric | Before | After |
|--------|--------|-------|
| Icon font payload | 7,253 KB | 1.6 KB |
| External font requests | 3 | 0 |
| Non-composited animations | 9 | 0 |
| Font loading strategy | Render-blocking CDN | Local, font-display: swap |

---

The lesson isn't about fonts or animations. It's about measuring before optimizing. I could have spent a week lazy-loading components and code-splitting routes to save 30KB. Instead, I deleted one `<link>` tag and saved 7,251KB.
