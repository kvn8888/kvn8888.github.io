import { NextResponse } from 'next/server'
import { createLoginAttempt, generateVerificationCode } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const code = generateVerificationCode()
    const id = await createLoginAttempt(email, 'email', code)

    if (!id) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      )
    }

    // In production, send the code via email and don't include it in the response.
    // In development/demo mode, return it for display.
    const isDemoMode = process.env.NODE_ENV !== 'production'

    return NextResponse.json({
      success: true,
      ...(isDemoMode ? { code } : {}),
      id: Number(id),
    })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
