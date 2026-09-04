import { isJobsAgentRequest, matchesJobsApiKey } from "@/lib/jobsApiKey"
import { getSecret } from "@/lib/secrets"
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { NextResponse } from "next/server"
import { canAccessPath, getDefaultAuthorizedRedirect } from "@/lib/accessGrants"
import { createLoginAttempt, getEmailAccessGrantKeys, isEmailApproved } from "@/lib/db"

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "").split(",").map((e) => e.trim().toLowerCase())

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.email) return false
      const email = profile.email.toLowerCase()

      // Check env whitelist first (owner accounts)
      if (ALLOWED_EMAILS.includes(email)) return true

      // Check Turso DB for approved emails
      const approved = await isEmailApproved(email)
      if (approved) return true

      // Log the attempt for admin review
      await createLoginAttempt(email, 'google')
      return false
    },
    async authorized({ auth, request }) {
      const { nextUrl } = request
      const pathname = nextUrl.pathname
      if (isJobsAgentRequest(pathname, request.method) && request.headers.has('authorization')) {
        const valid = matchesJobsApiKey(request.headers.get('authorization'), await getSecret('JOBS_API_KEY'))
        return valid || NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const isProtectedPage =
        pathname.startsWith("/projects") || pathname.startsWith("/tools")
      const isProtectedApi =
        pathname.startsWith("/api/logins") ||
        pathname.startsWith("/api/secrets") ||
        pathname.startsWith("/api/usage") ||
        pathname.startsWith("/api/jobs") ||
        pathname.startsWith("/api/coverletter") ||
        pathname.startsWith("/api/speech") ||
        pathname.startsWith("/api/notes") ||
        pathname.startsWith("/api/projects") ||
        pathname.startsWith("/api/tools")
      const isProtected = isProtectedPage || isProtectedApi

      // Dev-only bypass: requires BOTH NODE_ENV=development AND DEV_BYPASS_AUTH=true in .env.local
      // NODE_ENV is always "production" on Vercel, so this can never activate in a real deploy
      if (process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true' && isProtected) {
        return true
      }

      if (!isProtected) {
        return true
      }

      if (!auth?.user?.email) {
        if (isProtectedApi) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        return false
      }

      const email = auth.user.email.toLowerCase()

      if (ALLOWED_EMAILS.includes(email)) {
        return true
      }

      const approved = await isEmailApproved(email)
      if (!approved) {
        if (isProtectedApi) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        return NextResponse.redirect(new URL("/", nextUrl))
      }

      const grantKeys = await getEmailAccessGrantKeys(email)
      if (canAccessPath(grantKeys, pathname)) {
        return true
      }

      if (isProtectedApi) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }

      return NextResponse.redirect(
        new URL(getDefaultAuthorizedRedirect(grantKeys, pathname), nextUrl)
      )
    },
  },
})
