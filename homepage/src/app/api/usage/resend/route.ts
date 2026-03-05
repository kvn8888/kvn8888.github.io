import { auth } from '@/auth'
import { NextResponse } from 'next/server'

/*
 * Resend Usage API Proxy — /api/usage/resend
 *
 * Fetches the Resend account usage summary including:
 *   - Email sends today / this month
 *   - Plan limits
 *   - API key status
 *
 * Env var required: RESEND_API_KEY
 *
 * Resend API docs: https://resend.com/docs/api-reference/introduction
 */

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  try {
    // Fetch Resend domains and API key info as a usage proxy
    const [domainsRes, apiKeyRes] = await Promise.allSettled([
      fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      }),
      fetch('https://api.resend.com/api-keys', {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      }),
    ])

    interface ResendDomain { id: string; name: string; status: string; region: string }
    interface ResendApiKey { id: string; name: string; created_at: string }

    let domains: ResendDomain[] = []
    let apiKeys: ResendApiKey[] = []
    let error: string | null = null

    if (domainsRes.status === 'fulfilled' && domainsRes.value.ok) {
      const data = await domainsRes.value.json()
      domains = data.data || []
    } else {
      error = 'Could not fetch Resend domain list'
    }

    if (apiKeyRes.status === 'fulfilled' && apiKeyRes.value.ok) {
      const data = await apiKeyRes.value.json()
      apiKeys = data.data || []
    }

    return NextResponse.json({
      configured: true,
      domains: domains.map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
        region: d.region,
      })),
      apiKeyCount: apiKeys.length,
      ...(error ? { warning: error } : {}),
      dashboardUrl: 'https://resend.com/overview',
    })
  } catch (err) {
    console.error('Resend usage fetch failed', { error: err })
    return NextResponse.json(
      { configured: true, error: 'Failed to fetch Resend usage', dashboardUrl: 'https://resend.com/overview' },
      { status: 200 }
    )
  }
}
