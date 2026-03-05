# From border-radius to Superellipse — Building a Squircle Close Button for contentEditable Highlights

A simple UI polish turned into a lesson about CSS masks, why `box-shadow` disappears when you clip elements, and how to structure a hover interaction that bridges native DOM events and React state. The task: replace a plain `×` character button with a proper squircle close button on the cover letter editor's inline highlights.

## The Starting Point

The cover letter workbench has an inline highlight editor — blocks of text wrapped in colored `<span>` elements that flow across line breaks using `box-decoration-break: clone`. When you hover over a highlight, a floating X button appears at the top-right corner to let you delete it.

The existing X button was functional but crude:

```tsx
// ❌ Before: inline styles, × character, manual style mutation on hover
<button
  className="hl-floating-x absolute z-50 flex items-center justify-center w-5 h-5 text-xs"
  style={{
    borderRadius: '6px',
    background: 'rgba(0,0,0,0.15)',
    color: 'rgba(0,0,0,0.6)',
    border: 'none',
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.background = 'rgba(239,68,68,0.9)'
    e.currentTarget.style.color = '#fff'
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.background = 'rgba(0,0,0,0.15)'
    e.currentTarget.style.color = 'rgba(0,0,0,0.6)'
    setXBtnPos(null)
  }}
>
  ×
</button>
```

Three problems:
1. **No dark mode support** — hardcoded `rgba(0,0,0,...)` backgrounds look wrong on dark themes
2. **Imperative style mutation** — `onMouseEnter`/`onMouseLeave` manually setting `style.background` is an anti-pattern in a React/Tailwind codebase where hover states belong in CSS classes
3. **The `×` character** — renders differently across browsers and font stacks, and can't be sized independently from the button's font-size

## Step 1: Why a Squircle, Not a Rounded Rectangle

A squircle (superellipse) is the shape Apple uses for app icons, and it's subtly different from `border-radius`. With `border-radius`, the curve starts abruptly — there's a visible inflection point where straight edge meets arc. A superellipse transitions smoothly because the curvature changes continuously.

Here's the math: a regular rounded rect uses quarter-circle arcs, but a superellipse uses the equation $|x/a|^n + |y/b|^n = 1$ with $n > 2$. The result is a shape where the corners "flow" rather than "bend."

You can't achieve this with CSS `border-radius` alone. The solution: an SVG path defining the superellipse curve, applied as a CSS mask.

```css
.squircle {
  /* SVG superellipse path applied as a mask */
  mask-image: url("data:image/svg+xml,...<path d='M 50 0 C 12 0 0 12 0 50
    C 0 88 12 100 50 100 C 88 100 100 88 100 50
    C 100 12 88 0 50 0 Z'/>");
  -webkit-mask-image: url("...same SVG...");
  mask-size: contain;
  -webkit-mask-size: contain;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
}
```

The SVG path uses cubic Bézier curves (`C` commands) with control points at 12% and 88% of the total size. These specific values produce the smooth superellipse curvature. The `-webkit-` prefixes are still needed for Safari.

The class goes in `globals.css` because it's a reusable utility — any element that needs squircle shape just adds `className="squircle"`.

## Step 2: The Shadow Problem — Why CSS Masks Kill box-shadow

