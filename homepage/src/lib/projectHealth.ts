export type HealthState = 'healthy' | 'attention' | 'deploying' | 'down' | 'unknown'

export interface RuntimeProbe {
  id: string
  label: string
  state: HealthState
  httpStatus: number | null
  latencyMs: number | null
  checkedAt: string
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

export interface ProviderStatus {
  id: string
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
  release: ReleaseAlignment
}

export interface ProjectHealthResponse {
  checkedAt: string
  refreshAfterSeconds: number
  projects: MonitoredProjectStatus[]
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
}

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
  },
] as const
