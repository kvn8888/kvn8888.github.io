'use client';

import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"
import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AuroraBackground, ProjectCard, ProjectModal, ThemeToggle, type Project, type ProjectCategory } from './components';

const projects: Project[] = [
  // Personal Projects
  {
    id: 'kevinc-dashboard',
    title: 'Personal Dashboard',
    shortDesc: 'Authenticated ops hub built into this site',
    tags: ['Next.js', 'Auth.js', 'Turso', 'AWS S3'],
    fullDesc: 'The protected half of this site — a self-hosted ops dashboard behind Google OAuth. Includes an API usage monitor with daily snapshot history and burn-rate projections across Tavily, Vercel, Render, GitHub, and more; a cover letter workbench with a Turso-backed reusable block/tag library, Gemini-powered block matching and rubric grading, and S3-backed draft + reference resume storage; a runtime secrets manager that overrides env vars without a redeploy and optionally syncs them to Vercel; and a sign-in manager for approving invited users with per-page access grants.',
    demoUrl: '/projects',
    githubUrl: 'https://github.com/kvn8888/kvn8888.github.io',
    category: 'personal',
    screenshot: '/screenshots/homepage.png',
  },
  {
    id: 'polymarket-ev-bot',
    title: 'Polymarket +EV Trading Bot',
    shortDesc: 'Sports betting arbitrage bot for Polymarket prediction markets',
    tags: ['TypeScript', 'Docker', 'React', 'Turso'],
    fullDesc: 'A sports betting arbitrage bot that finds positive expected value (EV) opportunities between sportsbook odds and Polymarket prediction markets. Fetches odds from The Odds API (NFL, NBA, NHL), de-vigs to find true probability, and identifies mispriced Polymarket contracts. Sizes bets using Kelly Criterion (1/4 Kelly, 5% max position) and supports both paper trading and live execution via the Polymarket CLOB API. Includes a full web dashboard with portfolio overview, live opportunities, position tracking, per-user secrets management, and a pooled Odds API usage monitor.',
    demoUrl: 'https://polymarket-ev-bot-docker.onrender.com/polymarket/',
    githubUrl: 'https://github.com/kvn8888/polymarket-ev-bot',
    category: 'personal',
    screenshot: '/screenshots/polymarket.png',
  },
  // Academic Projects
  {
    id: 'ta-portal',
    title: 'TA Portal',
    shortDesc: 'DevOps & infrastructure lead for a 4-service course project',
    tags: ['GitHub Actions', 'Docker', 'nginx', 'Next.js', 'Prisma'],
    fullDesc: 'Led DevOps and infrastructure for a course-built TA portal. Designed a GitHub Actions CI/CD pipeline with Nx monorepo tooling for parallel lint/test and branch-convention-triggered deployments. Containerized a 4-service stack (MariaDB, Workflow API, Express.js, Next.js) with Docker Compose health checks and persistent volumes. Configured nginx as a reverse proxy with SSL termination, set up SSH key-based passwordless deployment from GitHub Actions to the production VM, and hardened the server with UFW firewall rules. Fixed Prisma ORM client generation in Docker and resolved Next.js basePath routing behind the proxy.',
    demoUrl: '#',
    githubUrl: '#',
    category: 'academic',
  },
  // In Progress
  {
    id: 'codegym',
    title: 'CodeGym',
    shortDesc: 'Interactive coding practice platform with real execution',
    tags: ['Go', 'React', 'Docker', 'PostgreSQL'],
    fullDesc: 'A full-stack coding practice platform with a Go backend, React frontend, and Dockerized code execution. Features filesystem-backed problem packs (language, category, problem), a sqlc/goose data layer, and a Storybook component library. Problems define skeleton files, canonical solutions, and test suites in a structured YAML manifest.',
    demoUrl: '#',
    githubUrl: 'https://github.com/kvn8888/CodeGym',
    category: 'in-progress',
    screenshot: '/screenshots/codegym.png',
  },
  {
    id: 'openfoodjournal',
    title: 'OpenFoodJournal',
    shortDesc: 'Open source self hosted myfitnesspal alternative with SwiftUI',
    tags: ['TBD'],
    fullDesc: 'TBD, planning',
    demoUrl: '#',
    githubUrl: 'https://github.com/kvn8888/OpenFoodJournal',
    category: 'in-progress',
  },

  // Hackathon Projects (placeholder)
];

