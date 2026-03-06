export { auth as proxy } from "@/auth"

export const config = {
  matcher: [
    "/projects/:path*",
    "/tools/:path*",
    "/api/logins/:path*",
    "/api/secrets/:path*",
    "/api/usage/:path*",
    "/api/jobs/:path*",
    "/api/coverletter/:path*",
    "/api/speech/:path*",
    "/api/notes/:path*",
    "/api/tools/:path*",
  ],
}
