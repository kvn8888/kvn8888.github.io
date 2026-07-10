import { auth } from '@/auth'
import { getSecret } from '@/lib/secrets'
import {
  MONITORED_PROJECTS,
  type DeploymentStatus,
  type HealthState,
  type MonitoredProjectConfig,
  type MonitoredProjectStatus,
  type ProjectHealthResponse,
  type ProviderStatus,
  type RuntimeProbe,
} from '@/lib/projectHealth'
import { NextResponse } from 'next/server'

const PROVIDER_REVALIDATE_SECONDS = 30
const REQUEST_TIMEOUT_MS = 8_000

interface VercelDeployment {
  uid?: string
  url?: string | null
  state?: string
  readyState?: string
  target?: string | null
  createdAt?: number
  created?: number
  buildingAt?: number
  ready?: number
  inspectorUrl?: string
  meta?: Record<string, unknown>
}

interface VercelDeploymentsResponse {
  deployments?: VercelDeployment[]
}

interface RenderService {
  id?: string
  name?: string
  branch?: string
  suspended?: string
  serviceDetails?: {
    plan?: string
    region?: string
    runtime?: string
    url?: string
  }
}

interface RenderDeploy {
  id?: string
  status?: string
  trigger?: string
  createdAt?: string
  startedAt?: string
  finishedAt?: string
  commit?: {
    id?: string
    message?: string
  }
}

function isDevelopmentBypass() {
  return process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true'
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Provider request failed'
}

function isoFromMilliseconds(value?: number) {
  return typeof value === 'number' ? new Date(value).toISOString() : null
}

function durationBetween(start: string | null, finish: string | null) {
  if (!start || !finish) return null
  const duration = new Date(finish).getTime() - new Date(start).getTime()
  return Number.isFinite(duration) && duration >= 0 ? duration : null
}

function mapVercelState(status?: string): HealthState {
  switch (status?.toUpperCase()) {
    case 'READY':
      return 'healthy'
    case 'INITIALIZING':
    case 'BUILDING':
    case 'QUEUED':
      return 'deploying'
    case 'ERROR':
    case 'CANCELED':
    case 'BLOCKED':
      return 'attention'
    default:
      return 'unknown'
  }
}

function mapRenderState(status?: string): HealthState {
  switch (status?.toLowerCase()) {
    case 'live':
    case 'deactivated':
      return 'healthy'
    case 'build_in_progress':
    case 'update_in_progress':
    case 'pre_deploy_in_progress':
      return 'deploying'
    case 'build_failed':
    case 'update_failed':
    case 'pre_deploy_failed':
    case 'canceled':
      return 'attention'
    default:
      return 'unknown'
  }
}

function normalizeVercelDeployment(
  deployment: VercelDeployment,
  environmentFallback: string,
): DeploymentStatus {
  const meta = deployment.meta ?? {}
  const createdAt = isoFromMilliseconds(deployment.createdAt ?? deployment.created)
  const startedAt = isoFromMilliseconds(deployment.buildingAt)
  const finishedAt = isoFromMilliseconds(deployment.ready)
  const status = deployment.state ?? deployment.readyState ?? 'unknown'

  return {
    id: deployment.uid ?? deployment.url ?? `vercel-${createdAt ?? 'unknown'}`,
    providerStatus: status,
    state: mapVercelState(status),
    environment: deployment.target === 'production' ? 'Production' : environmentFallback,
    url: deployment.url ? `https://${deployment.url}` : null,
    dashboardUrl: deployment.inspectorUrl ?? null,
    createdAt,
    startedAt,
    finishedAt,
    durationMs: durationBetween(startedAt, finishedAt),
    commitSha: typeof meta.githubCommitSha === 'string' ? meta.githubCommitSha : null,
    commitMessage: typeof meta.githubCommitMessage === 'string' ? meta.githubCommitMessage : null,
    branch: typeof meta.githubCommitRef === 'string' ? meta.githubCommitRef : null,
  }
}

