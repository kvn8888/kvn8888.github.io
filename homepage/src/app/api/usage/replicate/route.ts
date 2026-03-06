import { auth } from '@/auth'
import { NextResponse } from 'next/server'

/*
 * Replicate Usage API Proxy — /api/usage/replicate
 *
 * Replicate's public API exposes account information but does NOT expose a
 * billing or credit-balance endpoint in their REST API as of 2025-03.
 * Spending and model usage can only be viewed on the billing dashboard.
 *
 * What's available via API:
 *   GET /v1/account
 *   Response schema:
 *     {
 *       "type":       "user" | "organization",
 *       "username":   string,
 *       "name":       string,
 *       "github_url": string | null
 *     }
 *
 * Note: Replicate uses "Token <token>" (not "Bearer") for auth.
 * Replicate API docs: https://replicate.com/docs/reference/http#account.get
 *
 * Env var required: REPLICATE_API_TOKEN
 */

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiToken = process.env.REPLICATE_API_TOKEN
  if (!apiToken) {
    return NextResponse.json({ error: 'REPLICATE_API_TOKEN not configured' }, { status: 500 })
  }

  try {
    const res = await fetch('https://api.replicate.com/v1/account', {
      headers: {
        // Replicate uses "Token <token>" auth scheme, not "Bearer"
        Authorization: `Token ${apiToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Replicate account API error', { status: res.status, body: errText })
      return NextResponse.json(
        { configured: true, error: `Replicate API returned ${res.status}`, dashboardUrl: 'https://replicate.com/account/billing' },
        { status: 200 }
      )
    }

    // Confirmed schema from Replicate REST API docs:
    const account = await res.json() as {
      type: 'user' | 'organization'
      username: string
      name: string
      github_url: string | null
    }

    return NextResponse.json({
      configured: true,
      type: account.type,
      username: account.username,
      name: account.name,
      githubUrl: account.github_url ?? null,
      note: 'Replicate does not expose a billing API. Visit the dashboard for spend and credit details.',
      dashboardUrl: 'https://replicate.com/account/billing',
    })
  } catch (err) {
    console.error('Replicate usage fetch failed', { error: err })
    return NextResponse.json(
      { configured: true, error: 'Failed to fetch Replicate account info', dashboardUrl: 'https://replicate.com/account/billing' },
      { status: 200 }
    )
  }
}
