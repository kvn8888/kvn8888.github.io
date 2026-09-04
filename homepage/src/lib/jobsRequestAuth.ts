import { auth } from '@/auth'
import { getSecret } from '@/lib/secrets'
import { isJobsAgentRequest, matchesJobsApiKey } from '@/lib/jobsApiKey'

export async function getJobsIdentity(req: Request): Promise<string | null> {
  const header = req.headers.get('authorization')
  if (header !== null) {
    if (!isJobsAgentRequest(new URL(req.url).pathname, req.method)) return null
    return matchesJobsApiKey(header, await getSecret('JOBS_API_KEY')) ? 'tracker-agent' : null
  }
  const session = await auth()
  return session?.user?.email?.toLowerCase() || null
}
