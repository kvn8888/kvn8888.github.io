import { createHash, timingSafeEqual } from 'node:crypto'

/** Deliberately excludes parsing, stats, other APIs, and protected pages. */
export function isJobsAgentRequest(pathname: string, method: string): boolean {
  return (pathname === '/api/jobs' && ['GET', 'POST'].includes(method)) ||
    (/^\/api\/jobs\/[1-9]\d*$/.test(pathname) && method === 'PATCH')
}

export function matchesJobsApiKey(header: string | null, configured: string | undefined): boolean {
  if (!configured || configured.length < 32 || !header) return false
  const match = /^Bearer ([^\s]+)$/i.exec(header)
  if (!match) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(match[1]), digest(configured))
}
