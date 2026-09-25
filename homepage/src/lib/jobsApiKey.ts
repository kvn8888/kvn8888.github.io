import { createHash, timingSafeEqual } from 'node:crypto'

/** Deliberately excludes parsing, stats, other APIs, and protected pages. */
export function isJobsAgentRequest(pathname: string, method: string): boolean {
  return (pathname.startsWith('/api/job-workflow/') && ((method === 'GET' && /^\/api\/job-workflow\/(connection|contract|metrics|attempts|blockers|(?:jobs|captures)\/[0-9a-f-]{36})$/i.test(pathname)) || (method === 'POST' && /^\/api\/job-workflow\/(attempts|captures|attempts\/[0-9a-f-]{36}\/(heartbeat|outcome|complete|recover)|blockers\/[0-9a-f-]{36}\/resolve)$/i.test(pathname)))) ||
    (pathname === '/api/jobs' && ['GET', 'POST'].includes(method)) ||
    (pathname === '/api/job-collection' && ['GET', 'POST'].includes(method)) ||
    (pathname === '/api/job-collection/export' && method === 'GET') ||
    (/^\/api\/job-collection\/[0-9a-f-]{36}$/i.test(pathname) && ['GET', 'PATCH'].includes(method)) ||
    (/^\/api\/jobs\/[1-9]\d*$/.test(pathname) && ['GET', 'PATCH'].includes(method))
}

export function matchesJobsApiKey(header: string | null, configured: string | undefined): boolean {
  if (!configured || configured.length < 32 || !header) return false
  const match = /^Bearer ([^\s]+)$/i.exec(header)
  if (!match) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(match[1]), digest(configured))
}