function normalizeRenderDeployment(
  deployment: RenderDeploy,
  config: MonitoredProjectConfig,
): DeploymentStatus {
  const status = deployment.status ?? 'unknown'
  const startedAt = deployment.startedAt ?? null
  const finishedAt = deployment.finishedAt ?? null

  return {
    id: deployment.id ?? `render-${deployment.createdAt ?? 'unknown'}`,
    providerStatus: status,
    state: mapRenderState(status),
    environment: config.environment,
    url: config.backend.productionUrl,
    dashboardUrl: config.backend.dashboardUrl,
    createdAt: deployment.createdAt ?? null,
    startedAt,
    finishedAt,
    durationMs: durationBetween(startedAt, finishedAt),
    commitSha: deployment.commit?.id ?? null,
    commitMessage: deployment.commit?.message ?? null,
    branch: config.primaryBranch,
  }
}

async function fetchProviderJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    next: { revalidate: PROVIDER_REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`Provider returned HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}

async function probeEndpoint(id: string, label: string, url: string): Promise<RuntimeProbe> {
  const startedAt = performance.now()
  const checkedAt = new Date().toISOString()

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    await response.arrayBuffer()
    const latencyMs = Math.round(performance.now() - startedAt)
    const healthy = response.status >= 200 && response.status < 400

    return {
      id,
      label,
      state: healthy ? 'healthy' : 'down',
      httpStatus: response.status,
      latencyMs,
      checkedAt,
      detail: healthy ? `HTTP ${response.status}` : `Unexpected HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      id,
      label,
      state: 'down',
      httpStatus: null,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt,
      detail: error instanceof Error && error.name === 'TimeoutError' ? 'Timed out' : 'Unreachable',
    }
  }
}

function unknownProvider(
  id: string,
  provider: string,
  role: string,
  icon: string,
  serviceUrl: string,
  dashboardUrl: string,
  probes: RuntimeProbe[],
  error: string,
): ProviderStatus {
  const runtimeDown = probes.some((probe) => probe.state === 'down')

  return {
    id,
    provider,
    role,
    icon,
    state: runtimeDown ? 'down' : 'unknown',
    summary: runtimeDown ? 'Runtime check failed' : 'Provider metadata unavailable',
    serviceUrl,
    dashboardUrl,
    deployment: null,
    latestAttempt: null,
    recentDeployments: [],
    probes,
    metadata: [],
    error,
  }
}

async function getVercelProvider(
  config: MonitoredProjectConfig,
  token: string | undefined,
  teamId: string | undefined,
  frontendProbe: RuntimeProbe,
): Promise<{ provider: ProviderStatus; primaryDeployment: DeploymentStatus | null }> {
  if (!token) {
    return {
      provider: unknownProvider(
        'vercel',
        'Vercel',
        'Frontend hosting',
        'deployed_code',
        config.frontend.productionUrl,
        config.frontend.dashboardUrl,
        [frontendProbe],
        'VERCEL_API_TOKEN is not configured',
      ),
      primaryDeployment: null,
    }
  }

  const productionParams = new URLSearchParams({
    projectId: config.frontend.projectId,
    target: 'production',
    limit: '4',
  })
  const branchParams = new URLSearchParams({
    projectId: config.frontend.projectId,
    branch: config.primaryBranch,
    limit: '6',
  })
  if (teamId) {
    productionParams.set('teamId', teamId)
    branchParams.set('teamId', teamId)
  }

  try {
    const [productionData, branchData] = await Promise.all([
      fetchProviderJson<VercelDeploymentsResponse>(
        `https://api.vercel.com/v7/deployments?${productionParams}`,
        token,
      ),
      fetchProviderJson<VercelDeploymentsResponse>(
        `https://api.vercel.com/v7/deployments?${branchParams}`,
        token,
      ),
    ])
    const productionDeployments = (productionData.deployments ?? []).map((deployment) =>
      normalizeVercelDeployment(deployment, 'Preview'),
    )
    const primaryDeployments = (branchData.deployments ?? []).map((deployment) =>
      normalizeVercelDeployment(deployment, 'Primary preview'),
    )
    const deployment = productionDeployments[0] ?? null
    const primaryDeployment = primaryDeployments[0] ?? null
    const deployState = deployment?.state ?? 'unknown'
    const state = frontendProbe.state === 'down' ? 'down' : deployState

    return {
      provider: {
        id: 'vercel',
        provider: 'Vercel',
        role: 'Frontend hosting',
        icon: 'deployed_code',
        state,
        summary:
          frontendProbe.state === 'down'
            ? 'Production URL is unreachable'
            : deployment?.state === 'healthy'
              ? 'Production is serving normally'
              : deployment?.state === 'deploying'
                ? 'Production deployment is in progress'
                : 'Production deployment needs attention',
        serviceUrl: config.frontend.productionUrl,
        dashboardUrl: config.frontend.dashboardUrl,
        deployment,
        latestAttempt: primaryDeployment,
        recentDeployments: primaryDeployments.slice(0, 4),
        probes: [frontendProbe],
        metadata: [
          { label: 'Project', value: config.frontend.projectName },
          { label: 'Primary branch', value: config.primaryBranch },
        ],
      },
      primaryDeployment,
    }
  } catch (error) {
    return {
      provider: unknownProvider(
        'vercel',
        'Vercel',
        'Frontend hosting',
        'deployed_code',
        config.frontend.productionUrl,
        config.frontend.dashboardUrl,
        [frontendProbe],
        errorMessage(error),
      ),
      primaryDeployment: null,
    }
  }
}

