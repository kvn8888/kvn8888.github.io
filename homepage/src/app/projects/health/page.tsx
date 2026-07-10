'use client'

import { useCallback, useEffect, useState } from 'react'
import type {
  DeploymentStatus,
  HealthState,
  MonitoredProjectStatus,
  ProjectHealthResponse,
  ProviderStatus,
  RuntimeProbe,
} from '@/lib/projectHealth'

const statePresentation: Record<
  HealthState,
  { label: string; badge: string; dot: string; icon: string }
> = {
  healthy: {
    label: 'Healthy',
    badge: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    dot: 'bg-emerald-500',
    icon: 'check_circle',
  },
  attention: {
    label: 'Attention',
    badge: 'bg-amber-50 border-amber-200 text-amber-700',
    dot: 'bg-amber-400',
    icon: 'warning',
  },
  deploying: {
    label: 'Deploying',
    badge: 'bg-foreground/5 border-glass-border text-foreground/70',
    dot: 'bg-sky-400',
    icon: 'progress_activity',
  },
  down: {
    label: 'Down',
    badge: 'bg-red-50 border-red-200 text-red-700',
    dot: 'bg-red-500',
    icon: 'error',
  },
  unknown: {
    label: 'Unknown',
    badge: 'bg-foreground/5 border-glass-border text-foreground/50',
    dot: 'bg-foreground/25',
    icon: 'help',
  },
}

function shortSha(value: string | null) {
  return value ? value.slice(0, 7) : 'unknown'
}

function sentenceCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatRelativeTime(value: string | null) {
  if (!value) return 'Unknown time'
  const timestamp = new Date(value).getTime()
  const differenceSeconds = Math.round((timestamp - Date.now()) / 1000)
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const ranges: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ]

  for (const [unit, seconds] of ranges) {
    if (Math.abs(differenceSeconds) >= seconds) {
      return formatter.format(Math.round(differenceSeconds / seconds), unit)
    }
  }

  return formatter.format(differenceSeconds, 'second')
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return null
  const seconds = Math.round(durationMs / 1000)
  if (seconds < 60) return `${seconds}s build`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s build`
}

function StatusPill({ state, label }: { state: HealthState; label?: string }) {
  const presentation = statePresentation[state]

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${presentation.badge}`}
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {state === 'deploying' && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${presentation.dot}`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${presentation.dot}`} />
      </span>
      {label ?? presentation.label}
    </span>
  )
}

function ProbeRow({ probe }: { probe: RuntimeProbe }) {
  const presentation = statePresentation[probe.state]

  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`h-2 w-2 shrink-0 rounded-full ${presentation.dot}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground/75">{probe.label}</p>
          <p className="text-xs text-foreground/35">{probe.detail}</p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-xs text-foreground/60">
          {probe.latencyMs === null ? '—' : `${probe.latencyMs} ms`}
        </p>
        <p className="text-[11px] text-foreground/30">
          {probe.httpStatus === null ? 'No response' : `HTTP ${probe.httpStatus}`}
        </p>
      </div>
    </div>
  )
}

function DeploymentRow({ deployment }: { deployment: DeploymentStatus }) {
  const presentation = statePresentation[deployment.state]
  const time = deployment.finishedAt ?? deployment.createdAt
  const content = (
    <div className="group/deploy flex items-start justify-between gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-foreground/5">
      <div className="flex min-w-0 gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${presentation.dot}`} aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs font-medium text-foreground/70">
              {shortSha(deployment.commitSha)}
            </span>
            <span className="text-[11px] text-foreground/35">{deployment.environment}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-foreground/50">
            {deployment.commitMessage?.split('\n')[0] ?? sentenceCase(deployment.providerStatus)}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[11px] text-foreground/45">{formatRelativeTime(time)}</p>
        <p className="mt-1 text-[11px] text-foreground/30">
          {formatDuration(deployment.durationMs) ?? sentenceCase(deployment.providerStatus)}
        </p>
      </div>
    </div>
  )

  if (!deployment.dashboardUrl) return content

  return (
    <a href={deployment.dashboardUrl} target="_blank" rel="noreferrer" className="block">
      {content}
    </a>
  )
}

