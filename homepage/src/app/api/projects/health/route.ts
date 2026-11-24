import { auth } from '@/auth'
import {
  MONITORED_PROJECTS,
  PROVIDER_REGISTRY,
  getProjectProviderIds,
  type CredentialStatus,
  type DeploymentStatus,
  type HealthSignalKind,
  type HealthState,
  type MonitoredProjectConfig,
  type MonitoredProjectStatus,
  type OfficialProviderStatus,
  type ProjectHealthResponse,
  type ProviderId,
  type ProviderRegistryEntry,
  type ProviderStatus,
  type QuotaStatus,
  type RuntimeProbe,
} from '@/lib/projectHealth'
import { getSecret } from '@/lib/secrets'
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

interface StatuspageSummary {
  status?: { indicator?: string; description?: string }
  components?: Array<{ name?: string; status?: string }>
}

interface StatusIoResponse {
  result?: {
    status_overall?: { status?: string; status_code?: number; updated?: string }
    status?: Array<{ name?: string; status?: string; status_code?: number; updated?: string }>
  }
}

interface Auth0NextData {
  props?: {
    pageProps?: {
      activeIncidents?: Array<{
        region?: string
        response?: {
          uptime?: boolean
          incidents?: Array<{ name?: string; status?: string; impact?: string }>
        }
      }>
    }
  }
}

interface AiGatewayModelsResponse {
  data?: Array<{ id?: string }>
}

interface GithubWorkflowRun {
  id?: number
  name?: string
  status?: string
  conclusion?: string | null
  html_url?: string
  head_sha?: string
  head_branch?: string
  created_at?: string
  run_started_at?: string
  updated_at?: string
  display_title?: string
}

interface GithubWorkflowRunsResponse {
  total_count?: number
  workflow_runs?: GithubWorkflowRun[]
}

class ProviderHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
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

function getOverallState(states: HealthState[]): HealthState {
  if (states.includes('down')) return 'down'
  if (states.includes('attention')) return 'attention'
  if (states.includes('deploying')) return 'deploying'
  if (states.includes('unknown')) return 'unknown'
  return 'healthy'
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

function mapStatuspageState(status?: string): HealthState {
  switch (status?.toLowerCase()) {
    case 'operational':
    case 'none':
      return 'healthy'
    case 'degraded_performance':
    case 'partial_outage':
    case 'under_maintenance':
    case 'minor':
      return 'attention'
    case 'major_outage':
    case 'major':
    case 'critical':
      return 'down'
    default:
      return 'unknown'
  }
}

function mapStatusIoState(code?: number, status?: string): HealthState {
  if (code === 100 || status?.toLowerCase() === 'operational') return 'healthy'
  if (code && code >= 500) return 'down'
  if (code && code > 100) return 'attention'
  if (status?.toLowerCase().includes('outage')) return 'down'
  if (status) return 'attention'
  return 'unknown'
}

function mapGithubRunState(run?: GithubWorkflowRun): HealthState {
  if (!run) return 'healthy'
  if (run.status === 'queued' || run.status === 'in_progress' || run.status === 'requested') {
    return 'deploying'
  }
  if (['success', 'neutral', 'skipped'].includes(run.conclusion ?? '')) return 'healthy'
  if (run.conclusion) return 'attention'
  return 'unknown'
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

function affectedProjectIds(providerId: ProviderId) {
  return MONITORED_PROJECTS.filter((project) =>
    getProjectProviderIds(project).includes(providerId),
  ).map((project) => project.id)
}

async function timedFetch(url: string, init?: RequestInit) {
  const startedAt = performance.now()
  const checkedAt = new Date().toISOString()
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  return {
    response,
    checkedAt,
    latencyMs: Math.round(performance.now() - startedAt),
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
    throw new ProviderHttpError(`Provider returned HTTP ${response.status}`, response.status)
  }

  return response.json() as Promise<T>
}

async function probeEndpoint(
  id: string,
  label: string,
  url: string,
  kind: HealthSignalKind = 'runtime',
): Promise<RuntimeProbe> {
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
      kind,
      state: healthy ? 'healthy' : 'down',
      httpStatus: response.status,
      latencyMs,
      checkedAt,
      lastSuccessfulAt: healthy ? checkedAt : null,
      detail: healthy ? `HTTP ${response.status}` : `Unexpected HTTP ${response.status}`,
    }
  } catch (error) {
    return {
      id,
      label,
      kind,
      state: 'down',
      httpStatus: null,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt,
      lastSuccessfulAt: null,
      detail: error instanceof Error && error.name === 'TimeoutError' ? 'Timed out' : 'Unreachable',
    }
  }
}

