import { collectAzureUsage } from './azure'
import { collectGcpUsage } from './gcp'
import { collectOddsUsage } from './odds'
import { UsageCollectionResult } from './shared'
import { collectTavilyUsage } from './tavily'
import { collectTursoUsage } from './turso'
import { collectVeniceUsage } from './venice'

export interface UsageSnapshotCollector {
  id: string
  collect: () => Promise<UsageCollectionResult<unknown>>
}

export const usageSnapshotCollectors: UsageSnapshotCollector[] = [
  { id: 'tavily', collect: collectTavilyUsage },
  { id: 'azure', collect: collectAzureUsage },
  { id: 'gcp', collect: collectGcpUsage },
  { id: 'turso', collect: collectTursoUsage },
  { id: 'odds', collect: collectOddsUsage },
  { id: 'venice', collect: collectVeniceUsage },
]

export { collectAzureUsage } from './azure'
export { collectGcpUsage } from './gcp'
// Deprecated compatibility export. GitHub is no longer an active dashboard or cron collector.
export { collectGithubUsage } from './github'
export { collectOddsUsage } from './odds'
export { persistUsageSnapshots, getUsageCollectorErrorResponse, UsageCollectorError, type UsageCollectionResult, type UsageSnapshotWrite } from './shared'
export { collectTavilyUsage } from './tavily'
export { collectTursoUsage } from './turso'
export { collectVeniceUsage } from './venice'