function ProviderCard({ provider }: { provider: ProviderStatus }) {
  const currentDeployment = provider.deployment

  return (
    <section className="min-w-0 rounded-2xl border border-glass-border bg-glass p-5 backdrop-blur-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-glass-border bg-foreground/5">
            <span className="material-symbols-outlined text-xl text-foreground/55" aria-hidden="true">
              {provider.icon}
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-xs text-foreground/35">{provider.role}</p>
            <h3 className="truncate text-lg font-medium text-foreground">{provider.provider}</h3>
          </div>
        </div>
        <StatusPill state={provider.state} />
      </div>

      <p className="mt-4 min-h-10 text-sm leading-5 text-foreground/50">{provider.summary}</p>

      <div className="mt-5 rounded-xl border border-glass-border bg-foreground/[0.025] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/35">
            Live revision
          </p>
          <a
            href={provider.serviceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-foreground/40 transition-colors hover:text-foreground/70"
          >
            Open service
            <span className="material-symbols-outlined text-sm" aria-hidden="true">arrow_outward</span>
          </a>
        </div>

        {currentDeployment ? (
          <div className="mt-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-xl font-medium tracking-tight text-foreground">
                  {shortSha(currentDeployment.commitSha)}
                </p>
                <p className="mt-1 text-xs text-foreground/40">
                  {currentDeployment.branch ?? 'Branch unavailable'} · {formatRelativeTime(currentDeployment.finishedAt ?? currentDeployment.createdAt)}
                </p>
              </div>
              <span className="text-xs text-foreground/35">
                {formatDuration(currentDeployment.durationMs) ?? sentenceCase(currentDeployment.providerStatus)}
              </span>
            </div>
            <p className="mt-3 line-clamp-2 text-sm leading-5 text-foreground/55">
              {currentDeployment.commitMessage?.split('\n')[0] ?? 'Commit message unavailable'}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-foreground/40">Deployment metadata is unavailable.</p>
        )}
      </div>

      <div className="mt-5 divide-y divide-foreground/5">
        {provider.probes.map((probe) => (
          <ProbeRow key={probe.id} probe={probe} />
        ))}
      </div>

      {provider.metadata.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {provider.metadata.map((item) => (
            <span
              key={item.label}
              className="rounded-full border border-glass-border bg-foreground/[0.035] px-3 py-1.5 text-[11px] text-foreground/45"
            >
              {item.label}: <span className="font-medium text-foreground/65">{item.value}</span>
            </span>
          ))}
        </div>
      )}

      {provider.error && (
        <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
          <span className="material-symbols-outlined mt-0.5 text-sm" aria-hidden="true">warning</span>
          <span>{provider.error}</span>
        </div>
      )}

      <div className="mt-6 border-t border-foreground/5 pt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/35">
            Recent deployments
          </p>
          <a
            href={provider.dashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-foreground/35 transition-colors hover:text-foreground/65"
          >
            View all
          </a>
        </div>
        {provider.recentDeployments.length > 0 ? (
          <div className="-mx-3">
            {provider.recentDeployments.slice(0, 3).map((deployment) => (
              <DeploymentRow key={deployment.id} deployment={deployment} />
            ))}
          </div>
        ) : (
          <p className="py-3 text-sm text-foreground/35">No deployment history available.</p>
        )}
      </div>
    </section>
  )
}

function ReleaseAlignmentCard({ project }: { project: MonitoredProjectStatus }) {
  const release = project.release
  const presentation = statePresentation[release.state]

  return (
    <section
      className={`rounded-2xl border p-5 sm:p-6 ${
        release.state === 'healthy'
          ? 'border-emerald-200 bg-emerald-50'
          : release.state === 'attention'
            ? 'border-amber-200 bg-amber-50'
            : 'border-glass-border bg-glass backdrop-blur-sm'
      }`}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${presentation.dot}`} aria-hidden="true" />
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] opacity-55">Release alignment</p>
            <h3 className="mt-1 text-lg font-medium">{release.message}</h3>
            {release.matchingPrimaryDeployment && release.state === 'attention' && (
              <p className="mt-2 text-sm opacity-60">
                The primary-branch frontend build already matches the live API revision.
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="rounded-xl border border-current/10 bg-background/30 px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wider opacity-45">Frontend</p>
            <p className="mt-1 font-mono text-sm font-medium">{shortSha(release.frontendSha)}</p>
          </div>
          <span className="text-lg opacity-35" aria-hidden="true">→</span>
          <div className="rounded-xl border border-current/10 bg-background/30 px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wider opacity-45">Backend</p>
            <p className="mt-1 font-mono text-sm font-medium">{shortSha(release.backendSha)}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function ProjectSection({ project }: { project: MonitoredProjectStatus }) {
  return (
    <article className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-glass-border bg-glass backdrop-blur-sm">
        <div className="relative p-5 sm:p-7">
          <div className="absolute inset-y-0 right-0 hidden w-2/5 opacity-50 sm:block" aria-hidden="true">
            <div className="absolute right-8 top-1/2 h-36 w-36 -translate-y-1/2 rounded-full bg-foreground/[0.035]" />
            <div className="absolute right-20 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full border border-foreground/10" />
          </div>

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-glass-border bg-foreground/5 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/45">
                  {project.environment}
                </span>
                <span className="font-mono text-[11px] text-foreground/30">{project.primaryBranch}</span>
              </div>
              <h2 className="mt-4 text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
                {project.name}
              </h2>
              <p className="mt-2 text-sm leading-6 text-foreground/50 sm:text-base">
                {project.description}
              </p>
              <p className="mt-3 text-sm text-foreground/45">{project.summary}</p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <StatusPill state={project.state} />
              <a
                href={project.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-glass-border bg-foreground/5 px-3 py-1.5 text-xs font-medium text-foreground/55 transition-colors hover:bg-foreground/10 hover:text-foreground/75"
              >
                GitHub
                <span className="material-symbols-outlined text-sm" aria-hidden="true">arrow_outward</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)]">
        <ProviderCard provider={project.frontend} />
        <div className="hidden items-center justify-center lg:flex" aria-hidden="true">
          <div className="relative h-px w-full bg-foreground/10">
            <span className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-glass-border bg-background text-sm text-foreground/35">
              →
            </span>
          </div>
        </div>
        <ProviderCard provider={project.backend} />
      </div>

      <ReleaseAlignmentCard project={project} />
    </article>
  )
}

function LoadingState() {
  return (
    <div className="space-y-5" aria-label="Loading project health">
      <div className="h-44 animate-pulse rounded-2xl border border-glass-border bg-glass" />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="h-[520px] animate-pulse rounded-2xl border border-glass-border bg-glass" />
        <div className="h-[520px] animate-pulse rounded-2xl border border-glass-border bg-glass" />
      </div>
    </div>
  )
}

export default function ProjectHealthPage() {
  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState<ProjectHealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadHealth = useCallback(async (showRefreshing: boolean) => {
    if (showRefreshing) setRefreshing(true)

    try {
      const response = await fetch('/api/projects/health', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error ?? `Health API returned ${response.status}`)
      }

      setData(payload as ProjectHealthResponse)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load project health')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    void loadHealth(false)

    const interval = window.setInterval(() => {
      void loadHealth(false)
    }, 60_000)

    return () => window.clearInterval(interval)
  }, [loadHealth])

  return (
    <div className="pb-12">
      <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            className={`text-xs font-medium uppercase tracking-[0.18em] text-foreground/35 ${
              mounted ? 'blur-reveal' : 'opacity-0'
            }`}
          >
            Private operations
          </p>
          <h1
            className={`mt-3 text-3xl font-medium tracking-tight text-foreground sm:text-4xl ${
              mounted ? 'blur-reveal-1' : 'opacity-0'
            }`}
          >
            Project health
          </h1>
          <p
            className={`mt-3 max-w-2xl text-sm leading-6 text-foreground/50 sm:text-base ${
              mounted ? 'blur-reveal-2' : 'opacity-0'
            }`}
          >
            Deployment truth, live runtime checks, and release alignment in one place.
          </p>
        </div>

        <div
          className={`flex flex-wrap items-center gap-3 ${mounted ? 'blur-reveal-2' : 'opacity-0'}`}
        >
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-foreground/30">Last checked</p>
            <p className="mt-1 text-xs text-foreground/50">
              {data ? formatRelativeTime(data.checkedAt) : 'Waiting for signals'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadHealth(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-full border border-glass-border bg-foreground/5 px-4 py-2 text-sm font-medium text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground/80 disabled:cursor-wait disabled:opacity-50"
          >
            <span
              className={`material-symbols-outlined text-base ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            >
              refresh
            </span>
            Refresh
          </button>
        </div>
      </header>

      <div className={mounted ? 'blur-reveal-3' : 'opacity-0'}>
        {error && !data ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            <div className="flex gap-3">
              <span className="material-symbols-outlined" aria-hidden="true">error</span>
              <div>
                <h2 className="font-medium">Project health is unavailable</h2>
                <p className="mt-1 text-sm opacity-75">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadHealth(true)}
                  className="mt-4 rounded-full border border-current/20 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-background/20"
                >
                  Try again
                </button>
              </div>
            </div>
          </section>
        ) : data ? (
          <div className="space-y-10">
            {error && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Refresh failed; showing the last successful snapshot. {error}
              </div>
            )}
            {data.projects.map((project) => (
              <ProjectSection key={project.id} project={project} />
            ))}
          </div>
        ) : (
          <LoadingState />
        )}
      </div>
    </div>
  )
}