async function getRenderProvider(
  config: MonitoredProjectConfig,
  token: string | undefined,
  probes: RuntimeProbe[],
): Promise<ProviderStatus> {
  if (!token) {
    return unknownProvider(
      'render',
      'Render',
      'Go API hosting',
      'dns',
      config.backend.productionUrl,
      config.backend.dashboardUrl,
      probes,
      'RENDER_API_KEY is not configured',
    )
  }

  try {
    const [serviceData, deployData] = await Promise.all([
      fetchProviderJson<RenderService | { service: RenderService }>(
        `https://api.render.com/v1/services/${config.backend.serviceId}`,
        token,
      ),
      fetchProviderJson<Array<RenderDeploy | { deploy: RenderDeploy }>>(
        `https://api.render.com/v1/services/${config.backend.serviceId}/deploys?limit=8`,
        token,
      ),
    ])
    const service = 'service' in serviceData ? serviceData.service : serviceData
    const deploys = deployData.map((item) => ('deploy' in item ? item.deploy : item))
    const normalizedDeployments = deploys.map((deployment) =>
      normalizeRenderDeployment(deployment, config),
    )
    const liveDeployment = normalizedDeployments.find(
      (deployment) => deployment.providerStatus.toLowerCase() === 'live',
    ) ?? null
    const latestAttempt = normalizedDeployments[0] ?? null
    const livenessDown = probes.some((probe) => probe.id === 'backend-health' && probe.state === 'down')
    const readinessDown = probes.some((probe) => probe.id === 'backend-ready' && probe.state === 'down')
    const suspended = service.suspended === 'suspended'
    const latestFailed = latestAttempt?.state === 'attention'
    const latestDeploying = latestAttempt?.state === 'deploying'

    let state: HealthState = 'healthy'
    let summary = 'API is live and dependencies are ready'
    if (suspended || livenessDown) {
      state = 'down'
      summary = suspended ? 'Render service is suspended' : 'API liveness check failed'
    } else if (readinessDown || latestFailed) {
      state = 'attention'
      summary = readinessDown ? 'API is live but not ready' : 'Live service is healthy; latest deploy failed'
    } else if (latestDeploying) {
      state = 'deploying'
      summary = 'A new backend deployment is in progress'
    } else if (!liveDeployment) {
      state = 'unknown'
      summary = 'No live deployment was reported'
    }

    return {
      id: 'render',
      provider: 'Render',
      role: 'Go API hosting',
      icon: 'dns',
      state,
      summary,
      serviceUrl: service.serviceDetails?.url ?? config.backend.productionUrl,
      dashboardUrl: config.backend.dashboardUrl,
      deployment: liveDeployment,
      latestAttempt,
      recentDeployments: normalizedDeployments.slice(0, 4),
      probes,
      metadata: [
        { label: 'Branch', value: service.branch ?? config.primaryBranch },
        { label: 'Plan', value: service.serviceDetails?.plan ?? 'Unknown' },
        { label: 'Region', value: service.serviceDetails?.region ?? 'Unknown' },
      ],
    }
  } catch (error) {
    return unknownProvider(
      'render',
      'Render',
      'Go API hosting',
      'dns',
      config.backend.productionUrl,
      config.backend.dashboardUrl,
      probes,
      errorMessage(error),
    )
  }
}

