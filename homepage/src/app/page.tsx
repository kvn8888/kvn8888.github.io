'use client';

export const dynamic = 'force-static';

import Link from 'next/link';
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Analytics } from "@vercel/analytics/next"
import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ProjectCard, ProjectModal, ThemeToggle, type Project, type ProjectCategory } from './components';

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
    category: 'academic',
  },
  // In Progress
  {
    id: 'codegym',
    title: 'CodeGym',
    shortDesc: 'Interactive coding practice platform with real execution',
    tags: ['Go', 'React', 'Docker', 'PostgreSQL'],
    fullDesc: 'A full-stack coding practice platform with a Go backend, React frontend, and Dockerized code execution. Features filesystem-backed problem packs (language, category, problem), a sqlc/goose data layer, and a Storybook component library. Problems define skeleton files, canonical solutions, and test suites in a structured YAML manifest.',
    githubUrl: 'https://github.com/kvn8888/CodeGym',
    category: 'in-progress',
    screenshot: '/screenshots/codegym.png',
  },
  {
    id: 'openfoodjournal',
    title: 'OpenFoodJournal',
    shortDesc: 'Privacy-first iOS food journal with AI-powered nutrition scanning',
    tags: ['SwiftUI', 'SwiftData', 'Gemini', 'HealthKit', 'CloudKit'],
    fullDesc: 'A local-first iOS food journal built with SwiftUI and SwiftData for iOS 26+. Point your camera at a nutrition label or a plate of food and get instant macro/micronutrient tracking — Gemini Flash Lite handles label scans in under 2 seconds, and Gemini Pro estimates plated meals. Features a weekly calendar strip with progress rings, meal sections with swipe-to-edit, a personal Food Bank for saved foods with serving mappings, weight-based container tracking, and HealthKit sync for active energy and 10+ micronutrients. Local-first with automatic iCloud/CloudKit sync across devices. BYOK — users bring their own Gemini key stored in the iOS Keychain; no proxy server needed.',
    githubUrl: 'https://github.com/kvn8888/OpenFoodJournal',
    demoUrl: 'https://apps.apple.com/us/app/openfoodjournal/id6761086648',
    category: 'personal',
  },

  // Hackathon Projects
  {
    id: 'depscope',
    title: 'DepScope',
    shortDesc: '1st Place · Continual Learning Hackathon — Dependency due diligence agent',
    tags: ['Node.js', 'Express', 'React', 'Gemini', 'You.com'],
    fullDesc: 'Autonomous multi-agent system for open-source dependency due diligence. Paste a package name or GitHub URL and three sequential agents run: a Repo Health Analyzer pulling GitHub stats (stars, commit cadence, bus factor, license), an External Researcher using You.com Search to surface CVEs and community sentiment, and a Gemini 2.0 Flash Risk Scorer that synthesizes everything into a letter grade (A–F) with severity-ranked findings and opinionated alternatives. Streams agent progress live via SSE. Scores five dimensions — security (30%), maintenance (25%), stability (20%), community (15%), documentation (10%) — with automatic downgrades for unpatched critical CVEs, archived repos, and single-maintainer staleness. Won 1st place at HackWithBay 2.0.',
    githubUrl: 'https://github.com/kvn8888/DepScope',
    category: 'hackathon',
  },
  {
    id: 'factcheckme',
    title: 'FactCheckMe',
    shortDesc: '2nd Place · c0mpiled-1: Before the Ballot — Real-time audio fact-checking',
    tags: ['React', 'TypeScript', 'Supabase', 'ElevenLabs', 'Gemini', 'Hyperspell'],
    fullDesc: 'Real-time fact-checking tool built for voters watching debates and speeches. ElevenLabs transcribes live audio, Gemini 2.0 with Google Search grounding extracts and verifies claims instantly, and Hyperspell provides semantic caching so repeated talking points return in under 100ms instead of 2–3 seconds. The semantic cache recognizes differently-worded versions of the same claim — "unemployment is 4.2%" and "the unemployment rate is at 4.2%" both hit the cache. Claims surface with verdicts, supporting sources, and a statistics dashboard. Built on Supabase Edge Functions with a React + Tailwind frontend. Won 2nd place at HackWithBay 2.0.',
    githubUrl: 'https://github.com/kvn8888/FactCheckMe',
    category: 'hackathon',
  },
  {
    id: 'guardianeye',
    title: 'GuardianEye',
    shortDesc: '2nd Place · Autonomous Agents Hackathon — AI-powered scam detection',
    tags: ['FastAPI', 'React', 'Neo4j', 'Gemini', 'Tavily', 'Yutori'],
    fullDesc: 'Multi-agent scam detection pipeline that analyzes screenshots, voice recordings, and text messages and returns a RED / YELLOW / GREEN verdict. Six parallel agents run on each submission: Reka Vision reads text from images, GLiNER extracts entities (phone numbers, URLs, dollar amounts), Tavily searches scam databases in roughly 2 seconds, a Yutori Research agent conducts a deep investigation (~60s), Gemini 3 Flash synthesizes the final verdict, and Neo4j maps the scam network connecting entities to past reports. Identical content returns from SQLite/Turso cache instantly. Voice deepfake detection via Modulate. All services degrade gracefully to rule-based fallbacks when API keys are absent. Won 2nd place at HackWithBay 2.0.',
    githubUrl: 'https://github.com/kvn8888/GuardianEye',
    demoUrl: 'https://guardianeyeui.onrender.com/',
    category: 'hackathon',
  },
  {
    id: 'cerberus',
    title: 'Cerberus',
    shortDesc: '3rd Place · HackWithBay 2.0 — Cross-domain threat intelligence agent',
    tags: ['Neo4j', 'FastAPI', 'React', 'RocketRide', 'Claude', 'STIX'],
    fullDesc: 'Cross-domain threat intelligence agent that closes the gap between siloed security tools. Paste a single entity — an npm package, IP address, domain, CVE, or Juspay fraud signal — and Cerberus autonomously traces the full attack chain across software supply chain, network infrastructure, and financial fraud surfaces simultaneously. Built on Neo4j for native cross-domain graph traversal and RocketRide\'s wave-planning agent for parallel tool orchestration. Each investigation streams a Claude-generated narrative with threat score, blast radius, IOC table with defanged export, force-directed threat graph, geo IP map, and MITRE ATT&CK tactic heatmap. A self-improvement loop writes confirmed threat patterns back to Neo4j so repeat investigations skip the LLM entirely and return in ~2 seconds. Integrates Juspay fraud signals as first-class graph nodes and exports STIX 2.1 bundles with TLP markings. Won 3rd place at HackWithBay 2.0.',
    githubUrl: 'https://github.com/kvn8888/Cerberus',
    demoUrl: 'https://cerberus-frontend.onrender.com/',
    category: 'hackathon',
  },
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
      <SpeedInsights/>
      <Analytics />

      {/* Theme toggle — top right, subtle */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Content with staggered blur reveal animation */}
      <div className="text-center max-w-4xl mx-auto relative z-10 pt-8">
        {/* Small tagline — visible immediately, no opacity:0 animation */}
        <p className="text-sm text-foreground/50 mb-4 tracking-wide">Software Engineering Student, Spring 2027</p>

        {/* Main headline — LCP element, must be immediately visible */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-medium tracking-tight mb-8 text-foreground">
          Welcome to KevinC.dev
        </h1>

        {/* Bio text */}
        <p className="text-lg text-foreground/60 max-w-xl mx-auto mb-6 leading-relaxed blur-reveal-2">
          I&apos;m a software engineering student at the Rochester Institute of Technology. Passionate about useful projects that feels great to use.
        </p>

        {/* Social Links */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-8 blur-reveal-3">
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
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-foreground/5 border border-foreground/10 rounded-full blur-reveal-4">
          <span className="text-sm font-medium text-foreground/70">Open to Summer 2026 Opportunities</span>
        </div>

        {/* Projects Section */}
        <div id="projects" className="mt-20 w-full max-w-xl mx-auto">
          <h2 className="text-2xl font-medium text-foreground mb-8 blur-reveal-5">Featured Projects</h2>

          {/* Project List by Category */}
          <div className="space-y-8">
            {(() => {
              let renderedIndex = 0;
              return categoryOrder.map((category) => {
                const categoryProjects = projects.filter((p) => p.category === category);
                if (categoryProjects.length === 0) return null;
                const blurIndex = 6 + renderedIndex++;
                return (
                  <div key={category} className={`blur-reveal-${blurIndex}`}>
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
              });
            })()}
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
        <Link
          href="/projects"
          className="text-xs text-foreground/20 hover:text-foreground/50 transition-colors"
        >
          dashboard
        </Link>
      </div>
    </div>
  );
}
