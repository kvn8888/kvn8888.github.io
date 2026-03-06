import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { getSecret } from '@/lib/secrets'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = await getSecret('GEMINI_API_KEY')
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })

  try {
    const { jobPosting, blocks } = await req.json()
    if (!jobPosting || !blocks || !Array.isArray(blocks)) {
      return NextResponse.json({ error: 'jobPosting (string) and blocks (array) are required' }, { status: 400 })
    }

    const blockList = blocks
      .map((b: { id: string; category: string; text: string }) => `[${b.id}] (${b.category}) ${b.text}`)
      .join('\n')

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are helping match cover letter building blocks to a job posting. Analyze the job posting and identify the 3-4 most relevant blocks that would make the strongest cover letter for this specific role.

For each matched block, provide a brief reason (1 sentence) explaining why it's relevant.

Job Posting:
${jobPosting}

Available blocks:
${blockList}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                matches: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      id: { type: 'STRING' },
                      reason: { type: 'STRING' },
                    },
                    required: ['id', 'reason'],
                  },
                },
              },
              required: ['matches'],
            },
          },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('Gemini match error:', err)
      return NextResponse.json({ error: 'Gemini API error' }, { status: res.status })
    }

    const data = await res.json()
    const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!textResponse) {
      return NextResponse.json({ error: 'No response from Gemini' }, { status: 500 })
    }

    const parsed = JSON.parse(textResponse)
    return NextResponse.json(parsed)
  } catch (err) {
    console.error('POST /api/coverletter/match error:', err)
    return NextResponse.json({ error: 'Failed to match blocks', details: String(err) }, { status: 500 })
  }
}
