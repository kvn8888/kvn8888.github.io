import { getSecretPool } from '@/lib/secrets'
import { UsageCollectionResult, UsageCollectorError } from './shared'

interface TavilyUsageBreakdown {
  search_usage: number
  extract_usage: number
  crawl_usage: number
  map_usage: number
  research_usage: number
}

interface TavilyProviderPayload {
  key?: Partial<TavilyUsageBreakdown> & {
    usage?: number
    limit?: number | null
  }
  account?: Partial<TavilyUsageBreakdown> & {
    current_plan?: string
    plan_usage?: number
    plan_limit?: number
    paygo_usage?: number
    paygo_limit?: number | null
  }
}

interface TavilyUsagePayload {
  key: TavilyUsageBreakdown & {
    usage: number
    limit: number | null
  }
  account: TavilyUsageBreakdown & {
    current_plan: string
    plan_usage: number
    plan_limit: number
    paygo_usage: number
    paygo_limit: number | null
  }
  accountCount: number
  failedAccountCount: number
  accounts: Array<{
    label: string
    plan: string
    usage: number
    limit: number
  }>
  errors: Array<{
    label: string
    status: number
  }>
}

const BREAKDOWN_KEYS = [
  'search_usage',
  'extract_usage',
  'crawl_usage',
  'map_usage',
  'research_usage',
] as const

function accountLabel(key: string) {
  if (key === 'TAVILY_API_KEY') return 'Account 1'
  return `Account ${key.slice('TAVILY_API_KEY_'.length)}`
}

function sumBreakdown(
  payloads: TavilyProviderPayload[],
  level: 'key' | 'account'
): TavilyUsageBreakdown {
  return Object.fromEntries(
    BREAKDOWN_KEYS.map((key) => [
      key,
      payloads.reduce((sum, payload) => sum + Number(payload[level]?.[key] ?? 0), 0),
    ])
  ) as unknown as TavilyUsageBreakdown
}

export async function collectTavilyUsage(): Promise<UsageCollectionResult<TavilyUsagePayload>> {
  const credentials = await getSecretPool('TAVILY_API_KEY')
  if (credentials.length === 0) {
    throw new UsageCollectorError(500, 'No Tavily API keys configured')
  }

  const results = await Promise.all(
    credentials.map(async ({ key, value }) => {
      const label = accountLabel(key)
      try {
        const response = await fetch('https://api.tavily.com/usage', {
          headers: { Authorization: `Bearer ${value}` },
          cache: 'no-store',
        })

        if (!response.ok) {
          return { ok: false as const, label, status: response.status }
        }

        return {
          ok: true as const,
          label,
          payload: await response.json() as TavilyProviderPayload,
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
      'All configured Tavily accounts failed',
      errors.map((error) => `${error.label}: ${error.status}`).join(', ')
    )
  }

  const payloads = successful.map((result) => result.payload)
  const plans = [...new Set(
    payloads.map((payload) => payload.account?.current_plan).filter(Boolean)
  )] as string[]
  const keyLimits = payloads.map((payload) => payload.key?.limit)
  const paygoLimits = payloads.map((payload) => payload.account?.paygo_limit)

  const payload: TavilyUsagePayload = {
    key: {
      ...sumBreakdown(payloads, 'key'),
      usage: payloads.reduce((sum, item) => sum + Number(item.key?.usage ?? 0), 0),
      limit: keyLimits.every((limit) => typeof limit === 'number')
        ? keyLimits.reduce<number>((sum, limit) => sum + Number(limit), 0)
        : null,
    },
    account: {
      ...sumBreakdown(payloads, 'account'),
      current_plan:
        successful.length > 1 ? 'Pooled' : plans[0] ?? 'Unknown plan',
      plan_usage: payloads.reduce(
        (sum, item) => sum + Number(item.account?.plan_usage ?? 0),
        0
      ),
      plan_limit: payloads.reduce(
        (sum, item) => sum + Number(item.account?.plan_limit ?? 0),
        0
      ),
      paygo_usage: payloads.reduce(
        (sum, item) => sum + Number(item.account?.paygo_usage ?? 0),
        0
      ),
      paygo_limit: paygoLimits.every((limit) => typeof limit === 'number')
        ? paygoLimits.reduce<number>((sum, limit) => sum + Number(limit), 0)
        : null,
    },
    accountCount: successful.length,
    failedAccountCount: errors.length,
    accounts: successful.map((result) => ({
      label: result.label,
      plan: result.payload.account?.current_plan ?? 'Unknown plan',
      usage: Number(result.payload.account?.plan_usage ?? 0),
      limit: Number(result.payload.account?.plan_limit ?? 0),
    })),
    errors,
  }

  return {
    payload,
    snapshots: [
      {
        service: 'tavily',
        metric: 'plan_usage',
        totalValue: payload.account.plan_usage,
      },
    ],
  }
}