function officialUnknown(entry: ProviderRegistryEntry, error: unknown): OfficialProviderStatus {
  return {
    id: entry.id,
    provider: entry.name,
    icon: entry.icon,
    state: 'unknown',
    summary: 'Official provider status is unavailable',
    component: entry.components.join(', '),
    statusUrl: entry.statusUrl,
    checkedAt: new Date().toISOString(),
    latencyMs: null,
    affectedProjectIds: affectedProjectIds(entry.id),
    error: errorMessage(error),
  }
}

async function statuspageOfficialStatus(
  entry: ProviderRegistryEntry,
  summaryPromise: Promise<{ data: StatuspageSummary; checkedAt: string; latencyMs: number }>,
): Promise<OfficialProviderStatus> {
  const { data, checkedAt, latencyMs } = await summaryPromise
  const selected = (data.components ?? []).filter((component) =>
    entry.components.includes(component.name ?? ''),
  )
  const states = selected.map((component) => mapStatuspageState(component.status))
  const fallback = mapStatuspageState(data.status?.indicator)
  const state = states.length > 0 ? getOverallState(states) : fallback
  const affected = selected.filter((component) => mapStatuspageState(component.status) !== 'healthy')

  return {
    id: entry.id,
    provider: entry.name,
    icon: entry.icon,
    state,
    summary:
      affected.length > 0
        ? affected.map((component) => `${component.name}: ${component.status?.replaceAll('_', ' ')}`).join(' · ')
        : `${entry.components.length} tracked component${entry.components.length === 1 ? '' : 's'} operational`,
    component: entry.components.join(', '),
    statusUrl: entry.statusUrl,
    checkedAt,
    latencyMs,
    affectedProjectIds: affectedProjectIds(entry.id),
  }
}

async function auth0OfficialStatus(entry: ProviderRegistryEntry): Promise<OfficialProviderStatus> {
  const { response, checkedAt, latencyMs } = await timedFetch(entry.statusApiUrl, {
    headers: { Accept: 'text/html' },
    next: { revalidate: PROVIDER_REVALIDATE_SECONDS },
  })
  if (!response.ok) {
    throw new ProviderHttpError(`Auth0 status returned HTTP ${response.status}`, response.status)
  }
  const html = await response.text()
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!match?.[1]) throw new Error('Auth0 status payload was not found')
  const data = JSON.parse(match[1]) as Auth0NextData
  const regions = data.props?.pageProps?.activeIncidents ?? []
  const region = regions.find((item) => item.region === entry.region)
  const activeIncidents = (region?.response?.incidents ?? []).filter(
    (incident) =>
      !['operational', 'resolved', 'completed'].includes(incident.status?.toLowerCase() ?? '') &&
      incident.impact?.toLowerCase() !== 'none',
  )
  const state = region?.response?.uptime === false
    ? 'down'
    : activeIncidents.some((incident) => ['critical', 'major'].includes(incident.impact?.toLowerCase() ?? ''))
      ? 'down'
      : activeIncidents.length > 0
        ? 'attention'
        : 'healthy'

  return {
    id: entry.id,
    provider: entry.name,
    icon: entry.icon,
    state,
    summary:
      activeIncidents.length > 0
        ? activeIncidents.map((incident) => incident.name ?? 'Active incident').join(' · ')
        : `${entry.region ?? 'Configured region'} operational`,
    component: `${entry.region ?? 'Global'} authentication`,
    statusUrl: entry.statusUrl,
    checkedAt,
    latencyMs,
    affectedProjectIds: affectedProjectIds(entry.id),
  }
}