Here's the gotcha I didn't anticipate: when you apply a CSS mask to an element, `box-shadow` disappears completely. The mask clips *everything* outside its shape, including the shadow (which, by definition, extends beyond the element's bounds).

The fix is a wrapper `<div>` with `filter: drop-shadow()` instead:

```tsx
{/* Shadow wrapper — drop-shadow hugs the mask shape */}
<div className="group/x inline-flex
  drop-shadow-sm hover:drop-shadow-md
  transition-all duration-300
  hover:-translate-y-0.5
  active:translate-y-0 active:drop-shadow-sm active:scale-95"
>
  <button className="squircle w-6 h-6 bg-white ...">
    {/* SVG X icon */}
  </button>
</div>
```

`filter: drop-shadow()` is fundamentally different from `box-shadow`:
- **`box-shadow`** draws a shadow around the element's *bounding box* (the rectangle), then the mask clips it away
- **`drop-shadow`** operates on the element's *painted pixels* (the alpha channel) — so it traces the actual squircle outline

By putting `drop-shadow` on the parent wrapper (which itself has no mask), the shadow correctly traces the child button's visible shape. The wrapper also carries the hover micro-interactions: lift on hover (`-translate-y-0.5`), press on active (`scale-95`).

## Step 3: The Hover Chain — Bridging Native DOM and React

The trickiest part wasn't the squircle itself — it was the hover interaction chain. The highlight spans use *native* DOM event listeners (because `contentEditable` intercepts React's synthetic events), but the X button is rendered by React. Here's the flow:

```
User hovers highlight span
  → native mouseenter → setXBtnPos({x, y, card})
  → React renders the squircle X at those coordinates

User moves mouse from span to X button
  → native mouseleave fires on the span
  → BUT: we check if relatedTarget is inside .hl-floating-x
  → If yes: don't hide the button (user is interacting with it)

User leaves the X button
  → React onMouseLeave on the wrapper div → setXBtnPos(null)
  → Button disappears
```

The critical detail: the wrapper div has `className="hl-floating-x"`, which is the same class the span's `mouseleave` handler checks with `related?.closest?.('.hl-floating-x')`. This is the bridge — a CSS class serving as a contract between the native DOM world and the React world.

```typescript
// Native event on the highlight span (in attachCardEvents)
span.addEventListener('mouseleave', (e: MouseEvent) => {
  const related = e.relatedTarget as HTMLElement | null
  // If the mouse moved to the X button wrapper, keep it visible
  if (related?.closest?.('.hl-floating-x')) return
  setXBtnPos(null)
})
```

If this check wasn't there, the X button would flash — appearing on `mouseenter` of the span, then instantly vanishing on `mouseleave` as the user moves toward the button.

## Step 4: Theme-Aware Colors via Tailwind Group Modifiers

The old button used hardcoded `rgba(0,0,0,...)` for both light and dark mode. The new version uses Tailwind's `dark:` variant and `group-hover/x:` modifier for clean theme-responsive behavior:

```tsx
<button className="squircle relative w-6 h-6
  bg-white dark:bg-neutral-700              {/* white in light, dark gray in dark */}
  text-neutral-400                           {/* muted X icon by default */}
  group-hover/x:bg-red-500                   {/* red background on hover */}
  group-hover/x:text-white                   {/* white X icon on hover */}
  transition-colors duration-200"
>
  <svg ...>{/* X icon */}</svg>
</button>
```

The `group/x` and `group-hover/x` pattern is Tailwind's named group modifier. The wrapper div is `group/x`, and the button's classes reference it with `group-hover/x:`. This means the hover effect triggers when any part of the wrapper is hovered, not just the button itself — which matters because the drop-shadow area around the squircle is part of the hover target.

The SVG `<line>` elements with `stroke="currentColor"` inherit the text color automatically, so the icon turns white on hover without any extra logic.

## What I'd Do Differently

The squircle SVG path is inlined as a data URI in the CSS, which works but is hard to read and modify. If the project needed multiple squircle sizes with different curvatures, I'd move the SVG to a separate file and reference it with `url()`, or generate the path programmatically based on a curvature parameter.

The `drop-shadow` wrapper pattern is slightly verbose — an extra wrapping `<div>` just for shadow purposes. There's a CSS proposal for `mask-composite` that might eventually let shadows render outside masked areas natively, but browser support isn't there yet. For now, the wrapper approach is the correct and portable solution.

---

The best UI details are the ones users never notice. If someone hovers a highlight card and a small button appears with exactly the right shape, lifts slightly, turns red, and presses down on click — they just think "that's a nice close button." They don't think about superellipse math, CSS mask clipping, or the native-to-React event bridge that makes it all work. That's the point.
