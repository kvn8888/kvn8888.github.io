import { getSecret } from '@/lib/secrets'
import { UsageCollectionResult, UsageCollectorError } from './shared'

interface OddsUsagePayload {
  requestsUsed: number
  requestsRemaining: number
  requestsLimit: number
  dashboardUrl: string
}

export async function collectOddsUsage(): Promise<UsageCollectionResult<OddsUsagePayload>> {
  const apiKey = await getSecret('ODDS_API_KEY')
  if (!apiKey) {
    throw new UsageCollectorError(500, 'ODDS_API_KEY not configured')
  }

  try {
    const response = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${apiKey}`, {
      cache: 'no-store',
    })

    const requestsUsed = Number.parseInt(response.headers.get('x-requests-used') || '0', 10)
    const requestsRemaining = Number.parseInt(response.headers.get('x-requests-remaining') || '0', 10)
    const payload = {
      requestsUsed,
      requestsRemaining,
      requestsLimit: requestsUsed + requestsRemaining,
      dashboardUrl: 'https://the-odds-api.com/account/',
    }

    return {
      payload,
      snapshots: [
        {
          service: 'odds',
          metric: 'requests_used',
          totalValue: requestsUsed,
        },
      ],
    }
  } catch (error) {
    throw new UsageCollectorError(500, 'Failed to fetch Odds API usage', String(error))
  }
}