const categoryLabels: Record<ProjectCategory, string> = {
  personal: 'Personal Projects',
  academic: 'Academic Projects',
  hackathon: 'Hackathon Projects',
  'in-progress': 'In Progress',
};

const categoryOrder: ProjectCategory[] = ['personal', 'academic', 'hackathon', 'in-progress'];

export default function Home() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [mounted, setMounted] = useState(false);

  // Trigger animations after mount (fixes Safari refresh caching)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Preload all project screenshots on mount
  useEffect(() => {
    projects.forEach((project) => {
      if (project.screenshot) {
        const img = new window.Image();
        img.src = project.screenshot;
      }
    });
  }, []);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedProject(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (selectedProject) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [selectedProject]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative">
      <AuroraBackground />
      <SpeedInsights/>
      <Analytics />

      {/* Theme toggle — top right, subtle */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Content with staggered blur reveal animation */}
      <div className="text-center max-w-4xl mx-auto relative z-10">
        {/* Small tagline */}
        <p className={`text-sm text-foreground/50 mb-4 tracking-wide ${mounted ? 'blur-reveal' : 'opacity-0'}`}>Software Engineering Student, Spring 2027</p>

        {/* Main headline */}
        <h1 className={`text-5xl sm:text-6xl md:text-7xl font-medium tracking-tight mb-8 text-foreground ${mounted ? 'blur-reveal-1' : 'opacity-0'}`}>
          Welcome to KevinC.dev
        </h1>

        {/* Bio text */}
        <p className={`text-lg text-foreground/60 max-w-xl mx-auto mb-6 leading-relaxed ${mounted ? 'blur-reveal-2' : 'opacity-0'}`}>
          I&apos;m a software engineering student at the Rochester Institute of Technology.
          Currently on an internship at Ivalua, Inc.
        </p>

        {/* Social Links */}
        <div className={`flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-8 ${mounted ? 'blur-reveal-3' : 'opacity-0'}`}>
          <a
            href="https://github.com/kvn8888"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-foreground/5 hover:bg-foreground/10 rounded-full text-foreground/70 font-medium transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
          </a>
          <a
            href="https://www.linkedin.com/in/k3vnc"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-foreground/5 hover:bg-foreground/10 rounded-full text-foreground/70 font-medium transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            LinkedIn
          </a>
          <a
            href="/api/resume"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-foreground/5 hover:bg-foreground/10 rounded-full text-foreground/70 font-medium transition-colors"
          >
            <span className="material-symbols-outlined text-xl">description</span>
            Resume
          </a>
        </div>

        {/* Status Badge */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 bg-foreground/5 border border-foreground/10 rounded-full ${mounted ? 'blur-reveal-4' : 'opacity-0'}`}>
          <span className="text-sm font-medium text-foreground/70">Open to Summer 2026 Opportunities</span>
        </div>

        {/* Projects Section */}
        <div id="projects" className="mt-20 w-full max-w-xl mx-auto">
          <h2 className={`text-2xl font-medium text-foreground mb-8 ${mounted ? 'blur-reveal-5' : 'opacity-0'}`}>Featured Projects</h2>

          {/* Project List by Category */}
          <div className="space-y-8">
            {categoryOrder.map((category, index) => {
              const categoryProjects = projects.filter((p) => p.category === category);
              if (categoryProjects.length === 0) return null;
              return (
                <div key={category} className={mounted ? `blur-reveal-${6 + index}` : 'opacity-0'}>
                  <h3 className="text-sm font-medium text-foreground/50 uppercase tracking-wider mb-3 text-left">
                    {categoryLabels[category]}
                  </h3>
                  <div className="space-y-3">
                    {categoryProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onClick={() => setSelectedProject(project)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Framer Motion Modal */}
      <AnimatePresence>
        {selectedProject && (
          <ProjectModal
            project={selectedProject}
            onClose={() => setSelectedProject(null)}
          />
        )}
      </AnimatePresence>

      {/* Admin link */}
      <div className="flex justify-end py-8 pr-4">
        <a
          href="/projects"
          className="text-xs text-foreground/20 hover:text-foreground/50 transition-colors"
        >
          dashboard
        </a>
      </div>
    </div>
  );
}