async function statusIoOfficialStatus(entry: ProviderRegistryEntry): Promise<OfficialProviderStatus> {
  const { response, checkedAt, latencyMs } = await timedFetch(entry.statusApiUrl, {
    headers: { Accept: 'application/json' },
    next: { revalidate: PROVIDER_REVALIDATE_SECONDS },
  })
  if (!response.ok) {
    throw new ProviderHttpError(`Neon status returned HTTP ${response.status}`, response.status)
  }
  const data = (await response.json()) as StatusIoResponse
  const selected = (data.result?.status ?? []).filter((component) =>
    entry.components.includes(component.name ?? ''),
  )
  const states = selected.map((component) => mapStatusIoState(component.status_code, component.status))
  const overall = data.result?.status_overall
  const state = states.length > 0
    ? getOverallState(states)
    : mapStatusIoState(overall?.status_code, overall?.status)
  const affected = selected.filter(
    (component) => mapStatusIoState(component.status_code, component.status) !== 'healthy',
  )

  return {
    id: entry.id,
    provider: entry.name,
    icon: entry.icon,
    state,
    summary:
      affected.length > 0
        ? affected.map((component) => `${component.name}: ${component.status}`).join(' · ')
        : `${entry.components.length} tracked components operational`,
    component: entry.components.join(', '),
    statusUrl: entry.statusUrl,
    checkedAt,
    latencyMs,
    affectedProjectIds: affectedProjectIds(entry.id),
  }
}

async function fetchOfficialProviderStatuses() {
  const statuspageRequests = new Map<
    string,
    Promise<{ data: StatuspageSummary; checkedAt: string; latencyMs: number }>
  >()

  function getStatuspageRequest(url: string) {
    let request = statuspageRequests.get(url)
    if (!request) {
      request = (async () => {
        const { response, checkedAt, latencyMs } = await timedFetch(url, {
          headers: { Accept: 'application/json' },
          next: { revalidate: PROVIDER_REVALIDATE_SECONDS },
        })
        if (!response.ok) {
          throw new ProviderHttpError(`Status page returned HTTP ${response.status}`, response.status)
        }
        return { data: (await response.json()) as StatuspageSummary, checkedAt, latencyMs }
      })()
      statuspageRequests.set(url, request)
    }
    return request
  }

  return Promise.all(
    PROVIDER_REGISTRY.map(async (entry) => {
      try {
        if (entry.statusAdapter === 'statuspage') {
          return await statuspageOfficialStatus(entry, getStatuspageRequest(entry.statusApiUrl))
        }
        if (entry.statusAdapter === 'auth0') return await auth0OfficialStatus(entry)
        return await statusIoOfficialStatus(entry)
      } catch (error) {
        return officialUnknown(entry, error)
      }
    }),
  )
}

function credentialFromError(token: string | undefined, error: unknown): CredentialStatus {
  if (!token) {
    return { state: 'missing', label: 'Not configured', detail: 'Management API token is missing' }
  }
  if (error instanceof ProviderHttpError && [401, 403].includes(error.status)) {
    return { state: 'invalid', label: 'Rejected', detail: `Provider returned HTTP ${error.status}` }
  }
  return { state: 'configured', label: 'Configured', detail: 'Token exists; validation was inconclusive' }
}

function explainProvider(official: OfficialProviderStatus, integrationState: HealthState) {
  const providerIncident = ['attention', 'down'].includes(official.state)
  const integrationIssue = ['attention', 'down', 'unknown'].includes(integrationState)
  if (official.state === 'unknown') {
    return 'Official status is unavailable; this result comes from the CodeGym-specific check.'
  }
  if (providerIncident && integrationIssue) {
    return 'The provider incident may be contributing to this CodeGym failure.'
  }
  if (providerIncident && !integrationIssue) {
    return 'The provider reports an incident, but the CodeGym path is still responding.'
  }
  if (!providerIncident && integrationIssue) {
    return 'The provider reports healthy; this points to CodeGym credentials, configuration, or runtime.'
  }
  return 'Official status and the CodeGym-specific check agree.'
}

