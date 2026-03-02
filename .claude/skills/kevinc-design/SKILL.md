---
name: kevinc-design
description: Design system and patterns for KevinC.dev portfolio site. This skill should be used when creating or modifying UI components, adding new pages or sections, or when the user asks about the site's design patterns, animations, or styling. It captures the visual language, component structure, and animation approach established in the homepage.
---

# KevinC.dev Design System

This skill provides the design patterns, component structures, and guidelines for maintaining visual consistency across the KevinC.dev portfolio site.

## Design Philosophy

The site follows a **"quiet confidence"** aesthetic: minimal, clean, with subtle motion that feels premium without being distracting. Inspired by Apple's Human Interface Guidelines and modern SaaS landing pages.

Key principles:
- **White space is intentional** — room to breathe, not empty
- **Motion serves purpose** — animations communicate state, not decoration
- **Mobile-first** — every element must work on 375px screens
- **Performance matters** — no layout shifts, preload assets, minimize dependencies
- **`font-medium` everywhere** — never use `font-bold` or `font-semibold` on headings or card titles; the restraint is the aesthetic

## Visual Language

### Colors
- **Background**: Pure white (`#ffffff`)
- **Text primary**: Near-black (`#0a0a0a`, `text-gray-900`)
- **Text secondary**: Gray (`#4b5563`, `text-gray-600`)
- **Text tertiary**: Light gray (`#6b7280`, `text-gray-500`)
- **Accent surfaces**: Light gray (`bg-gray-100`, `bg-gray-50`)
- **Status/Active**: Emerald (`bg-emerald-50`, `text-emerald-700`) — used sparingly

### Aurora Background
Three animated gradient blobs create a soft, shifting background:
- **Blob 1** (orange): Top-left, largest
- **Blob 2** (yellow): Top-right  
- **Blob 3** (blue): Bottom-left

Animation: 20s infinite ease-in-out cycle with opacity/scale/position transforms.
See [references/components.md](references/components.md) for CSS.

### Typography
- **Sans-serif**: Geist Sans (via `next/font/google`)
- **Monospace**: Geist Mono (code snippets)
- **Icon font**: Material Symbols Outlined (Google Fonts CDN, preloaded)

Sizes follow Tailwind defaults:
- Hero headline: `text-5xl sm:text-6xl md:text-7xl`
- Section headers: `text-2xl`
- Body: `text-lg`
- Small/meta: `text-sm`

### Spacing
- Page padding: `px-4` (16px on mobile and up)
- Section gaps: `mt-20` between major sections
- Component gaps: `gap-3` for button groups, `space-y-3` for lists

### Border Radius
- Cards/modals: `rounded-2xl` (16px)
- Buttons/pills: `rounded-full`
- Inner elements: `rounded-xl` (12px)

## Animations

### Blur Reveal (Page Load)
Elements fade in with a blur-to-sharp animation, staggered by 100ms.
**Every page must use staggered blur reveal** — heading first, then subtitle, then each content layer:

```css
@keyframes blurReveal {
  0% { filter: blur(10px); opacity: 0; }
  100% { filter: blur(0px); opacity: 1; }
}
.blur-reveal { animation: blurReveal 0.2s ease-out forwards; }
.blur-reveal-1 { animation: blurReveal 0.2s ease-out 0.1s forwards; }
/* ... up to blur-reveal-5 */
```

**Stagger pattern (apply to every page):**
- `blur-reveal` → page heading
- `blur-reveal-1` → subtitle / description
- `blur-reveal-2` → first content layer (tab bar, controls, first card)
- `blur-reveal-3` → second content layer (main content area, card grid)
- `blur-reveal-4+` → additional layers

**Safari fix** (client components only): Classes are added via React state after mount to force animation replay on refresh. See `mounted` state in `page.tsx`.

```tsx
// Client component pattern:
const [mounted, setMounted] = useState(false)
useEffect(() => { setMounted(true) }, [])
<h1 className={`... ${mounted ? 'blur-reveal' : 'opacity-0'}`}>

// Server component pattern (no Safari fix needed for SPA navigations):
<h1 className="... blur-reveal">
<p className="... blur-reveal-1">
<div className="... blur-reveal-2">
```

### Framer Motion (Interactive)
Modal transitions use `layoutId` for shared element animation:
- Card → Modal morph: `layoutId="card-{id}"`
- Spring physics: `stiffness: 500, damping: 30`
- Backdrop: fade in/out with `backdrop-blur-xl`

New modal content fades in with blur: `initial={{ opacity: 0, filter: 'blur(10px)', y: 10 }}`

## Component Patterns

### Project Card
Clickable card with hover scale, folder icon, and arrow indicator.
- Container: `bg-white/50 border-white/20 hover:bg-white/80`
- Hover: `whileHover={{ scale: 1.02 }}`

### Project Modal
Full-screen overlay with morphing card animation.
- Width: `max-w-lg md:max-w-2xl`
- Max height: `max-h-[90vh]` with `overflow-y-auto`
- Close button: top-right, `rounded-full bg-gray-50`

### Pill Buttons (Social Links)
Inline-flex with icon + label.
- Style: `bg-gray-100 hover:bg-gray-200 rounded-full px-4 py-2`
- Gap between items: `gap-2 sm:gap-3`

### Status Badge
Availability indicator with pulsing dot.
- Container: `bg-emerald-50 border-emerald-200 rounded-full`
- Dot: nested spans with `animate-ping` for pulse effect

## File Structure

```
homepage/src/app/
├── layout.tsx        # Metadata, fonts, Material Symbols preload
├── page.tsx          # Main page, project data, state management
├── globals.css       # Aurora, blur animations, base styles
└── components/
    ├── index.ts      # Barrel exports
    ├── types.ts      # Project interface
    ├── AuroraBackground.tsx
    ├── ProjectCard.tsx
    └── ProjectModal.tsx
```

## When Adding New Features

1. **Follow mobile-first**: Start with the mobile view, then add `sm:`, `md:`, `lg:` overrides
2. **Use existing components**: Check if a pattern already exists before creating new ones
3. **Maintain animation consistency**: Use the same spring config for interactive elements
4. **Preload heavy assets**: Add to the `useEffect` preloader if adding images
5. **Test Safari**: Especially for filter/blur animations

## References

- **Component code**: See [references/components.md](references/components.md)
