import { getSecretPool } from '@/lib/secrets'
import { UsageCollectionResult, UsageCollectorError } from './shared'

interface VeniceProviderPayload {
  canConsume?: boolean
  consumptionCurrency?: string | null
  balances?: {
    diem?: number
    usd?: number
  }
  diemEpochAllocation?: number
}

interface VeniceUsagePayload {
  canConsume: boolean
  consumptionCurrency: string | null
  balances: {
    diem: number
    usd: number
  }
  diemEpochAllocation: number
  accountCount: number
  failedAccountCount: number
  accounts: Array<{
    label: string
    canConsume: boolean
    currency: string | null
    diemRemaining: number
    usdRemaining: number
    diemAllocation: number
  }>
  errors: Array<{
    label: string
    status: number
  }>
  dashboardUrl: string
}

function accountLabel(key: string) {
  if (key === 'VENICE_API_KEY') return 'Account 1'
  return `Account ${key.slice('VENICE_API_KEY_'.length)}`
}

export async function collectVeniceUsage(): Promise<UsageCollectionResult<VeniceUsagePayload>> {
  const credentials = await getSecretPool('VENICE_API_KEY')
  if (credentials.length === 0) {
    throw new UsageCollectorError(500, 'No Venice API keys configured')
  }

  try {
    const results = await Promise.all(
      credentials.map(async ({ key, value }) => {
        const label = accountLabel(key)
        try {
          const response = await fetch('https://api.venice.ai/api/v1/billing/balance', {
            headers: { Authorization: `Bearer ${value}` },
            cache: 'no-store',
          })

          if (!response.ok) {
            return { ok: false as const, label, status: response.status }
          }

          return {
            ok: true as const,
            label,
            payload: await response.json() as VeniceProviderPayload,
          }
        } catch {
          return { ok: false as const, label, status: 502 }
        }
      })
    )

    const successful = results.filter((result) => result.ok)
    const errors = results
      .filter((result) => !result.ok)
      .map((result) => ({ label: result.label, status: result.status }))

    if (successful.length === 0) {
      throw new UsageCollectorError(
        502,
        'All configured Venice AI accounts failed',
        errors.map((error) => `${error.label}: ${error.status}`).join(', ')
      )
    }

    const currencies = [...new Set(
      successful
        .map((result) => result.payload.consumptionCurrency)
        .filter((currency): currency is string => Boolean(currency))
    )]
    const accounts = successful.map((result) => ({
      label: result.label,
      canConsume: result.payload.canConsume ?? false,
      currency: result.payload.consumptionCurrency ?? null,
      diemRemaining: Number(result.payload.balances?.diem ?? 0),
      usdRemaining: Number(result.payload.balances?.usd ?? 0),
      diemAllocation: Number(result.payload.diemEpochAllocation ?? 0),
    }))
    const diemRemaining = accounts.reduce((sum, account) => sum + account.diemRemaining, 0)
    const diemAllocation = accounts.reduce((sum, account) => sum + account.diemAllocation, 0)

    const payload: VeniceUsagePayload = {
      canConsume: accounts.some((account) => account.canConsume),
      consumptionCurrency:
        currencies.length === 0 ? null : currencies.length === 1 ? currencies[0] : 'Pooled',
      balances: {
        diem: diemRemaining,
        usd: accounts.reduce((sum, account) => sum + account.usdRemaining, 0),
      },
      diemEpochAllocation: diemAllocation,
      accountCount: accounts.length,
      failedAccountCount: errors.length,
      accounts,
      errors,
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