function attachOfficial(
  provider: Omit<ProviderStatus, 'official' | 'affectedProjectIds' | 'explanation'>,
  official: OfficialProviderStatus,
  projectId: string,
): ProviderStatus {
  return {
    ...provider,
    official,
    affectedProjectIds: [projectId],
    explanation: explainProvider(official, provider.state),
  }
}

function unknownProvider(
  config: MonitoredProjectConfig,
  providerId: ProviderId,
  provider: string,
  role: string,
  icon: string,
  serviceUrl: string,
  dashboardUrl: string,
  probes: RuntimeProbe[],
  official: OfficialProviderStatus,
  credential: CredentialStatus,
  error: string,
): ProviderStatus {
  const runtimeDown = probes.some((probe) => probe.state === 'down')
  const state = runtimeDown ? 'down' : 'unknown'

  return attachOfficial(
    {
      id: `${config.id}-${providerId}`,
      providerId,
      provider,
      role,
      icon,
      state,
      summary: runtimeDown ? 'CodeGym-specific check failed' : 'Provider metadata unavailable',
      serviceUrl,
      dashboardUrl,
      deployment: null,
      latestAttempt: null,
      recentDeployments: [],
      probes,
      metadata: [],
      credential,
      error,
    },
    official,
    config.id,
  )
}

