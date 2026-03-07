import { getSecret } from '@/lib/secrets'
import { UsageCollectionResult, UsageCollectorError } from './shared'

interface TursoUsagePayload {
  usage: {
    rows_read: number
    rows_written: number
    storage_bytes: number
    databases: number
    groups: number
    locations: number
    bytes_synced: number
  }
  limits: {
    rows_read: number
    rows_written: number
    storage_bytes: number
    databases: number
    groups: number
    locations: number
  }
  databases: Array<{
    uuid: string
    rows_read: number
    rows_written: number
    storage_bytes: number
  }>
  dashboardUrl: string
}

export async function collectTursoUsage(): Promise<UsageCollectionResult<TursoUsagePayload>> {
  const apiToken = await getSecret('TURSO_API_TOKEN')
  const orgSlug = await getSecret('TURSO_ORG_SLUG')
  if (!apiToken || !orgSlug) {
    throw new UsageCollectorError(500, 'TURSO_API_TOKEN or TURSO_ORG_SLUG not configured')
  }

  try {
    const response = await fetch(`https://api.turso.tech/v1/organizations/${orgSlug}/usage`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      cache: 'no-store',
    })

    if (!response.ok) {
      const details = await response.text()
      throw new UsageCollectorError(response.status, 'Turso API error', details)
    }

    const data = await response.json()
    const usage = data.organization?.usage || {}
    const databases = data.organization?.databases || []
    const payload = {
      usage: {
        rows_read: Number(usage.rows_read || 0),
        rows_written: Number(usage.rows_written || 0),
        storage_bytes: Number(usage.storage_bytes || 0),
        databases: Number(usage.databases || databases.length),
        groups: Number(usage.groups || 0),
        locations: Number(usage.locations || 0),
        bytes_synced: Number(usage.bytes_synced || 0),
      },
      limits: {
        rows_read: 1_000_000_000,
        rows_written: 25_000_000,
        storage_bytes: 9_000_000_000,
        databases: 500,
        groups: 6,
        locations: 3,
      },
      databases: databases.map((database: { uuid: string; total: { rows_read: number; rows_written: number; storage_bytes: number } }) => ({
        uuid: database.uuid,
        rows_read: Number(database.total?.rows_read || 0),
        rows_written: Number(database.total?.rows_written || 0),
        storage_bytes: Number(database.total?.storage_bytes || 0),
      })),
      dashboardUrl: 'https://turso.tech/app',
    }

    return {
      payload,
      snapshots: [
        {
          service: 'turso',
          metric: 'rows_read',
          totalValue: payload.usage.rows_read,
        },
      ],
    }
  } catch (error) {
    if (error instanceof UsageCollectorError) throw error
    throw new UsageCollectorError(500, 'Failed to fetch Turso usage', String(error))
  }
}