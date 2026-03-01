import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

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
    signIn({ profile }) {
      if (!profile?.email) return false
      return ALLOWED_EMAILS.includes(profile.email.toLowerCase())
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