async function getVercelProvider(
  config: MonitoredProjectConfig,
  token: string | undefined,
  teamId: string | undefined,
  frontendProbe: RuntimeProbe,
  official: OfficialProviderStatus,
): Promise<{ provider: ProviderStatus; primaryDeployment: DeploymentStatus | null }> {
  if (!token) {
    return {
      provider: unknownProvider(
        config,
        'vercel',
        'Vercel',
        'Frontend hosting',
        'deployed_code',
        config.frontend.productionUrl,
        config.frontend.dashboardUrl,
        [frontendProbe],
        official,
        credentialFromError(token, new Error('Missing token')),
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
    const provider = attachOfficial(
      {
        id: `${config.id}-vercel`,
        providerId: 'vercel',
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
        credential: { state: 'valid', label: 'Verified', detail: 'Management API token accepted' },
      },
      official,
      config.id,
    )
    return { provider, primaryDeployment }
  } catch (error) {
    return {
      provider: unknownProvider(
        config,
        'vercel',
        'Vercel',
        'Frontend hosting',
        'deployed_code',
        config.frontend.productionUrl,
        config.frontend.dashboardUrl,
        [frontendProbe],
        official,
        credentialFromError(token, error),
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
  official: OfficialProviderStatus,
): Promise<ProviderStatus> {
  if (!token) {
    return unknownProvider(
      config,
      'render',
      'Render',
      'Go API hosting',
      'dns',
      config.backend.productionUrl,
      config.backend.dashboardUrl,
      probes,
      official,
      credentialFromError(token, new Error('Missing token')),
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

    return attachOfficial(
      {
        id: `${config.id}-render`,
        providerId: 'render',
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
        credential: { state: 'valid', label: 'Verified', detail: 'Management API token accepted' },
      },
      official,
      config.id,
    )
  } catch (error) {
    return unknownProvider(
      config,
      'render',
      'Render',
      'Go API hosting',
      'dns',
      config.backend.productionUrl,
      config.backend.dashboardUrl,
      probes,
      official,
      credentialFromError(token, error),
      errorMessage(error),
    )
  }
}

async function getAuth0Integration(
  config: MonitoredProjectConfig,
  official: OfficialProviderStatus,
): Promise<ProviderStatus> {
  const integration = config.integrations.auth0
  const serviceUrl = `https://${integration.domain}/.well-known/openid-configuration`
  const startedAt = performance.now()
  const checkedAt = new Date().toISOString()
  let probe: RuntimeProbe
  let state: HealthState
  let summary: string
  let error: string | undefined

  try {
    const response = await fetch(serviceUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const body = response.ok ? (await response.json()) as { issuer?: string; jwks_uri?: string } : null
    const configured = Boolean(body?.issuer && body.jwks_uri)
    state = response.ok && configured ? 'healthy' : response.ok ? 'attention' : 'down'
    summary = state === 'healthy'
      ? 'OIDC discovery and signing-key configuration are reachable'
      : response.ok
        ? 'OIDC discovery is missing required metadata'
        : `OIDC discovery returned HTTP ${response.status}`
    probe = {
      id: 'auth0-discovery',
      label: 'OIDC discovery',
      kind: 'integration',
      state,
      httpStatus: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt,
      lastSuccessfulAt: state === 'healthy' ? checkedAt : null,
      detail: summary,
    }
  } catch (caught) {
    state = 'down'
    summary = 'OIDC discovery is unreachable'
    error = errorMessage(caught)
    probe = {
      id: 'auth0-discovery',
      label: 'OIDC discovery',
      kind: 'integration',
      state,
      httpStatus: null,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt,
      lastSuccessfulAt: null,
      detail: 'Unreachable',
    }
  }

  return attachOfficial(
    {
      id: `${config.id}-auth0`,
      providerId: 'auth0',
      provider: 'Auth0',
      role: 'Authentication',
      icon: 'shield_lock',
      state,
      summary,
      serviceUrl,
      dashboardUrl: integration.dashboardUrl,
      deployment: null,
      latestAttempt: null,
      recentDeployments: [],
      probes: [probe],
      metadata: [{ label: 'Tenant', value: integration.domain }],
      credential: {
        state: 'not_required',
        label: 'Public check',
        detail: 'Discovery and JWKS metadata require no management credential',
      },
      error,
    },
    official,
    config.id,
  )
}

function getNeonIntegration(
  config: MonitoredProjectConfig,
  backendReadyProbe: RuntimeProbe,
  official: OfficialProviderStatus,
): ProviderStatus {
  const probe: RuntimeProbe = {
    ...backendReadyProbe,
    id: 'neon-readiness',
    label: 'Database via API readiness',
    kind: 'integration',
    detail:
      backendReadyProbe.state === 'healthy'
        ? 'Backend database readiness passed'
        : 'Backend database readiness failed',
  }
  const state = probe.state

  return attachOfficial(
    {
      id: `${config.id}-neon`,
      providerId: 'neon',
      provider: 'Neon',
      role: 'Postgres readiness',
      icon: 'database',
      state,
      summary:
        state === 'healthy'
          ? 'CodeGym can reach its database through the backend'
          : 'The backend readiness check cannot confirm database access',
      serviceUrl: new URL(config.backend.readinessPath, config.backend.productionUrl).toString(),
      dashboardUrl: config.integrations.neon.dashboardUrl,
      deployment: null,
      latestAttempt: null,
      recentDeployments: [],
      probes: [probe],
      metadata: [{ label: 'Verification', value: 'Backend /ready' }],
      credential: {
        state: state === 'healthy' ? 'valid' : 'unknown',
        label: state === 'healthy' ? 'Verified indirectly' : 'Unconfirmed',
        detail: 'The database credential remains backend-managed and is verified through /ready',
      },
    },
    official,
    config.id,
  )
}

async function getAiGatewayIntegration(
  config: MonitoredProjectConfig,
  official: OfficialProviderStatus,
): Promise<ProviderStatus> {
  const integration = config.integrations.aiGateway
  const startedAt = performance.now()
  const checkedAt = new Date().toISOString()
  let probe: RuntimeProbe
  let state: HealthState
  let summary: string
  let modelCount = 'Unknown'
  let error: string | undefined

  try {
    const response = await fetch(integration.catalogUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const body = response.ok ? (await response.json()) as AiGatewayModelsResponse : null
    const models = body?.data ?? []
    const configuredModelAvailable = models.some((model) => model.id === integration.model)
    modelCount = String(models.length)
    state = !response.ok ? 'down' : configuredModelAvailable ? 'healthy' : 'attention'
    summary = !response.ok
      ? `Model catalog returned HTTP ${response.status}`
      : configuredModelAvailable
        ? 'Gateway catalog includes the configured CodeGym model'
        : 'Gateway is reachable, but the configured model is absent from its catalog'
    probe = {
      id: 'ai-gateway-catalog',
      label: 'Model catalog',
      kind: 'integration',
      state,
      httpStatus: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt,
      lastSuccessfulAt: response.ok ? checkedAt : null,
      detail: summary,
    }
  } catch (caught) {
    state = 'down'
    summary = 'AI Gateway model catalog is unreachable'
    error = errorMessage(caught)
    probe = {
      id: 'ai-gateway-catalog',
      label: 'Model catalog',
      kind: 'integration',
      state,
      httpStatus: null,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt,
      lastSuccessfulAt: null,
      detail: 'Unreachable',
    }
  }

  return attachOfficial(
    {
      id: `${config.id}-vercel-ai-gateway`,
      providerId: 'vercel-ai-gateway',
      provider: 'Vercel AI Gateway',
      role: 'Generation path',
      icon: 'route',
      state,
      summary,
      serviceUrl: integration.catalogUrl,
      dashboardUrl: integration.dashboardUrl,
      deployment: null,
      latestAttempt: null,
      recentDeployments: [],
      probes: [probe],
      metadata: [
        { label: 'Configured model', value: integration.model },
        { label: 'Catalog models', value: modelCount },
      ],
      credential: {
        state: 'unknown',
        label: 'Not exercised',
        detail: 'The backend API key is intentionally not tested with a billable generation',
      },
      error,
    },
    official,
    config.id,
  )
}

function githubQuota(response: Response): QuotaStatus | undefined {
  const remaining = Number(response.headers.get('x-ratelimit-remaining'))
  const limit = Number(response.headers.get('x-ratelimit-limit'))
  if (!Number.isFinite(remaining) || !Number.isFinite(limit)) return undefined
  const warning = remaining <= Math.max(100, limit * 0.1)
    ? `Only ${remaining.toLocaleString()} API requests remain in this window`
    : null
  return {
    label: 'GitHub API rate limit',
    used: Math.max(0, limit - remaining),
    remaining,
    limit,
    warning,
  }
}

async function getGithubIntegration(
  config: MonitoredProjectConfig,
  token: string | undefined,
  official: OfficialProviderStatus,
): Promise<ProviderStatus> {
  const integration = config.integrations.github
  const url = `https://api.github.com/repos/${integration.owner}/${integration.repo}/actions/runs?branch=${encodeURIComponent(config.primaryBranch)}&per_page=1`
  const startedAt = performance.now()
  const checkedAt = new Date().toISOString()
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const response = await fetch(url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new ProviderHttpError(`GitHub returned HTTP ${response.status}`, response.status)
    }
    const body = (await response.json()) as GithubWorkflowRunsResponse
    const run = body.workflow_runs?.[0]
    const state = mapGithubRunState(run)
    const runStatus = run?.conclusion ?? run?.status ?? 'No workflow runs'
    const probe: RuntimeProbe = {
      id: 'github-actions',
      label: 'Repository and Actions API',
      kind: 'integration',
      state,
      httpStatus: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt,
      lastSuccessfulAt: checkedAt,
      detail: run ? `Latest run: ${runStatus}` : 'Repository reachable; no workflow runs returned',
    }

    return attachOfficial(
      {
        id: `${config.id}-github`,
        providerId: 'github',
        provider: 'GitHub',
        role: 'Source and CI',
        icon: 'code',
        state,
        summary: run
          ? `${run.name ?? 'Latest workflow'} is ${runStatus.replaceAll('_', ' ')}`
          : 'Repository is reachable; no recent workflow run was returned',
        serviceUrl: config.repoUrl,
        dashboardUrl: integration.dashboardUrl,
        deployment: null,
        latestAttempt: null,
        recentDeployments: [],
        probes: [probe],
        metadata: [
          { label: 'Latest revision', value: run?.head_sha?.slice(0, 7) ?? 'Unknown' },
          { label: 'Workflow', value: run?.name ?? 'No recent run' },
        ],
        credential: token
          ? { state: 'valid', label: 'Verified', detail: 'GitHub token accepted' }
          : { state: 'missing', label: 'Public fallback', detail: 'No token; using the public repository API' },
        quota: githubQuota(response),
      },
      official,
      config.id,
    )
  } catch (error) {
    const credential: CredentialStatus = token
      ? credentialFromError(token, error)
      : { state: 'missing', label: 'Public fallback failed', detail: 'No GitHub token is configured' }
    return unknownProvider(
      config,
      'github',
      'GitHub',
      'Source and CI',
      'code',
      config.repoUrl,
      integration.dashboardUrl,
      [{
        id: 'github-actions',
        label: 'Repository and Actions API',
        kind: 'integration',
        state: 'down',
        httpStatus: error instanceof ProviderHttpError ? error.status : null,
        latencyMs: Math.round(performance.now() - startedAt),
        checkedAt,
        lastSuccessfulAt: null,
        detail: errorMessage(error),
      }],
      official,
      credential,
      errorMessage(error),
    )
  }
}

function getOfficial(
  statuses: Map<ProviderId, OfficialProviderStatus>,
  providerId: ProviderId,
): OfficialProviderStatus {
  const status = statuses.get(providerId)
  if (status) return status
  const registry = PROVIDER_REGISTRY.find((entry) => entry.id === providerId)
  if (!registry) throw new Error(`Unknown provider: ${providerId}`)
  return officialUnknown(registry, new Error('Official status was not collected'))
}

async function getProjectStatus(
  config: MonitoredProjectConfig,
  secrets: {
    vercelToken?: string
    vercelTeamId?: string
    renderToken?: string
    githubToken?: string
  },
  officialStatuses: Map<ProviderId, OfficialProviderStatus>,
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

  const [vercelResult, renderProvider, auth0Provider, aiGatewayProvider, githubProvider] = await Promise.all([
    getVercelProvider(
      config,
      secrets.vercelToken,
      secrets.vercelTeamId,
      frontendProbe,
      getOfficial(officialStatuses, 'vercel'),
    ),
    getRenderProvider(
      config,
      secrets.renderToken,
      [backendHealthProbe, backendReadyProbe],
      getOfficial(officialStatuses, 'render'),
    ),
    getAuth0Integration(config, getOfficial(officialStatuses, 'auth0')),
    getAiGatewayIntegration(config, getOfficial(officialStatuses, 'vercel-ai-gateway')),
    getGithubIntegration(config, secrets.githubToken, getOfficial(officialStatuses, 'github')),
  ])
  const neonProvider = getNeonIntegration(
    config,
    backendReadyProbe,
    getOfficial(officialStatuses, 'neon'),
  )
  const integrations = [auth0Provider, neonProvider, aiGatewayProvider, githubProvider]

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
    ...integrations.map((integration) => integration.state),
    releaseState,
  ])
  const summary =
    state === 'healthy'
      ? 'Frontend, API, integrations, and release revisions are healthy.'
      : state === 'down'
        ? 'A CodeGym-specific runtime or integration check is failing.'
        : state === 'deploying'
          ? 'A deployment or workflow is in progress.'
          : state === 'attention'
            ? 'Production is reachable, but one CodeGym-specific signal needs attention.'
            : 'Some project-specific metadata is unavailable.'

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
    integrations,
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

  const [providers, vercelToken, vercelTeamId, renderToken, githubToken] = await Promise.all([
    fetchOfficialProviderStatuses(),
    getSecret('VERCEL_API_TOKEN'),
    getSecret('VERCEL_TEAM_ID'),
    getSecret('RENDER_API_KEY'),
    getSecret('GITHUB_PAT'),
  ])
  const officialStatuses = new Map(providers.map((provider) => [provider.id, provider]))
  const projects = await Promise.all(
    MONITORED_PROJECTS.map((config) =>
      getProjectStatus(
        config,
        { vercelToken, vercelTeamId, renderToken, githubToken },
        officialStatuses,
      ),
    ),
  )
  const response: ProjectHealthResponse = {
    checkedAt: new Date().toISOString(),
    refreshAfterSeconds: 60,
    providers,
    projects,
    monitoring: {
      source: 'Checks execute from the kevinc.dev server runtime.',
      boundary: 'They validate read-only public metadata, deployment APIs, and CodeGym runtime paths.',
      externalAlerting: 'Use an independent uptime service for alerts when kevinc.dev or Vercel is unavailable.',
    },
  }

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'private, no-store',
    },
  })
}
