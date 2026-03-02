import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })

  try {
    const { text } = await req.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Extract the following fields from this job posting. Return ONLY valid JSON with these exact keys: company, role, type, description.\n\n- company: the company name\n- role: the job title/role\n- type: the primary technical domain (e.g. Cloud, AI Engineering, Frontend, Backend, Full Stack, Embedded, IoT, DevOps, General)\n- description: a concise summary of the job (2-4 sentences)\n\nJob posting:\n${text}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                company: { type: 'STRING' },
                role: { type: 'STRING' },
                type: { type: 'STRING' },
                description: { type: 'STRING' },
              },
              required: ['company', 'role', 'type', 'description'],
            },
          },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('Gemini parse error:', err)
      return NextResponse.json({ error: 'Gemini API error' }, { status: res.status })
    }

    const data = await res.json()
    const text_response = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text_response) {
      return NextResponse.json({ error: 'No response from Gemini' }, { status: 500 })
    }

    const parsed = JSON.parse(text_response)
    return NextResponse.json(parsed)
  } catch (err) {
    console.error('POST /api/jobs/parse error:', err)
    return NextResponse.json({ error: 'Failed to parse job description', details: String(err) }, { status: 500 })
  }
}
