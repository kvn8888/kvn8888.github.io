import { getSecret } from '@/lib/secrets'
import { UsageCollectionResult, UsageCollectorError } from './shared'

const INCLUDED_MINUTES = 10800
const INCLUDED_STORAGE_GB = 20
const INCLUDED_PREMIUM_REQUESTS = 300

interface BillingLineItem {
  date?: string
  product?: string
  sku?: string
  quantity?: number
  grossQuantity?: number
  discountQuantity?: number
  netQuantity?: number
  unitType?: string
  pricePerUnit?: number
  grossAmount?: number
  discountAmount?: number
  netAmount?: number
  organizationName?: string
  repositoryName?: string
}

interface PremiumRequestItem {
  model?: string
  sku?: string
  quantity?: number
  grossQuantity?: number
  discountQuantity?: number
  netQuantity?: number
  totalAmount?: number
  grossAmount?: number
  netAmount?: number
}

function normalizeUnitType(unitType?: string): string {
  return (unitType ?? '').toLowerCase().replace(/[\s_-]+/g, '')
}

function getUsageQuantity(item: {
  quantity?: number
  grossQuantity?: number
  netQuantity?: number
}): number {
  return item.quantity ?? item.grossQuantity ?? item.netQuantity ?? 0
}

function isCodespacesLineItem(item: BillingLineItem): boolean {
  const product = (item.product ?? '').toLowerCase()
  const sku = (item.sku ?? '').toLowerCase()
  return product.includes('codespaces') || sku.includes('codespaces') || sku.includes('codespace')
}

export async function collectGithubUsage(): Promise<UsageCollectionResult<{
  codespaces: {
    totalMinutes: number
    storageGB: number
    skuBreakdown: Record<string, number>
    includedMinutes: number
    includedStorageGB: number
  } | null
  copilot: {
    includedPremiumRequests: number
    items: { model: string; sku: string; quantity: number; cost: number }[]
  } | null
  dashboardUrl: string
}>> {
  const pat = await getSecret('GITHUB_PAT')
  const username = await getSecret('GITHUB_USERNAME')

  if (!pat || !username) {
    throw new UsageCollectorError(500, 'GITHUB_PAT or GITHUB_USERNAME not configured')
  }

  const headers = {
    Authorization: `Bearer ${pat}`,
    'X-GitHub-Api-Version': '2022-11-28',
    Accept: 'application/vnd.github+json',
  }

  const [billingResult, copilotResult] = await Promise.allSettled([
    fetch(`https://api.github.com/users/${encodeURIComponent(username)}/settings/billing/usage`, {
      headers,
      cache: 'no-store',
    }),
    fetch(`https://api.github.com/users/${encodeURIComponent(username)}/settings/billing/premium_request/usage`, {
      headers,
      cache: 'no-store',
    }),
  ])

  let codespaces: {
    totalMinutes: number
    storageGB: number
    skuBreakdown: Record<string, number>
    includedMinutes: number
    includedStorageGB: number
  } | null = null

  if (billingResult.status === 'fulfilled' && billingResult.value.ok) {
    try {
      const data = await billingResult.value.json()
      const lineItems: BillingLineItem[] = Array.isArray(data) ? data : (data.usageItems ?? [])
      const minutesBySku: Record<string, number> = {}
      let storageGB = 0
      let storageGbHours = 0
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const hoursElapsedThisMonth = Math.max((now.getTime() - monthStart.getTime()) / (1000 * 60 * 60), 1)

      for (const item of lineItems) {
        if (!isCodespacesLineItem(item)) continue

        const quantity = getUsageQuantity(item)
        const unitType = normalizeUnitType(item.unitType)
        const sku = item.sku ?? item.product ?? 'Codespaces'

        if (unitType.includes('minute')) {
          minutesBySku[sku] = (minutesBySku[sku] ?? 0) + quantity
        } else if (unitType.includes('hour')) {
          minutesBySku[sku] = (minutesBySku[sku] ?? 0) + quantity * 60
        } else if (unitType === 'gb' || unitType.includes('gbmonth')) {
          storageGB += quantity
        } else if (unitType.includes('gbhour')) {
          storageGbHours += quantity
        }
      }

      if (storageGbHours > 0) {
        storageGB += storageGbHours / hoursElapsedThisMonth
      }

      const totalMinutes = Object.values(minutesBySku).reduce((sum, minutes) => sum + minutes, 0)
      if (totalMinutes > 0 || storageGB > 0) {
        codespaces = {
          totalMinutes,
          storageGB: Math.round(storageGB * 100) / 100,
          skuBreakdown: minutesBySku,
          includedMinutes: INCLUDED_MINUTES,
          includedStorageGB: INCLUDED_STORAGE_GB,
        }
      }
    } catch {
      // Leave codespaces as null and let the dashboard handle the missing payload.
    }
  }

  let copilot: {
    includedPremiumRequests: number
    items: { model: string; sku: string; quantity: number; cost: number }[]
  } | null = null

  if (copilotResult.status === 'fulfilled' && copilotResult.value.ok) {
    try {
      const data = await copilotResult.value.json()
      const rawItems: PremiumRequestItem[] = Array.isArray(data) ? data : (data.usageItems ?? data.items ?? [])

      copilot = {
        includedPremiumRequests: INCLUDED_PREMIUM_REQUESTS,
        items: rawItems
          .map((item) => ({
            model: item.model ?? item.sku ?? 'Unknown',
            sku: item.sku ?? '',
            quantity: item.grossQuantity ?? item.quantity ?? item.netQuantity ?? 0,
            cost: item.netAmount ?? item.totalAmount ?? item.grossAmount ?? 0,
          }))
          .filter((item) => item.quantity > 0 || item.cost > 0),
      }
    } catch {
      // Leave copilot as null and let the dashboard handle the missing payload.
    }
  }

  return {
    payload: {
      codespaces,
      copilot,
      dashboardUrl: 'https://github.com/settings/billing/summary',
    },
    snapshots: [
      ...(codespaces
        ? [
            {
              service: 'github',
              metric: 'codespaces_minutes',
              totalValue: codespaces.totalMinutes,
            },
          ]
        : []),
      ...(copilot
        ? [
            {
              service: 'github',
              metric: 'copilot_premium_requests',
              totalValue: copilot.items.reduce((sum, item) => sum + item.quantity, 0),
            },
          ]
        : []),
    ],
  }
}