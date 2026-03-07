import { getSecret } from '@/lib/secrets'
import { UsageCollectionResult, UsageCollectorError } from './shared'

export async function collectTavilyUsage(): Promise<UsageCollectionResult<unknown>> {
  const apiKey = await getSecret('TAVILY_API_KEY')
  if (!apiKey) {
    throw new UsageCollectorError(500, 'TAVILY_API_KEY not configured')
  }

  const response = await fetch('https://api.tavily.com/usage', {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new UsageCollectorError(response.status, 'Tavily API error')
  }

  const payload = await response.json()

  return {
    payload,
    snapshots: [
      {
        service: 'tavily',
        metric: 'plan_usage',
        totalValue: Number(payload?.account?.plan_usage ?? 0),
      },
    ],
  }
}