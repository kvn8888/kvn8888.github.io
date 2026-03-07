import { getSecret } from '@/lib/secrets'
import { UsageCollectionResult, UsageCollectorError } from './shared'

interface VeniceUsagePayload {
  canConsume: boolean
  consumptionCurrency: string | null
  balances: {
    diem: number
    usd: number
  }
  diemEpochAllocation: number
  dashboardUrl: string
}

export async function collectVeniceUsage(): Promise<UsageCollectionResult<VeniceUsagePayload>> {
  const apiKey = await getSecret('VENICE_API_KEY')
  if (!apiKey) {
    throw new UsageCollectorError(500, 'VENICE_API_KEY not configured')
  }

  try {
    const response = await fetch('https://api.venice.ai/api/v1/billing/balance', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new UsageCollectorError(response.status, 'Failed to fetch Venice billing')
    }

    const data = await response.json()
    const diemRemaining = Number(data.balances?.diem ?? 0)
    const diemAllocation = Number(data.diemEpochAllocation ?? 0)
    const payload = {
      canConsume: data.canConsume ?? false,
      consumptionCurrency: data.consumptionCurrency ?? null,
      balances: {
        diem: diemRemaining,
        usd: Number(data.balances?.usd ?? 0),
      },
      diemEpochAllocation: diemAllocation,
      dashboardUrl: 'https://venice.ai/settings/api',
    }

    return {
      payload,
      snapshots: [
        {
          service: 'venice',
          metric: 'diem_used',
          totalValue: Math.max(0, diemAllocation - diemRemaining),
        },
      ],
    }
  } catch (error) {
    if (error instanceof UsageCollectorError) throw error
    throw new UsageCollectorError(500, 'Failed to fetch Venice AI usage', String(error))
  }
}