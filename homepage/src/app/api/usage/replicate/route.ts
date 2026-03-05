import { auth } from '@/auth'
import { NextResponse } from 'next/server'

/*
 * Replicate Usage API Proxy — /api/usage/replicate
 *
 * Fetches the Replicate account billing summary including:
 *   - Credit balance (prepaid)
 *   - Spend this billing period
 *   - Hardware usage
 *
 * Env var required: REPLICATE_API_TOKEN
 *
 * Replicate API docs: https://replicate.com/docs/reference/http#account
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
        Authorization: `Bearer ${apiToken}`,
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

    const account = await res.json()

    return NextResponse.json({
      configured: true,
      username: account.username,
      name: account.name,
      type: account.type,
      githubUrl: account.github_url,
      dashboardUrl: 'https://replicate.com/account/billing',
    })
  } catch (err) {
    console.error('Replicate usage fetch failed', { error: err })
    return NextResponse.json(
      { configured: true, error: 'Failed to fetch Replicate usage', dashboardUrl: 'https://replicate.com/account/billing' },
      { status: 200 }
    )
  }
}
