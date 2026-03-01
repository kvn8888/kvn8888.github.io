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
    // GET /api/v1/billing/balance — returns DIEM/USD balances and epoch allocation
    const res = await fetch('https://api.venice.ai/api/v1/billing/balance', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch Venice billing' }, { status: res.status })
    }

    const data = await res.json()

    return NextResponse.json({
      canConsume: data.canConsume ?? false,
      consumptionCurrency: data.consumptionCurrency ?? null,
      balances: {
        diem: data.balances?.diem ?? 0,
        usd: data.balances?.usd ?? 0,
      },
      diemEpochAllocation: data.diemEpochAllocation ?? 0,
      dashboardUrl: 'https://venice.ai/settings/api',
    })
  } catch (error) {
    console.error('Venice AI error:', error)
    return NextResponse.json({ error: 'Failed to fetch Venice AI usage' }, { status: 500 })
  }
}
