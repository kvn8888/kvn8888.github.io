import { auth } from "@/auth"
import { canAccessPath } from "@/lib/accessGrants"
import { getEmailAccessGrantKeys } from "@/lib/db"
import SpeechLabPage from "@/app/projects/tools/speech/page"

// Server component wrapper that resolves pronunciation access before
// rendering the client-side speech page.
export default async function SpeechStudioPage() {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()

  // Owner accounts (ALLOWED_EMAILS) have empty grantKeys → full access.
  // Invited users get specific keys; check whether pronunciation is included.
  const grantKeys = email ? await getEmailAccessGrantKeys(email) : []
  const hidePronunciation =
    grantKeys.length > 0 && !canAccessPath(grantKeys, '/api/speech/pronunciation')

  return <SpeechLabPage hidePronunciation={hidePronunciation} />
}
