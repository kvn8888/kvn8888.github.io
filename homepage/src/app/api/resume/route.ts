import { NextResponse } from "next/server"
import { getSecret } from "@/lib/secrets"

async function resolveResumeUrl() {
  const explicitUrl = await getSecret("RESUME_S3_PUBLIC_URL")
  if (explicitUrl) return explicitUrl

  const region = await getSecret("AWS_REGION")
  const bucket = await getSecret("RESUME_S3_BUCKET")
  const resumeKey = (await getSecret("RESUME_S3_KEY")) || "resume.pdf"
  if (!region || !bucket) return null

  const encodedKey = resumeKey.split("/").map(encodeURIComponent).join("/")
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`
}

export async function GET() {
  const resumeUrl = await resolveResumeUrl()
  if (!resumeUrl) {
    return NextResponse.json({ error: "Resume URL is not configured" }, { status: 500 })
  }

  return NextResponse.redirect(resumeUrl)
}
