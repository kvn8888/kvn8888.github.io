# Component Reference

Actual source code and patterns from the KevinC.dev site. Read the relevant section when implementing a specific component or pattern.

## Table of Contents

1. [CSS Animations](#css-animations)
2. [Core Components](#core-components)
3. [Page Structure Patterns](#page-structure-patterns)
4. [Protected Area Patterns](#protected-area-patterns)
5. [Reusable UI Snippets](#reusable-ui-snippets)

---

## CSS Animations

### Aurora Background

Three fixed blobs positioned off-screen edges, blurred into smooth gradients.

```css
@keyframes aurora {
  0%, 100% { opacity: 0.5; transform: translateX(0) translateY(0) scale(1); }
  25%  { opacity: 0.7; transform: translateX(10%) translateY(-10%) scale(1.1); }
  50%  { opacity: 0.4; transform: translateX(-5%) translateY(5%) scale(0.95); }
  75%  { opacity: 0.6; transform: translateX(-10%) translateY(-5%) scale(1.05); }
}

.aurora-bg {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  overflow: hidden; z-index: -1;
}

.aurora-blob {
  position: absolute; border-radius: 50%;
  filter: blur(80px); opacity: 0.5;
  animation: aurora 20s ease-in-out infinite;
}

/* Blob 1 — orange, top-left, largest */
.aurora-blob-1 {
  width: 60vw; height: 60vw;
  background: radial-gradient(circle, rgba(255, 110, 13, 0.639) 0%, transparent 70%);
  top: -80%; left: -10%;
  animation-delay: 0s;
}

/* Blob 2 — yellow, top-right */
.aurora-blob-2 {
  width: 50vw; height: 50vw;
  background: radial-gradient(circle, rgba(255, 239, 20, 0.33) 0%, transparent 70%);
  top: 10%; right: -30%;
  animation-delay: -7s;
}

/* Blob 3 — blue, bottom-left */
.aurora-blob-3 {
  width: 45vw; height: 45vw;
  background: radial-gradient(circle, rgba(82, 99, 226, 0.3) 0%, transparent 70%);
  bottom: -30%; left: 20%;
  animation-delay: -14s;
}

/* Mobile: blobs scale up, reposition */
@media (max-width: 768px) {
  .aurora-blob-1 { width: 80vw; height: 80vw; top: -40%; left: -20%; }
  .aurora-blob-2 { width: 70vw; height: 70vw; top: 5%; right: -20%; }
  .aurora-blob-3 { width: 65vw; height: 65vw; bottom: -20%; left: 10%; }
}
```

### Blur Reveal (Safari-compatible stagger)

Page load animation: blur(10px) + opacity:0 → sharp + opacity:1.
Classes `blur-reveal` through `blur-reveal-5` stagger by 100ms each.

```css
@keyframes blurReveal {
  0%   { -webkit-filter: blur(10px); filter: blur(10px); opacity: 0; transform: translateZ(0); }
  100% { -webkit-filter: blur(0px);  filter: blur(0px);  opacity: 1; transform: translateZ(0); }
}

/* blur-reveal = 0ms delay, blur-reveal-1 = 100ms, ..., blur-reveal-5 = 500ms */
.blur-reveal   { animation: blurReveal 0.2s ease-out 0s   forwards; }
.blur-reveal-1 { animation: blurReveal 0.2s ease-out 0.1s forwards; }
.blur-reveal-2 { animation: blurReveal 0.2s ease-out 0.2s forwards; }
.blur-reveal-3 { animation: blurReveal 0.2s ease-out 0.3s forwards; }
.blur-reveal-4 { animation: blurReveal 0.2s ease-out 0.4s forwards; }
.blur-reveal-5 { animation: blurReveal 0.2s ease-out 0.5s forwards; }

/* All classes start hidden and set will-change for GPU acceleration */
.blur-reveal, .blur-reveal-1, ... {
  -webkit-filter: blur(10px); filter: blur(10px);
  opacity: 0; will-change: filter, opacity;
  -webkit-backface-visibility: hidden; backface-visibility: hidden;
}
```

**Safari fix**: Safari caches the final animation state on refresh, skipping the reveal. Fix by only adding the class after mount:

```tsx
const [mounted, setMounted] = useState(false)
useEffect(() => { setMounted(true) }, [])

// In JSX — start hidden, add animation class after mount
<h1 className={`text-5xl font-medium ${mounted ? 'blur-reveal-1' : 'opacity-0'}`}>
```

---

## Core Components

### AuroraBackground

Wrapper that renders three blobs. Drop it as the first child of any full-page layout.

```tsx
// src/app/components/AuroraBackground.tsx
export function AuroraBackground() {
  return (
    <div className="aurora-bg">
      <div className="aurora-blob aurora-blob-1"></div>
      <div className="aurora-blob aurora-blob-2"></div>
      <div className="aurora-blob aurora-blob-3"></div>
    </div>
  )
}
```

Usage: place before all other content in any page that needs the gradient background.

### ProjectCard

Framer Motion card with shared `layoutId` for card→modal morph transition.

```tsx
// src/app/components/ProjectCard.tsx
'use client'
import { motion } from 'framer-motion'
import type { Project } from './types'

export function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <motion.div
      layoutId={`card-${project.id}`}
      onClick={onClick}
      className="p-4 rounded-xl border bg-white/50 border-white/20 hover:bg-white/80 transition-colors cursor-pointer group"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.span layoutId={`icon-${project.id}`}
            className="material-symbols-outlined text-gray-400 group-hover:text-gray-600 transition-colors">
            folder_open
          </motion.span>
          <motion.span layoutId={`title-${project.id}`} className="font-medium text-gray-900">
            {project.title}
          </motion.span>
        </div>
        <span className="material-symbols-outlined text-gray-400 group-hover:text-gray-900 transition-colors">
          arrow_outward
        </span>
      </div>
      <motion.p layoutId={`desc-${project.id}`} className="text-sm text-gray-500 mt-1 ml-[36px]">
        {project.shortDesc}
      </motion.p>
    </motion.div>
  )
}
```

**Key**: icon + title + description all carry `layoutId` so they morph into the modal header.
The `ml-[36px]` aligns text under the icon (icon is 24px + gap-3 = 36px).

### ProjectModal

Full-screen overlay with shared element morph from the card. Wrap with `<AnimatePresence>` in the parent.

```tsx
// src/app/components/ProjectModal.tsx
'use client'
import { motion } from 'framer-motion'
import Image from 'next/image'
import type { Project } from './types'

export function ProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const isSvg = project.screenshot?.endsWith('.svg')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="absolute inset-0 bg-white/60 backdrop-blur-xl pointer-events-auto"
      />

      {/* Modal — morphs from card via layoutId */}
      <motion.div
        layoutId={`card-${project.id}`}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="bg-white rounded-2xl w-full max-w-lg md:max-w-2xl p-6 sm:p-8 shadow-2xl relative border border-gray-100 flex flex-col z-10 overflow-hidden pointer-events-auto max-h-[90vh] overflow-y-auto"
      >
        {/* Close button */}
        <button onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 transition-colors z-20">
          <span className="material-symbols-outlined text-gray-500">close</span>
        </button>

        {/* Header — morphs from card */}
        <div className="mb-6 pr-12">
          <div className="flex items-center gap-3 mb-2">
            <motion.span layoutId={`icon-${project.id}`} className="material-symbols-outlined text-gray-400">
              folder_open
            </motion.span>
            <motion.h3 layoutId={`title-${project.id}`} className="text-2xl font-medium text-gray-900 m-0">
              {project.title}
            </motion.h3>
          </div>
          <motion.p layoutId={`desc-${project.id}`} className="text-gray-500 ml-[36px]">
            {project.shortDesc}
          </motion.p>
        </div>

        {/* Body — fades in after morph */}
        <motion.div
          initial={{ opacity: 0, filter: 'blur(10px)', y: 10 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          exit={{ opacity: 0, filter: 'blur(10px)', y: -10 }}
          transition={{ delay: 0.1, duration: 0.2 }}
          className="flex flex-col flex-grow ml-[36px]"
        >
          {/* Screenshot */}
          {project.screenshot && (
            <div className="mb-6 -ml-[36px] rounded-xl overflow-hidden border border-gray-200 bg-gray-100" style={{ minHeight: '200px' }}>
              {isSvg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.screenshot} alt={`${project.title} screenshot`}
                  className="w-full h-auto" style={{ maxHeight: '400px', objectFit: 'cover', objectPosition: 'top' }} />
              ) : (
                <Image src={project.screenshot} alt={`${project.title} screenshot`}
                  width={800} height={600} className="w-full h-auto"
                  style={{ maxHeight: '400px', objectFit: 'cover', objectPosition: 'top' }} priority />
              )}
            </div>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-6">
            {project.tags.map((tag) => (
              <span key={tag} className="px-3 py-1 text-sm bg-gray-100 rounded-full text-gray-600">{tag}</span>
            ))}
          </div>

          <p className="text-gray-600 leading-relaxed mb-8">{project.fullDesc}</p>

          {/* CTAs */}
          <div className="flex items-center gap-4 mt-auto">
            <a href={project.demoUrl} onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center px-6 py-3 bg-black text-white rounded-full font-medium hover:bg-gray-900 transition-colors">
              View Demo
              <span className="material-symbols-outlined ml-1 text-sm">arrow_outward</span>
            </a>
            <a href={project.githubUrl} onClick={(e) => e.stopPropagation()}
              className="px-6 py-3 text-gray-600 hover:text-gray-900 font-medium transition-colors">
              GitHub
            </a>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
```

**Parent usage**:

```tsx
import { AnimatePresence } from 'framer-motion'

<AnimatePresence>
  {selectedProject && (
    <ProjectModal project={selectedProject} onClose={() => setSelectedProject(null)} />
  )}
</AnimatePresence>
```

### Project Type

```typescript
// src/app/components/types.ts
export type ProjectCategory = 'personal' | 'academic' | 'hackathon'

export interface Project {
  id: string
  title: string
  shortDesc: string
  tags: string[]
  fullDesc: string
  demoUrl: string
  githubUrl: string
  category: ProjectCategory
  screenshot?: string   // path to /public/screenshots/, or omit
}
```

---

## Page Structure Patterns

### Homepage Layout

Full-page centered layout with aurora background and staggered blur reveal.

```tsx
// Structure of src/app/page.tsx
export default function Home() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])  // Safari animation fix

  // Preload screenshots
  useEffect(() => {
    projects.forEach((p) => { if (p.screenshot) { const img = new window.Image(); img.src = p.screenshot } })
  }, [])

  // ESC key closes modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedProject(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Body scroll lock when modal open
  useEffect(() => {
    document.body.style.overflow = selectedProject ? 'hidden' : ''
  }, [selectedProject])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative">
      <AuroraBackground />

      <div className="text-center max-w-4xl mx-auto relative z-10">
        {/* Tagline — blur-reveal (0ms) */}
        <p className={`text-sm text-gray-500 mb-4 tracking-wide ${mounted ? 'blur-reveal' : 'opacity-0'}`}>
          Software Engineering Student, Spring 2027
        </p>

        {/* Headline — blur-reveal-1 (100ms) */}
        <h1 className={`text-5xl sm:text-6xl md:text-7xl font-medium tracking-tight mb-8 text-black ${mounted ? 'blur-reveal-1' : 'opacity-0'}`}>
          Welcome to KevinC.dev
        </h1>

        {/* Bio — blur-reveal-2 (200ms) */}
        <p className={`text-lg text-gray-600 max-w-xl mx-auto mb-6 leading-relaxed ${mounted ? 'blur-reveal-2' : 'opacity-0'}`}>
          ...
        </p>

        {/* Social links — blur-reveal-3 (300ms) */}
        <div className={`flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-8 ${mounted ? 'blur-reveal-3' : 'opacity-0'}`}>
          {/* Pill buttons */}
        </div>

        {/* Status badge — blur-reveal-4 (400ms) */}
        <div className={`... ${mounted ? 'blur-reveal-4' : 'opacity-0'}`}>...</div>

        {/* Projects section — blur-reveal-5 (500ms) */}
        <div id="projects" className={`mt-20 w-full max-w-xl mx-auto ${mounted ? 'blur-reveal-5' : 'opacity-0'}`}>
          <h2 className="text-2xl font-medium text-gray-900 mb-8">Featured Projects</h2>
          <div className="space-y-8">
            {/* Category groups → ProjectCard list */}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedProject && <ProjectModal project={selectedProject} onClose={() => setSelectedProject(null)} />}
      </AnimatePresence>

      {/* Hidden admin link — very low opacity */}
      <div className="flex justify-end py-8 pr-4">
        <a href="/projects" className="text-xs text-foreground/20 hover:text-foreground/50 transition-colors">
          dashboard
        </a>
      </div>
    </div>
  )
}
```

---

## Protected Area Patterns

The `/projects/*` section uses CSS variables (`foreground`/`background`) instead of gray-N Tailwind classes, and glassmorphism instead of solid white cards.

### Projects Layout (Sticky Header + Shell)

```tsx
// src/app/projects/layout.tsx
export default async function ProjectLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <>
      <AuroraBackground />
      <div className="min-h-screen">
        {/* Sticky glassmorphism header */}
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/60 border-b border-foreground/5">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-sm text-foreground/60 hover:text-foreground transition-colors">
                ← Home
              </Link>
              <span className="text-foreground font-medium">Projects</span>
            </div>
            <div className="flex items-center gap-3">
              {session?.user?.image && (
                <Image src={session.user.image} alt="" width={28} height={28} className="rounded-full" />
              )}
              <span className="text-sm text-foreground/60">{session?.user?.name}</span>
              <form action={async () => { "use server"; await signOut({ redirectTo: "/" }) }}>
                <button type="submit" className="text-sm text-foreground/40 hover:text-foreground transition-colors cursor-pointer">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </div>
    </>
  )
}
```

### Projects Hub (Glassmorphism Card Grid)

Navigation cards with icon + title + description. Used on `/projects`.

```tsx
// src/app/projects/page.tsx
export default async function ProjectPage() {
  const session = await auth()

  return (
    <div className="blur-reveal">
      <div className="mb-8">
        <h1 className="text-3xl font-medium text-foreground">
          Welcome, {session?.user?.name?.split(" ")[0]}
        </h1>
        <p className="text-foreground/60 mt-2">Your private project hub. Choose a section below.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projectLinks.map((link) => (
          <a key={link.href} href={link.href}
            className="group block p-6 rounded-2xl bg-white/60 backdrop-blur-sm border border-foreground/5 hover:border-foreground/15 hover:bg-white/80 transition-all">
            <span className="material-symbols-outlined text-foreground/40 group-hover:text-foreground/70 transition-colors text-3xl">
              {link.icon}
            </span>
            <h2 className="text-lg font-medium text-foreground mt-3">{link.title}</h2>
            <p className="text-sm text-foreground/50 mt-1">{link.description}</p>
          </a>
        ))}
      </div>
    </div>
  )
}
```

**Glassmorphism card formula**: `bg-white/60 backdrop-blur-sm border border-foreground/5 hover:border-foreground/15 hover:bg-white/80`

### Sign-In Page

```tsx
// src/app/auth/signin/page.tsx
export default function SignInPage() {
  return (
    <>
      <AuroraBackground />
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm blur-reveal">
          {/* Glassmorphism form card */}
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/20 p-8">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-medium text-foreground">Sign In</h1>
              <p className="text-sm text-foreground/60 mt-2">This area is private. Authorized access only.</p>
            </div>

            <form action={async () => { "use server"; await signIn("google", { redirectTo: "/projects" }) }}>
              {/* Full-width primary button */}
              <button type="submit"
                className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-foreground text-background font-medium hover:opacity-90 transition-opacity cursor-pointer">
                <svg className="w-5 h-5" viewBox="0 0 24 24">{/* Google G icon paths */}</svg>
                Continue with Google
              </button>
            </form>

            <p className="text-xs text-foreground/40 text-center mt-6">
              Only authorized accounts can access project pages.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
```

---

## Reusable UI Snippets

### Pill Button (Social Links)

```tsx
<a href="https://github.com/kvn8888" target="_blank" rel="noopener noreferrer"
  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 font-medium transition-colors">
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">{/* icon */}</svg>
  GitHub
</a>
```

### Tech Tag / Chip

```tsx
<span className="px-3 py-1 text-sm bg-gray-100 rounded-full text-gray-600">{tag}</span>
```

### Status Badge (No dot)

Plain text badge using gray-100 — matches the pill button surface.

```tsx
<div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-200 rounded-full">
  <span className="text-sm font-medium text-gray-700">Open to Summer 2026 Opportunities</span>
</div>
```

### Status Badge (With animated dot)

Use when indicating live/active status (e.g., available for hire).

```tsx
<div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-full">
  <span className="relative flex h-2.5 w-2.5">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
  </span>
  <span className="text-sm font-medium text-emerald-700">Open to opportunities</span>
</div>
```

### Category Section Header

```tsx
<h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3 text-left">
  Personal Projects
</h3>
```

### Primary CTA Button (Black)

```tsx
<a href={url}
  className="inline-flex items-center justify-center px-6 py-3 bg-black text-white rounded-full font-medium hover:bg-gray-900 transition-colors">
  View Demo
  <span className="material-symbols-outlined ml-1 text-sm">arrow_outward</span>
</a>
```

### Ghost / Text Button

```tsx
<a href={url} className="px-6 py-3 text-gray-600 hover:text-gray-900 font-medium transition-colors">
  GitHub
</a>
```

### Material Symbol Icon

```tsx
<span className="material-symbols-outlined">folder_open</span>
```

Common icons used: `folder_open`, `arrow_outward`, `close`, `monitoring`, `dashboard`, `edit_note`, `build`, `description`

### Framer Motion Spring (Standard)

```typescript
transition={{ type: "spring", stiffness: 500, damping: 30 }}
```

### Framer Motion Blur Fade (Modal content)

```typescript
initial={{ opacity: 0, filter: 'blur(10px)', y: 10 }}
animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
exit={{ opacity: 0, filter: 'blur(10px)', y: -10 }}
transition={{ delay: 0.1, duration: 0.2 }}
```

### Image Preloader

```tsx
useEffect(() => {
  items.forEach((item) => {
    if (item.imageSrc) { const img = new window.Image(); img.src = item.imageSrc }
  })
}, [])
```