function getOverallState(states: HealthState[]): HealthState {
  if (states.includes('down')) return 'down'
  if (states.includes('attention')) return 'attention'
  if (states.includes('deploying')) return 'deploying'
  if (states.includes('unknown')) return 'unknown'
  return 'healthy'
}

async function getProjectStatus(
  config: MonitoredProjectConfig,
  secrets: { vercelToken?: string; vercelTeamId?: string; renderToken?: string },
): Promise<MonitoredProjectStatus> {
  const [frontendProbe, backendHealthProbe, backendReadyProbe] = await Promise.all([
    probeEndpoint('frontend', 'Production site', config.frontend.productionUrl),
    probeEndpoint(
      'backend-health',
      'API health',
      new URL(config.backend.healthPath, config.backend.productionUrl).toString(),
    ),
    probeEndpoint(
      'backend-ready',
      'API readiness',
      new URL(config.backend.readinessPath, config.backend.productionUrl).toString(),
    ),
  ])

  const [vercelResult, renderProvider] = await Promise.all([
    getVercelProvider(config, secrets.vercelToken, secrets.vercelTeamId, frontendProbe),
    getRenderProvider(config, secrets.renderToken, [backendHealthProbe, backendReadyProbe]),
  ])

  const frontendSha = vercelResult.provider.deployment?.commitSha ?? null
  const backendSha = renderProvider.deployment?.commitSha ?? null
  const matchingPrimaryDeployment = Boolean(
    backendSha &&
      vercelResult.primaryDeployment?.commitSha === backendSha &&
      vercelResult.primaryDeployment.state === 'healthy',
  )

  let releaseState: HealthState = 'unknown'
  let releaseMessage = 'Deployment revisions are not available from both providers.'
  if (frontendSha && backendSha && frontendSha === backendSha) {
    releaseState = 'healthy'
    releaseMessage = 'Frontend production and backend are running the same revision.'
  } else if (frontendSha && backendSha) {
    releaseState = 'attention'
    releaseMessage = matchingPrimaryDeployment
      ? 'Backend is ahead of frontend production; a matching frontend deployment is ready to promote.'
      : 'Frontend production and backend are running different revisions.'
  }

  const state = getOverallState([
    vercelResult.provider.state,
    renderProvider.state,
    releaseState,
  ])
  const summary =
    state === 'healthy'
      ? 'Frontend, API, and release revisions are aligned.'
      : state === 'down'
        ? 'A production runtime check is failing.'
        : state === 'deploying'
          ? 'A provider is deploying a new revision.'
          : state === 'attention'
            ? 'Production is reachable, but one signal needs attention.'
            : 'Some provider metadata is unavailable.'

  return {
    id: config.id,
    name: config.name,
    description: config.description,
    environment: config.environment,
    primaryBranch: config.primaryBranch,
    repoUrl: config.repoUrl,
    state,
    summary,
    frontend: vercelResult.provider,
    backend: renderProvider,
    release: {
      state: releaseState,
      frontendSha,
      backendSha,
      matchingPrimaryDeployment,
      message: releaseMessage,
    },
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user && !isDevelopmentBypass()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [vercelToken, vercelTeamId, renderToken] = await Promise.all([
    getSecret('VERCEL_API_TOKEN'),
    getSecret('VERCEL_TEAM_ID'),
    getSecret('RENDER_API_KEY'),
  ])

  const projects = await Promise.all(
    MONITORED_PROJECTS.map((config) =>
      getProjectStatus(config, { vercelToken, vercelTeamId, renderToken }),
    ),
  )
  const response: ProjectHealthResponse = {
    checkedAt: new Date().toISOString(),
    refreshAfterSeconds: 60,
    projects,
  }

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'private, no-store',
    },
  })
}
