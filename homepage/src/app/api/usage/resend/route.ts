import { auth } from '@/auth'
import { NextResponse } from 'next/server'
import { getSecret } from '@/lib/secrets'

/*
 * Resend Usage API Proxy — /api/usage/resend
 *
 * Resend does not expose a public "email send count" or quota API as of 2025-03.
 * The most useful signals we can surface from the API are:
 *   1. Domain verification status (which domains are ready to send from)
 *   2. API key inventory (how many keys are active)
 *
 * Confirmed API schemas:
 *
 *   GET /domains
 *   Response: { data: ResendDomain[] }
 *   ResendDomain {
 *     id:         string
 *     name:       string
 *     status:     "not_started" | "pending" | "verified" | "failure" | "temporary_failure"
 *     created_at: string   // ISO-8601
 *     region:     "us-east-1" | "eu-west-1" | "sa-east-1"
 *     records:    DnsRecord[]
 *   }
 *
 *   GET /api-keys
 *   Response: { data: ResendApiKey[] }
 *   ResendApiKey {
 *     id:         string
 *     name:       string
 *     created_at: string   // ISO-8601
 *   }
 *
 * Resend API docs: https://resend.com/docs/api-reference/domains/list-domains
 *
 * Env var required: RESEND_API_KEY
 */

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = await getSecret('RESEND_API_KEY')
  if (!apiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  // Confirmed response types from Resend API docs
  interface ResendDomain {
    id: string
    name: string
    status: string
    created_at: string
    region: string
    records?: unknown[]
  }
  interface ResendApiKey {
    id: string
    name: string
    created_at: string
  }

  const authHeaders = { Authorization: `Bearer ${apiKey}` }

  const [domainsRes, apiKeyRes] = await Promise.allSettled([
    fetch('https://api.resend.com/domains', {
      headers: authHeaders,
      cache: 'no-store',
    }),
    fetch('https://api.resend.com/api-keys', {
      headers: authHeaders,
      cache: 'no-store',
    }),
  ])

  let domains: ResendDomain[] = []
  let apiKeys: ResendApiKey[] = []
  let warning: string | undefined

  if (domainsRes.status === 'fulfilled' && domainsRes.value.ok) {
    const data = await domainsRes.value.json() as { data?: ResendDomain[] }
    domains = data.data ?? []
  } else {
    warning = 'Could not fetch domain list'
  }

  if (apiKeyRes.status === 'fulfilled' && apiKeyRes.value.ok) {
    const data = await apiKeyRes.value.json() as { data?: ResendApiKey[] }
    apiKeys = data.data ?? []
  }

  return NextResponse.json({
    configured: true,
    domains: domains.map((d) => ({
      id: d.id,
      name: d.name,
      // status values: not_started | pending | verified | failure | temporary_failure
      status: d.status,
      region: d.region,
      // Normalize snake_case API field to camelCase for the frontend interface
      createdAt: d.created_at,
    })),
    apiKeyCount: apiKeys.length,
    ...(warning ? { warning } : {}),
    dashboardUrl: 'https://resend.com/overview',
  })
}
