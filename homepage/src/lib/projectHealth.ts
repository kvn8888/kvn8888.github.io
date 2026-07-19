export type HealthState = 'healthy' | 'attention' | 'deploying' | 'down' | 'unknown'
export type HealthSignalKind = 'provider' | 'integration' | 'runtime' | 'deployment'
export type CredentialState =
  | 'valid'
  | 'configured'
  | 'missing'
  | 'invalid'
  | 'not_required'
  | 'unknown'

export interface RuntimeProbe {
  id: string
  label: string
  kind: HealthSignalKind
  state: HealthState
  httpStatus: number | null
  latencyMs: number | null
  checkedAt: string
  lastSuccessfulAt: string | null
  detail: string
}

export interface DeploymentStatus {
  id: string
  providerStatus: string
  state: HealthState
  environment: string
  url: string | null
  dashboardUrl: string | null
  createdAt: string | null
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
  commitSha: string | null
  commitMessage: string | null
  branch: string | null
}

export interface OfficialProviderStatus {
  id: ProviderId
  provider: string
  icon: string
  state: HealthState
  summary: string
  component: string
  statusUrl: string
  checkedAt: string
  latencyMs: number | null
  affectedProjectIds: string[]
  error?: string
}

export interface CredentialStatus {
  state: CredentialState
  label: string
  detail: string
}

export interface QuotaStatus {
  label: string
  used: number | null
  remaining: number | null
  limit: number | null
  warning: string | null
}

export interface ProviderStatus {
  id: string
  providerId: ProviderId
  provider: string
  role: string
  icon: string
  state: HealthState
  summary: string
  serviceUrl: string
  dashboardUrl: string
  deployment: DeploymentStatus | null
  latestAttempt: DeploymentStatus | null
  recentDeployments: DeploymentStatus[]
  probes: RuntimeProbe[]
  metadata: Array<{ label: string; value: string }>
  official: OfficialProviderStatus
  credential: CredentialStatus
  affectedProjectIds: string[]
  explanation: string
  quota?: QuotaStatus
  error?: string
}

export interface ReleaseAlignment {
  state: HealthState
  frontendSha: string | null
  backendSha: string | null
  matchingPrimaryDeployment: boolean
  message: string
}

export interface MonitoredProjectStatus {
  id: string
  name: string
  description: string
  environment: string
  primaryBranch: string
  repoUrl: string
  state: HealthState
  summary: string
  frontend: ProviderStatus
  backend: ProviderStatus
  integrations: ProviderStatus[]
  release: ReleaseAlignment
}

export interface ProjectHealthResponse {
  checkedAt: string
  refreshAfterSeconds: number
  providers: OfficialProviderStatus[]
  projects: MonitoredProjectStatus[]
  monitoring: {
    source: string
    boundary: string
    externalAlerting: string
  }
}

export type ProviderId =
  | 'vercel'
  | 'render'
  | 'auth0'
  | 'neon'
  | 'vercel-ai-gateway'
  | 'github'

export interface ProviderRegistryEntry {
  id: ProviderId
  name: string
  icon: string
  statusUrl: string
  statusAdapter: 'statuspage' | 'auth0' | 'statusio'
  statusApiUrl: string
  components: readonly string[]
  region?: string
}

export interface MonitoredProjectConfig {
  id: string
  name: string
  description: string
  environment: string
  primaryBranch: string
  repoUrl: string
  frontend: {
    provider: 'vercel'
    projectId: string
    projectName: string
    productionUrl: string
    dashboardUrl: string
  }
  backend: {
    provider: 'render'
    serviceId: string
    serviceName: string
    productionUrl: string
    dashboardUrl: string
    healthPath: string
    readinessPath: string
  }
  integrations: {
    auth0: {
      provider: 'auth0'
      domain: string
      dashboardUrl: string
    }
    neon: {
      provider: 'neon'
      dashboardUrl: string
    }
    aiGateway: {
      provider: 'vercel-ai-gateway'
      catalogUrl: string
      dashboardUrl: string
      model: string
    }
    github: {
      provider: 'github'
      owner: string
      repo: string
      dashboardUrl: string
    }
  }
}

