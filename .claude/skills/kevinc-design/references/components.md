# Component Reference

Actual code patterns used in the KevinC.dev site.

## Aurora Background CSS

```css
@keyframes aurora {
  0%, 100% {
    opacity: 0.5;
    transform: translateX(0) translateY(0) scale(1);
  }
  25% {
    opacity: 0.7;
    transform: translateX(10%) translateY(-10%) scale(1.1);
  }
  50% {
    opacity: 0.4;
    transform: translateX(-5%) translateY(5%) scale(0.95);
  }
  75% {
    opacity: 0.6;
    transform: translateX(-10%) translateY(-5%) scale(1.05);
  }
}

.aurora-bg {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  z-index: -1;
}

.aurora-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.5;
  animation: aurora 20s ease-in-out infinite;
}

.aurora-blob-1 {
  width: 60vw;
  height: 60vw;
  background: radial-gradient(circle, rgba(255, 110, 13, 0.639) 0%, transparent 70%);
  top: -80%;
  left: -10%;
}

.aurora-blob-2 {
  width: 50vw;
  height: 50vw;
  background: radial-gradient(circle, rgba(255, 239, 20, 0.33) 0%, transparent 70%);
  top: 10%;
  right: -30%;
  animation-delay: -7s;
}

.aurora-blob-3 {
  width: 45vw;
  height: 45vw;
  background: radial-gradient(circle, rgba(82, 99, 226, 0.3) 0%, transparent 70%);
  bottom: -30%;
  left: 20%;
  animation-delay: -14s;
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .aurora-blob-1 {
    width: 80vw;
    height: 80vw;
    top: -40%;
    left: -20%;
  }
  .aurora-blob-2 {
    width: 70vw;
    height: 70vw;
    top: 5%;
    right: -20%;
  }
  .aurora-blob-3 {
    width: 65vw;
    height: 65vw;
    bottom: -20%;
    left: 10%;
  }
}
```

## Blur Reveal Animation (Safari-compatible)

```css
@keyframes blurReveal {
  0% {
    -webkit-filter: blur(10px);
    filter: blur(10px);
    opacity: 0;
    transform: translateZ(0);
  }
  100% {
    -webkit-filter: blur(0px);
    filter: blur(0px);
    opacity: 1;
    transform: translateZ(0);
  }
}

.blur-reveal {
  -webkit-filter: blur(10px);
  filter: blur(10px);
  opacity: 0;
  will-change: filter, opacity;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  animation: blurReveal 0.2s ease-out forwards;
}

/* Staggered variants: blur-reveal-1 through blur-reveal-5 */
/* Each adds 0.1s delay */
```

## Project Card Component

```tsx
'use client';

import { motion } from 'framer-motion';
import type { Project } from './types';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
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
          <motion.span
            layoutId={`icon-${project.id}`}
            className="material-symbols-outlined text-gray-400 group-hover:text-gray-600 transition-colors"
          >
            folder_open
          </motion.span>
          <motion.span
            layoutId={`title-${project.id}`}
            className="font-medium text-gray-900"
          >
            {project.title}
          </motion.span>
        </div>
        <span className="material-symbols-outlined text-gray-400 group-hover:text-gray-900 transition-colors">
          arrow_outward
        </span>
      </div>
      <motion.p
        layoutId={`desc-${project.id}`}
        className="text-sm text-gray-500 mt-1 ml-[36px]"
      >
        {project.shortDesc}
      </motion.p>
    </motion.div>
  );
}
```

## Project Type Interface

```typescript
export type ProjectCategory = 'personal' | 'academic' | 'hackathon';

export interface Project {
  id: string;
  title: string;
  shortDesc: string;
  tags: string[];
  fullDesc: string;
  demoUrl: string;
  githubUrl: string;
  category: ProjectCategory;
  screenshot?: string;
}
```

## Status Badge (Availability Indicator)

```tsx
<div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-full">
  <span className="relative flex h-2.5 w-2.5">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
  </span>
  <span className="text-sm font-medium text-emerald-700">Open to Summer 2027 Opportunities</span>
</div>
```

## Preloading Pattern (Images)

```tsx
// In page component useEffect
useEffect(() => {
  projects.forEach((project) => {
    if (project.screenshot) {
      const img = new window.Image();
      img.src = project.screenshot;
    }
  });
}, []);
```

## Safari Animation Fix (Mounted State)

```tsx
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);

// Usage in JSX
<p className={`text-sm ${mounted ? 'blur-reveal' : 'opacity-0'}`}>
  Content here
</p>
```

## Social Link Pill Button

```tsx
<a
  href="https://github.com/kvn8888"
  target="_blank"
  rel="noopener noreferrer"
  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 font-medium transition-colors"
>
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    {/* GitHub icon path */}
  </svg>
  GitHub
</a>
```

## Framer Motion Spring Config

Standard animation config used throughout:

```typescript
transition={{ type: "spring", stiffness: 500, damping: 30 }}
```

For modal content fade-in:

```typescript
initial={{ opacity: 0, filter: 'blur(10px)', y: 10 }}
animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
exit={{ opacity: 0, filter: 'blur(10px)', y: -10 }}
transition={{ delay: 0.1, duration: 0.2 }}
```
