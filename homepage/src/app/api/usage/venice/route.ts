import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.VENICE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'VENICE_API_KEY not configured' }, { status: 500 })
  }

  try {
    // Try the API keys endpoint for usage/balance info
    const res = await fetch('https://api.venice.ai/api/v1/api_keys', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })

    if (res.ok) {
      const data = await res.json()
      return NextResponse.json({
        ...data,
        dashboardUrl: 'https://venice.ai/settings/api',
      })
    }

    // Fallback: try models endpoint to verify key works
    const modelsRes = await fetch('https://api.venice.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })

    if (modelsRes.ok) {
      const models = await modelsRes.json()
      return NextResponse.json({
        connected: true,
        modelsAvailable: models.data?.length ?? 0,
        note: 'Venice AI connected. Usage/credits endpoint not available — check dashboard.',
        dashboardUrl: 'https://venice.ai/settings/api',
      })
    }

    return NextResponse.json({ error: 'Failed to authenticate with Venice AI' }, { status: 500 })
  } catch (error) {
    console.error('Venice AI error:', error)
    return NextResponse.json({ error: 'Failed to fetch Venice AI usage' }, { status: 500 })
  }
}
