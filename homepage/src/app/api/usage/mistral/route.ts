import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { getSecret } from '@/lib/secrets'

/*
 * Mistral Usage API Proxy — /api/usage/mistral
 *
 * Mistral's public API (api.mistral.ai/v1) is an inference API, not a billing
 * API.  Billing and usage are managed in La Plateforme (console.mistral.ai).
 *
 * What we CAN do with an inference API key:
 *   1. Verify the key is valid via GET /v1/models (always available)
 *   2. Try GET /v1/usage/monthly — a usage endpoint added in late 2024 that
 *      returns per-model token consumption for the current calendar month.
 *      This endpoint requires a key with billing:read permissions; it may
 *      return 401/403 for keys that lack those permissions.
 *
 * Response shape for /v1/usage/monthly (when available):
 *   {
 *     object: 'list',
 *     data: [
 *       {
 *         model:             string,       // e.g. 'mistral-large-latest'
 *         requests:          number,
 *         prompt_tokens:     number,
 *         completion_tokens: number,
 *         total_tokens:      number
 *       }
 *     ],
 *     period: { start: string, end: string }  // ISO-8601 dates
 *   }
 *
 * Env var required: MISTRAL_API_KEY
 */

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = await getSecret('MISTRAL_API_KEY')
  if (!apiKey) {
    return NextResponse.json({ error: 'MISTRAL_API_KEY not configured' }, { status: 500 })
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  // ── 1. Try monthly usage endpoint ──────────────────────────────────────────
  try {
    const usageRes = await fetch('https://api.mistral.ai/v1/usage/monthly', {
      headers,
      cache: 'no-store',
    })

    if (usageRes.ok) {
      const usage = await usageRes.json() as {
        object: string
        data: { model: string; requests: number; prompt_tokens: number; completion_tokens: number; total_tokens: number }[]
        period?: { start: string; end: string }
      }

      return NextResponse.json({
        configured: true,
        source: 'monthly_usage',
        models: usage.data ?? [],
        period: usage.period ?? null,
        totalTokens: (usage.data ?? []).reduce((sum, m) => sum + (m.total_tokens ?? 0), 0),
        totalRequests: (usage.data ?? []).reduce((sum, m) => sum + (m.requests ?? 0), 0),
        dashboardUrl: 'https://console.mistral.ai/usage',
      })
    }

    // 401/403 means the key doesn't have billing:read — fall through to model list
    if (usageRes.status !== 401 && usageRes.status !== 403) {
      const errText = await usageRes.text()
      console.warn('Mistral /v1/usage/monthly unexpected status', { status: usageRes.status, body: errText })
    }
  } catch (err) {
    console.warn('Mistral /v1/usage/monthly failed, falling back to /v1/models', { error: err })
  }

  // ── 2. Fallback: verify key via /v1/models ──────────────────────────────────
  try {
    const modelsRes = await fetch('https://api.mistral.ai/v1/models', {
      headers,
      cache: 'no-store',
    })

    if (!modelsRes.ok) {
      const errText = await modelsRes.text()
      console.error('Mistral /v1/models error', { status: modelsRes.status, body: errText })
      return NextResponse.json(
        {
          configured: true,
          source: 'key_invalid',
          error: `Mistral API key returned ${modelsRes.status} — key may be expired or invalid`,
          dashboardUrl: 'https://console.mistral.ai/',
        },
        { status: 200 }
      )
    }

    const models = await modelsRes.json() as { data: { id: string; object: string }[] }
    const modelIds = (models.data ?? []).map((m) => m.id)

    return NextResponse.json({
      configured: true,
      source: 'models_list',
      keyValid: true,
      availableModels: modelIds,
      note: 'Usage metrics require a key with billing:read permissions. Visit console for detailed stats.',
      dashboardUrl: 'https://console.mistral.ai/usage',
    })
  } catch (err) {
    console.error('Mistral usage fetch failed', { error: err })
    return NextResponse.json(
      {
        configured: true,
        source: 'error',
        error: 'Failed to reach Mistral API',
        dashboardUrl: 'https://console.mistral.ai/',
      },
      { status: 200 }
    )
  }
}
