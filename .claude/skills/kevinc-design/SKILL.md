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

### Colors (Theme-Aware)
The site supports **light** and **dark** modes via CSS variables + `.dark` class on `<html>`.
Never use hardcoded colors like `bg-white`, `text-gray-500`, `bg-black`. Always use the CSS variable system:

**CSS Variables (defined in globals.css):**
| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--background` | `#ffffff` | `#0d0a08` (warm black) | Page background |
| `--foreground` | `#0a0a0a` | `#f0ece8` (warm white) | Text color |
| `--glass` | `rgba(255,255,255,0.6)` | `rgba(0,0,0,0.4)` | Glass surfaces |
| `--glass-hover` | `rgba(255,255,255,0.8)` | `rgba(0,0,0,0.55)` | Glass hover |
| `--glass-border` | `rgba(10,10,10,0.05)` | `rgba(255,255,255,0.08)` | Glass borders |
| `--glass-border-hover` | `rgba(10,10,10,0.15)` | `rgba(255,255,255,0.15)` | Glass border hover |

**Tailwind class mappings:**
- Text primary: `text-foreground`
- Text secondary: `text-foreground/60`
- Text tertiary: `text-foreground/50`
- Text faint: `text-foreground/40` or `text-foreground/30`
- Surfaces: `bg-foreground/5` (subtle), `bg-foreground/10` (hover)
- Glass cards: `bg-glass border-glass-border` (auto-adapts to theme)
- Status: `bg-emerald-50 text-emerald-700` (dark mode overrides in CSS)

### Dark Mode ("Dusk" Theme)
- Deep warm-black background (`#0d0a08`)
- Warm-white text (`#f0ece8`)
- Dark glass surfaces (`rgba(0,0,0,0.4)`)
- Status color overrides soften bright reds/greens/ambers in dark mode

### Aurora Background
Three animated gradient blobs with **organic, abstract shapes** (not circles):

**Light mode:**
- **Blob 1** (orange): Top-left, largest
- **Blob 2** (yellow): Top-right  
- **Blob 3** (blue): Bottom-left

**Dark mode ("Dusk"):**
- **Blob 1** (amber/orange): Bottom, sharper blur (60px) — setting sun
- **Blob 2** (gold/yellow): Bottom-right, medium blur (80px) — horizon glow  
- **Blob 3** (violet/indigo): Top, very soft blur (120px) — darkening sky
- **Progressive blur**: sharper near bottom (horizon), softer at top (sky)
- **Noise overlay**: SVG fractalNoise texture at 3% opacity

**Shape morphing**: Blobs use asymmetric `border-radius` that animates between organic shapes:
```css
border-radius: 30% 70% 60% 40% / 60% 30% 70% 40%;
/* morphs to different organic shapes over 20s cycle */
```

Animation: 20s infinite ease-in-out cycle with opacity/scale/position/shape transforms.
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

### Glass Card (used everywhere)
```tsx
className="rounded-2xl bg-glass backdrop-blur-sm border border-glass-border hover:border-glass-border-hover hover:bg-glass-hover transition-all"
```
Adapts automatically between light (frosted white) and dark (frosted black) modes.

### Project Card
Clickable card with hover scale, folder icon, and arrow indicator.
- Container: `bg-glass border-glass-border hover:bg-glass-hover`
- Hover: `whileHover={{ scale: 1.02 }}`

### Project Modal
Full-screen overlay with morphing card animation.
- Width: `max-w-lg md:max-w-2xl`
- Max height: `max-h-[90vh]` with `overflow-y-auto`
- Close button: top-right, `rounded-full bg-foreground/5`
- Backdrop: `bg-background/60 backdrop-blur-xl`

### Pill Buttons (Social Links)
Inline-flex with icon + label.
- Style: `bg-foreground/5 hover:bg-foreground/10 rounded-full px-4 py-2 text-foreground/70`
- Gap between items: `gap-2 sm:gap-3`

### Status Badge
Availability indicator with pulsing dot.
- Container: `bg-emerald-50 border-emerald-200 rounded-full`
- Dot: nested spans with `animate-ping` for pulse effect

### Theme Toggle
Subtle icon button that cycles System → Light → Dark.
- Style: `text-foreground/30 hover:text-foreground/60` — barely visible at rest
- Icons: `monitor` (system), `light_mode` (light), `dark_mode` (dark)
- On homepage: fixed top-right corner
- On projects pages: in ProfileMenu dropdown

### Profile Menu
Click avatar → glassmorphism popover with user info, theme toggle, sign out.
- Container: `bg-glass backdrop-blur-xl border-glass-border`
- Theme toggle row cycles and shows current mode
- Sign out button with red styling

## File Structure

```
homepage/src/app/
├── layout.tsx          # Metadata, fonts, Material Symbols preload, ThemeProvider
├── page.tsx            # Main page, project data, state management, ThemeToggle
├── globals.css         # Aurora, blur animations, dark mode vars, status color overrides
└── components/
    ├── index.ts        # Barrel exports
    ├── types.ts        # Project interface
    ├── AuroraBackground.tsx
    ├── BackButton.tsx   # router.back() pill button
    ├── ProfileMenu.tsx  # Avatar → dropdown with user info, theme toggle, sign out
    ├── ProjectCard.tsx
    ├── ProjectModal.tsx
    ├── ThemeProvider.tsx # Context + localStorage + .dark class management
    └── ThemeToggle.tsx   # Subtle icon button for cycling themes
```

## When Adding New Features

1. **Follow mobile-first**: Start with the mobile view, then add `sm:`, `md:`, `lg:` overrides
2. **Use existing components**: Check if a pattern already exists before creating new ones
3. **Maintain animation consistency**: Use the same spring config for interactive elements
4. **Preload heavy assets**: Add to the `useEffect` preloader if adding images
5. **Test Safari**: Especially for filter/blur animations

## References

- **Component code**: See [references/components.md](references/components.md)
