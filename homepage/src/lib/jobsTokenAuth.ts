import { getSecret } from './secrets'
import { isJobsAgentRequest, matchesJobsApiKey } from './jobsApiKey'

export async function getJobsTokenIdentity(request: Request): Promise<string | null> {
  if (!isJobsAgentRequest(new URL(request.url).pathname, request.method)) return null
  const header = request.headers.get('authorization')
  // Reader first: configuring the same value under two names must not elevate it.
  if (matchesJobsApiKey(header, await getSecret('JOBS_READ_API_KEY'))) return request.method === 'GET' ? 'tracker-reader' : null
  if (matchesJobsApiKey(header, await getSecret('JOBS_EXTENSION_API_KEY'))) return 'tracker-extension'
  if (matchesJobsApiKey(header, await getSecret('JOBS_API_KEY'))) return 'tracker-agent'
  return null
}
