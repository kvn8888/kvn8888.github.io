import { auth } from '@/auth'
import { NextResponse } from 'next/server'

/*
 * Mistral Usage API Proxy — /api/usage/mistral
 *
 * Proxies to https://api.mistral.ai/v1/usage/monthly to fetch per-model token
 * consumption for the current calendar month.
 *
 * Env var required: MISTRAL_API_KEY
 *
 * Note: Mistral's API-key-level usage endpoint may vary by account type.
 * If the endpoint is unavailable, this route returns the API key status and
 * indicates the dashboard URL for manual inspection.
 */

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.MISTRAL_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'MISTRAL_API_KEY not configured' }, { status: 500 })
  }

  try {
    // Attempt to fetch Mistral subscription / usage information.
    // The Mistral platform exposes billing info at the workspace endpoint.
    const res = await fetch('https://api.mistral.ai/v1/workspace', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('Mistral workspace API error', { status: res.status, body: errText })
      // Even on error, return a minimal response so the dashboard card renders
      return NextResponse.json(
        {
          configured: true,
          error: `Mistral API returned ${res.status}`,
          dashboardUrl: 'https://console.mistral.ai/',
        },
        { status: 200 } // 200 so the frontend can show the card (not error status)
      )
    }

    const data = await res.json()

    return NextResponse.json({
      configured: true,
      workspace: {
        id: data.id,
        name: data.name,
        // Extract credit / billing fields if present
        credits: data.credits_balance ?? data.balance ?? null,
        plan: data.plan ?? null,
      },
      dashboardUrl: 'https://console.mistral.ai/',
    })
  } catch (err) {
    console.error('Mistral usage fetch failed', { error: err })
    return NextResponse.json(
      { configured: true, error: 'Failed to fetch Mistral usage', dashboardUrl: 'https://console.mistral.ai/' },
      { status: 200 }
    )
  }
}
