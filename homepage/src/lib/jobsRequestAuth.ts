import { auth } from '@/auth'
import { getJobsTokenIdentity } from './jobsTokenAuth'

export async function getJobsIdentity(req: Request): Promise<string | null> {
  const header = req.headers.get('authorization')
  if (header !== null) {
    return getJobsTokenIdentity(req)
  }
  const session = await auth()
  return session?.user?.email?.toLowerCase() || null
}
