import { auth } from '@/auth'
import { COVER_LETTER_REVIEW_RUBRIC } from '@/lib/coverLetterRubric'
import { getSecret } from '@/lib/secrets'
import { NextRequest, NextResponse } from 'next/server'

interface RawCriterionResult {
  name?: string
  score?: string
  feedback?: string
}

interface RawReviewResult {
  overallAssessment?: string
  highestImpactChange?: string
  criteria?: RawCriterionResult[]
  weakestParagraph?: {
    original?: string
    rewritten?: string
  }
}

function normalizeScore(score: string | undefined) {
  const normalized = String(score ?? '').trim().toLowerCase()
  if (normalized === 'strong') return 'Strong'
  if (normalized === 'adequate') return 'Adequate'
  return 'Weak'
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = await getSecret('GEMINI_API_KEY')
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })

  try {
    const body = await request.json()
    const coverLetter = String(body.coverLetter ?? '').trim()
    const jobPosting = String(body.jobPosting ?? '').trim()

    if (!coverLetter || !jobPosting) {
      return NextResponse.json(
        { error: 'coverLetter and jobPosting are required' },
        { status: 400 }
      )
    }

    const prompt = `You are reviewing a software-engineering cover letter draft.

Use the rubric below exactly as written. Do not invent new criteria, do not rename the scores, and do not skip any criterion.

${COVER_LETTER_REVIEW_RUBRIC}

Job Posting:
${jobPosting}

Cover Letter Draft:
${coverLetter}

Return JSON only. Each criterion must include a concrete explanation tied to the draft and job posting. The weakest paragraph should quote the original paragraph you think needs the most work and provide a stronger rewrite.`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                overallAssessment: { type: 'STRING' },
                highestImpactChange: { type: 'STRING' },
                criteria: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      name: { type: 'STRING' },
                      score: { type: 'STRING' },
                      feedback: { type: 'STRING' },
                    },
                    required: ['name', 'score', 'feedback'],
                  },
                },
                weakestParagraph: {
                  type: 'OBJECT',
                  properties: {
                    original: { type: 'STRING' },
                    rewritten: { type: 'STRING' },
                  },
                  required: ['original', 'rewritten'],
                },
              },
              required: ['overallAssessment', 'highestImpactChange', 'criteria', 'weakestParagraph'],
            },
          },
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini grade error:', errorText)
      return NextResponse.json({ error: 'Gemini API error' }, { status: response.status })
    }

    const data = await response.json()
    const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!textResponse) {
      return NextResponse.json({ error: 'No response from Gemini' }, { status: 500 })
    }

    const parsed = JSON.parse(textResponse) as RawReviewResult
    const review = {
      overallAssessment: String(parsed.overallAssessment ?? '').trim(),
      highestImpactChange: String(parsed.highestImpactChange ?? '').trim(),
      criteria: Array.isArray(parsed.criteria)
        ? parsed.criteria.map((criterion) => ({
            name: String(criterion.name ?? '').trim(),
            score: normalizeScore(criterion.score),
            feedback: String(criterion.feedback ?? '').trim(),
          }))
        : [],
      weakestParagraph: {
        original: String(parsed.weakestParagraph?.original ?? '').trim(),
        rewritten: String(parsed.weakestParagraph?.rewritten ?? '').trim(),
      },
    }

    return NextResponse.json({ review })
  } catch (error) {
    console.error('POST /api/coverletter/grade error:', error)
    return NextResponse.json(
      { error: 'Failed to grade cover letter', details: String(error) },
      { status: 500 }
    )
  }
}