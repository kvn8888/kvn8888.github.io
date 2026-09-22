import { getSecret } from '@/lib/secrets'
import { UsageCollectionResult, UsageCollectorError } from './shared'

interface TursoUsagePayload {
  plan: {
    id: string | null
    name: string | null
    timeline: string | null
    overages: boolean | null
    billingPeriodStart: string | null
    billingPeriodEnd: string | null
  }
  status: {
    blockedReads: boolean
    blockedWrites: boolean
  }
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
    rows_read: number | null
    rows_written: number | null
    storage_bytes: number | null
    databases: number | null
    groups: number | null
    locations: number | null
    bytes_synced: number | null
  }
  unlimited: {
    databases: boolean
  }
  limitsSource: 'provider' | 'unavailable'
  databases: Array<{
    uuid: string
    rows_read: number
    rows_written: number
    storage_bytes: number
  }>
  dashboardUrl: string
}

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value)
  return value !== null && value !== undefined && Number.isFinite(number) ? number : null
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

async function fetchTursoJson(url: string, apiToken: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: 'no-store',
  })

  if (!response.ok) {
    const details = await response.text()
    throw new UsageCollectorError(response.status, 'Turso API error', details)
  }

  return response.json()
}

function objectFromResult(result: PromiseSettledResult<unknown>, key: string): JsonObject | null {
  if (result.status !== 'fulfilled' || !isObject(result.value)) return null
  const nested = result.value[key]
  return isObject(nested) ? nested : result.value
}

function listFromResult(result: PromiseSettledResult<unknown>, key: string): JsonObject[] {
  if (result.status !== 'fulfilled') return []
  const value = result.value
  const list = Array.isArray(value) ? value : isObject(value) ? value[key] : null
  return Array.isArray(list) ? list.filter(isObject) : []
}

export async function collectTursoUsage(): Promise<UsageCollectionResult<TursoUsagePayload>> {
  const apiToken = await getSecret('TURSO_API_TOKEN')
  const orgSlug = await getSecret('TURSO_ORG_SLUG')
  if (!apiToken || !orgSlug) {
    throw new UsageCollectorError(500, 'TURSO_API_TOKEN or TURSO_ORG_SLUG not configured')
  }

  try {
    const baseUrl = 'https://api.turso.tech/v1/organizations'
    const [usageData, organizationsResult, subscriptionResult, plansResult] = await Promise.all([
      fetchTursoJson(`${baseUrl}/${orgSlug}/usage`, apiToken),
      fetchTursoJson(baseUrl, apiToken).then(
        (value) => ({ status: 'fulfilled', value }) as const,
        (reason) => ({ status: 'rejected', reason }) as const,
      ),
      fetchTursoJson(`${baseUrl}/${orgSlug}/subscription`, apiToken).then(
        (value) => ({ status: 'fulfilled', value }) as const,
        (reason) => ({ status: 'rejected', reason }) as const,
      ),
      fetchTursoJson(`${baseUrl}/${orgSlug}/plans`, apiToken).then(
        (value) => ({ status: 'fulfilled', value }) as const,
        (reason) => ({ status: 'rejected', reason }) as const,
      ),
    ])

    const usageOrganization = isObject(usageData) && isObject(usageData.organization)
      ? usageData.organization
      : {}
    const usage = isObject(usageOrganization.usage) ? usageOrganization.usage : {}
    const databases = Array.isArray(usageOrganization.databases)
      ? usageOrganization.databases.filter(isObject)
      : []

    const organizations = listFromResult(organizationsResult, 'organizations')
    const organization = organizations.find((item) =>
      item.slug === orgSlug || item.name === orgSlug
    ) ?? null
    const subscription = objectFromResult(subscriptionResult, 'subscription')
    const plans = listFromResult(plansResult, 'plans')

    const planId =
      stringOrNull(subscription?.plan) ??
      stringOrNull(subscription?.plan_id) ??
      stringOrNull(organization?.plan_id)
    const selectedPlan = plans.find((plan) =>
      plan.name === planId || plan.id === planId
    ) ?? null
    const quotas = selectedPlan && isObject(selectedPlan.quotas)
      ? selectedPlan.quotas
      : null
    const databaseLimit = numberOrNull(quotas?.databases)

    const payload = {
      plan: {
        id: planId,
        name: stringOrNull(selectedPlan?.display_name) ?? stringOrNull(selectedPlan?.name) ?? planId,
        timeline:
          stringOrNull(subscription?.timeline) ??
          stringOrNull(organization?.plan_timeline),
        overages:
          booleanOrNull(subscription?.overages) ??
          booleanOrNull(organization?.overages),
        billingPeriodStart:
          stringOrNull(subscription?.current_billing_period_start),
        billingPeriodEnd:
          stringOrNull(subscription?.current_billing_period_end),
      },
      status: {
        blockedReads: organization?.blocked_reads === true,
        blockedWrites: organization?.blocked_writes === true,
      },
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
        rows_read: numberOrNull(quotas?.rowsRead),
        rows_written: numberOrNull(quotas?.rowsWritten),
        storage_bytes: numberOrNull(quotas?.storage),
        databases: databaseLimit,
        groups: numberOrNull(quotas?.groups),
        locations: numberOrNull(quotas?.locations),
        bytes_synced: numberOrNull(quotas?.bytesSynced),
      },
      unlimited: {
        // Turso currently represents the unlimited database allowance with this sentinel.
        databases: databaseLimit !== null && databaseLimit >= 1_000_000_000,
      },
      limitsSource: quotas ? 'provider' as const : 'unavailable' as const,
      databases: databases.map((database) => {
        const total = isObject(database.total) ? database.total : {}
        return {
          uuid: String(database.uuid || ''),
          rows_read: Number(total.rows_read || 0),
          rows_written: Number(total.rows_written || 0),
          storage_bytes: Number(total.storage_bytes || 0),
        }
      }),
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