export const PROVIDER_REGISTRY: readonly ProviderRegistryEntry[] = [
  {
    id: 'vercel',
    name: 'Vercel',
    icon: 'deployed_code',
    statusUrl: 'https://www.vercel-status.com',
    statusAdapter: 'statuspage',
    statusApiUrl: 'https://www.vercel-status.com/api/v2/summary.json',
    components: ['Build & Deploy', 'CDN', 'Functions'],
  },
  {
    id: 'render',
    name: 'Render',
    icon: 'dns',
    statusUrl: 'https://status.render.com',
    statusAdapter: 'statuspage',
    statusApiUrl: 'https://status.render.com/api/v2/summary.json',
    components: ['Web Services - Free Tier', 'Builds and Deploys', 'Render REST API', 'Oregon'],
  },
  {
    id: 'auth0',
    name: 'Auth0',
    icon: 'shield_lock',
    statusUrl: 'https://status.auth0.com',
    statusAdapter: 'auth0',
    statusApiUrl: 'https://status.auth0.com',
    components: ['Authentication'],
    region: 'US-1',
  },
  {
    id: 'neon',
    name: 'Neon',
    icon: 'database',
    statusUrl: 'https://neonstatus.com',
    statusAdapter: 'statusio',
    statusApiUrl: 'https://api.status.io/1.0/status/6878fc85709daa75be6c7e3c',
    components: ['Database Connectivity', 'Project/Branch Operations'],
  },
  {
    id: 'vercel-ai-gateway',
    name: 'Vercel AI Gateway',
    icon: 'route',
    statusUrl: 'https://www.vercel-status.com',
    statusAdapter: 'statuspage',
    statusApiUrl: 'https://www.vercel-status.com/api/v2/summary.json',
    components: ['AI Gateway'],
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: 'code',
    statusUrl: 'https://www.githubstatus.com',
    statusAdapter: 'statuspage',
    statusApiUrl: 'https://www.githubstatus.com/api/v2/summary.json',
    components: ['Actions', 'Git Operations', 'API Requests'],
  },
] as const

export const MONITORED_PROJECTS: readonly MonitoredProjectConfig[] = [
  {
    id: 'codegym',
    name: 'CodeGym',
    description: 'Generative AI interview practice with a Vite frontend and Go API.',
    environment: 'Production',
    primaryBranch: 'codegym-v2',
    repoUrl: 'https://github.com/kvn8888/CodeGym',
    frontend: {
      provider: 'vercel',
      projectId: 'prj_1Re8jChmQGTsWiCyI5B2Kq5QEbOB',
      projectName: 'code-gym',
      productionUrl: 'https://code-gym-rho.vercel.app',
      dashboardUrl: 'https://vercel.com/kvn8888s-projects/code-gym/deployments',
    },
    backend: {
      provider: 'render',
      serviceId: 'srv-d95vvg1o3t8c7396tq80',
      serviceName: 'CodeGym',
      productionUrl: 'https://codegym.onrender.com',
      dashboardUrl: 'https://dashboard.render.com/web/srv-d95vvg1o3t8c7396tq80',
      healthPath: '/health',
      readinessPath: '/ready',
    },
    integrations: {
      auth0: {
        provider: 'auth0',
        domain: 'dev-qpevrkauua3p7j6l.us.auth0.com',
        dashboardUrl: 'https://manage.auth0.com/dashboard/us/dev-qpevrkauua3p7j6l',
      },
      neon: {
        provider: 'neon',
        dashboardUrl: 'https://console.neon.tech',
      },
      aiGateway: {
        provider: 'vercel-ai-gateway',
        catalogUrl: 'https://ai-gateway.vercel.sh/v1/models',
        dashboardUrl: 'https://vercel.com/ai-gateway',
        model: 'anthropic/claude-haiku-4.5',
      },
      github: {
        provider: 'github',
        owner: 'kvn8888',
        repo: 'CodeGym',
        dashboardUrl: 'https://github.com/kvn8888/CodeGym/actions',
      },
    },
  },
] as const

export function getProjectProviderIds(config: MonitoredProjectConfig): ProviderId[] {
  return [
    config.frontend.provider,
    config.backend.provider,
    config.integrations.auth0.provider,
    config.integrations.neon.provider,
    config.integrations.aiGateway.provider,
    config.integrations.github.provider,
  ]
}
