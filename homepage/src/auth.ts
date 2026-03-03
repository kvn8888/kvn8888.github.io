import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { isEmailApproved, createLoginAttempt } from "@/lib/db"

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
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isProtected = nextUrl.pathname.startsWith("/projects")

      if (isProtected) {
        return isLoggedIn
      }
      return true
    },
  },
})
