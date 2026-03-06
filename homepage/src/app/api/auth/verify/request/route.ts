import { NextResponse } from 'next/server'
import { createLoginAttempt, generateVerificationCode, isEmailApproved } from '@/lib/db'
import { getSecret } from '@/lib/secrets'

async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  const apiKey = await getSecret('RESEND_API_KEY')
  const from = await getSecret('AUTH_EMAIL_FROM')
  if (!apiKey || !from) return false

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Your KevinC.dev verification code',
      html: `<p>Your verification code is:</p><p style="font-size: 24px; font-family: monospace;"><strong>${code}</strong></p><p>This code expires once used.</p>`,
    }),
  })

  return response.ok
}

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

    if (await isEmailApproved(email)) {
      return NextResponse.json({
        success: true,
        alreadyApproved: true,
      })
    }

    const code = generateVerificationCode()
    const id = await createLoginAttempt(email, 'email', code)

    if (!id) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 503 }
      )
    }

    const emailSent = await sendVerificationEmail(email, code)

    // In development/demo mode, or when email delivery is not configured,
    // return the code for manual verification.
    const isDemoMode = process.env.NODE_ENV !== 'production'
    const includeCode = isDemoMode || !emailSent

    return NextResponse.json({
      success: true,
      ...(includeCode ? { code } : {}),
      delivery: emailSent ? 'email' : 'manual',
      id: Number(id),
    })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
