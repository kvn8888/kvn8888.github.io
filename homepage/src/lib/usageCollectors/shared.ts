import { type UsageCycleOverride } from '@/lib/usageCycles'
import { recordUsageMetricSnapshot } from '@/lib/usageSnapshots'

export interface UsageSnapshotWrite extends UsageCycleOverride {
  service: string
  metric: string
  totalValue: number
}

export interface UsageCollectionResult<TPayload> {
  payload: TPayload
  snapshots: UsageSnapshotWrite[]
}

export class UsageCollectorError extends Error {
  status: number
  details?: string

  constructor(status: number, message: string, details?: string) {
    super(message)
    this.name = 'UsageCollectorError'
    this.status = status
    this.details = details
  }
}

export function getUsageCollectorErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof UsageCollectorError) {
    return {
      status: error.status,
      body: error.details
        ? { error: error.message, details: error.details }
        : { error: error.message },
    }
  }

  return {
    status: 500,
    body: { error: fallbackMessage, details: String(error) },
  }
}

export async function persistUsageSnapshots(snapshots: UsageSnapshotWrite[]) {
  for (const snapshot of snapshots) {
    await recordUsageMetricSnapshot(snapshot)
  }
}