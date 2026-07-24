import { auth } from "@/auth"
import { NextResponse } from "next/server"
import {
  collectGithubUsage,
  getUsageCollectorErrorResponse,
} from '@/lib/usageCollectors'

const DEPRECATION_HEADERS = {
  Deprecation: 'true',
  Link: '</projects/usage>; rel="successor-version"',
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await collectGithubUsage()
    return NextResponse.json(
      { ...result.payload, deprecated: true },
      { headers: DEPRECATION_HEADERS }
    )
  } catch (error) {
    const response = getUsageCollectorErrorResponse(error, 'Failed to fetch GitHub usage')
    return NextResponse.json(response.body, {
      status: response.status,
      headers: DEPRECATION_HEADERS,
    })
  }
}
