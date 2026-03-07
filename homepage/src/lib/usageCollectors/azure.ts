import { getSecret } from '@/lib/secrets'
import { UsageCollectionResult, UsageCollectorError } from './shared'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let cachedAzurePayload: Record<string, unknown> | null = null
let cachedAzureAt = 0
const AZURE_CACHE_TTL_MS = Number(process.env.AZURE_USAGE_CACHE_TTL_MS || 15 * 60 * 1000)

function rememberAzurePayload(payload: Record<string, unknown>) {
  cachedAzurePayload = payload
  cachedAzureAt = Date.now()
}

function staleAzurePayload() {
  if (!cachedAzurePayload) return null
  return {
    ...cachedAzurePayload,
    stale: true,
    warning: 'Azure API throttled; showing cached data',
    cachedAt: new Date(cachedAzureAt).toISOString(),
  }
}

function freshAzurePayload() {
  if (!cachedAzurePayload || !cachedAzureAt) return null
  const ageMs = Date.now() - cachedAzureAt
  if (ageMs > AZURE_CACHE_TTL_MS) return null
  return {
    ...cachedAzurePayload,
    cached: true,
    cachedAt: new Date(cachedAzureAt).toISOString(),
    cacheTtlMs: AZURE_CACHE_TTL_MS,
  }
}

function getAzureSnapshotWrites(payload: Record<string, unknown>) {
  if (payload.type === 'credits') {
    return [
      {
        service: 'azure',
        metric: 'student_credit_used_usd',
        totalValue: Math.max(
          0,
          Number(payload.estimatedBalance ?? 0) - Number(payload.currentBalance ?? 0),
        ),
      },
    ]
  }

  if (payload.type === 'cost_query') {
    return [
      {
        service: 'azure',
        metric: 'student_credit_used_usd',
        totalValue: Number(payload.totalSpend ?? 0),
      },
    ]
  }

  return []
}

async function fetchAzureWithRetry(url: string, init: RequestInit, maxAttempts = 4): Promise<Response> {
  let lastResponse: Response | null = null
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, init)
      lastResponse = response

      if (response.status !== 429) return response

      const retryAfter = Number(response.headers.get('retry-after'))
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * (2 ** (attempt - 1))
      await sleep(waitMs)
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts) {
        await sleep(500 * (2 ** (attempt - 1)))
      }
    }
  }

  if (lastResponse) return lastResponse
  throw lastError ?? new Error('Azure request failed')
}

async function getAzureAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://management.azure.com/.default',
    }),
  })

  const data = await response.json()
  if (!data.access_token) {
    throw new UsageCollectorError(500, 'Azure auth failed', data.error_description || data.error)
  }

  return data.access_token
}

export async function collectAzureUsage(): Promise<UsageCollectionResult<Record<string, unknown>>> {
  const tenantId = await getSecret('AZURE_TENANT_ID')
  const clientId = await getSecret('AZURE_CLIENT_ID')
  const clientSecret = await getSecret('AZURE_CLIENT_SECRET')
  const subscriptionId = await getSecret('AZURE_SUBSCRIPTION_ID')
  const billingAccountId = await getSecret('AZURE_BILLING_ACCOUNT_ID')
  const billingProfileId = await getSecret('AZURE_BILLING_PROFILE_ID')

  if (!tenantId || !clientId || !clientSecret) {
    throw new UsageCollectorError(500, 'Azure credentials not configured')
  }

  const freshCache = freshAzurePayload()
  if (freshCache) {
    return {
      payload: freshCache,
      snapshots: getAzureSnapshotWrites(freshCache),
    }
  }

  try {
    const token = await getAzureAccessToken(tenantId, clientId, clientSecret)
    const headers = { Authorization: `Bearer ${token}` }

    if (billingAccountId && billingProfileId) {
      const creditsResponse = await fetchAzureWithRetry(
        `https://management.azure.com/providers/Microsoft.Billing/billingAccounts/${billingAccountId}/billingProfiles/${billingProfileId}/providers/Microsoft.Consumption/credits/balanceSummary?api-version=2024-08-01`,
        { headers, cache: 'no-store' },
      )

      if (creditsResponse.ok) {
        const credits = await creditsResponse.json()
        const props = credits.properties
        const payload = {
          type: 'credits',
          currentBalance: props?.balanceSummary?.currentBalance?.value ?? null,
          estimatedBalance: props?.balanceSummary?.estimatedBalance?.value ?? null,
          currency: props?.creditCurrency || props?.billingCurrency || 'USD',
          expiredCredit: props?.expiredCredit?.value ?? 0,
          pendingCharges: props?.pendingEligibleCharges?.value ?? 0,
          dashboardUrl: 'https://portal.azure.com/#view/Microsoft_Azure_Billing/BillingMenuBlade/~/Credits',
        }

        rememberAzurePayload(payload)
        return {
          payload,
          snapshots: getAzureSnapshotWrites(payload),
        }
      }

      if (creditsResponse.status === 429) {
        const stale = staleAzurePayload()
        if (stale) {
          return {
            payload: stale,
            snapshots: getAzureSnapshotWrites(stale),
          }
        }
      }
    }

    if (subscriptionId) {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const today = now.toISOString().split('T')[0]

      const costResponse = await fetchAzureWithRetry(
        `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=2023-11-01`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'ActualCost',
            timeframe: 'Custom',
            timePeriod: { from: startOfMonth, to: today },
            dataset: {
              granularity: 'None',
              aggregation: {
                totalCost: { name: 'Cost', function: 'Sum' },
              },
            },
          }),
          cache: 'no-store',
        },
      )

      if (costResponse.ok) {
        const costData = await costResponse.json()
        const rows = costData.properties?.rows || []
        const totalCost = rows.length > 0 ? rows[0][0] : 0
        const currency = rows.length > 0 ? rows[0][1] : 'USD'
        const studentCredit = 100
        const payload = {
          type: 'cost_query',
          totalSpend: totalCost,
          currency,
          studentCredit,
          remaining: studentCredit - totalCost,
          period: `${startOfMonth} to ${today}`,
          dashboardUrl: `https://portal.azure.com/#view/Microsoft_Azure_CostManagement/Menu/~/costanalysis/openedBy/AzurePortal/scope/subscriptions%2F${subscriptionId}`,
        }

        rememberAzurePayload(payload)
        return {
          payload,
          snapshots: getAzureSnapshotWrites(payload),
        }
      }

      if (costResponse.status === 429) {
        const stale = staleAzurePayload()
        if (stale) {
          return {
            payload: stale,
            snapshots: getAzureSnapshotWrites(stale),
          }
        }
      }

      const details = await costResponse.text()
      throw new UsageCollectorError(costResponse.status, 'Azure Cost Management API error', details)
    }

    throw new UsageCollectorError(500, 'No AZURE_SUBSCRIPTION_ID or AZURE_BILLING_ACCOUNT_ID configured')
  } catch (error) {
    if (error instanceof UsageCollectorError) throw error
    throw new UsageCollectorError(500, 'Failed to fetch Azure data', String(error))
  }
}