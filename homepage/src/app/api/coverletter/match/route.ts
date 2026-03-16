import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { getSecret } from '@/lib/secrets'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = await getSecret('GEMINI_API_KEY')
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })

  try {
    const { jobPosting, blocks, editorContent } = await req.json()
    if (!jobPosting || !blocks || !Array.isArray(blocks)) {
      return NextResponse.json({ error: 'jobPosting (string) and blocks (array) are required' }, { status: 400 })
    }

    const knownIds = new Set(
      blocks
        .map((block: { id?: string }) => String(block.id ?? ''))
        .filter(Boolean)
    )

    const blockList = blocks
      .map((b: { id: string; category: string; text: string; tags?: { name: string }[] }) => {
        const tagSuffix = b.tags?.length
          ? ` | tags: ${b.tags.map((tag) => tag.name).join(', ')}`
          : ''
        return `[${b.id}] (${b.category}${tagSuffix}) ${b.text}`
      })
      .join('\n')

    const currentDraft = typeof editorContent === 'string' && editorContent.trim()
      ? editorContent.trim()
      : '(empty — no cover letter content yet)'

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
                  text: `You are helping build a tailored cover letter. Do two things:

**TASK 1 — MATCH**: From the available blocks below, identify the 3-4 most relevant blocks for the job posting. For each matched block, provide a brief reason (1 sentence) explaining why it fits.

**TASK 2 — SUGGEST**: Analyze the current cover letter draft against this 5-paragraph structural framework. For each paragraph that is MISSING or not yet covered in the draft, generate a concise draft block (2-4 sentences) tailored to the job posting and the candidate's background shown in the available blocks. Only generate suggestions for paragraphs that are genuinely absent — do not generate one if the draft already contains content for that role.

The 5 structural paragraphs:
- Paragraph 1 — Hook + Why This Company (category: Intro): Opens with who you are and a specific reason you're interested in this company/role.
- Paragraph 2 — Most Relevant Experience (category: Work Experience): Leads with your strongest applicable work experience — named client, named tools, named outcome.
- Paragraph 3 — Projects / Breadth (category: Full-Stack): Broadens the picture with personal projects, technical depth, or initiative outside work.
- Paragraph 4 — Mission Alignment + Fit Summary (category: Soft Skills): Reconnects to the company and reframes you as a match with something specific about them.
- Paragraph 5 — Close (category: Closer): Single clean closing sentence.

If the draft already covers all 5 paragraphs, return an empty suggestions array.

Job Posting:
${jobPosting}

Current Cover Letter Draft:
${currentDraft}

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
                suggestions: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      paragraphLabel: { type: 'STRING' },
                      category: { type: 'STRING' },
                      text: { type: 'STRING' },
                      reason: { type: 'STRING' },
                    },
                    required: ['paragraphLabel', 'category', 'text', 'reason'],
                  },
                },
              },
              required: ['matches', 'suggestions'],
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
    const matches = Array.isArray(parsed?.matches)
      ? parsed.matches.filter(
          (match: { id?: string; reason?: string }) =>
            typeof match?.id === 'string' &&
            typeof match?.reason === 'string' &&
            knownIds.has(match.id)
        )
      : []

    const VALID_CATEGORIES = new Set(['Intro', 'Work Experience', 'Full-Stack', 'Soft Skills', 'Closer'])
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions.filter(
          (s: { paragraphLabel?: string; category?: string; text?: string; reason?: string }) =>
            typeof s?.paragraphLabel === 'string' &&
            typeof s?.category === 'string' &&
            typeof s?.text === 'string' &&
            typeof s?.reason === 'string' &&
            VALID_CATEGORIES.has(s.category)
        )
      : []

    return NextResponse.json({ matches, suggestions })
  } catch (err) {
    console.error('POST /api/coverletter/match error:', err)
    return NextResponse.json({ error: 'Failed to match blocks', details: String(err) }, { status: 500 })
  }
}
