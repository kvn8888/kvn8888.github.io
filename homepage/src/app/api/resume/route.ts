import { NextResponse } from "next/server"

const RESUME_KEY = process.env.RESUME_S3_KEY || "resume.pdf"

function resolveResumeUrl() {
  if (process.env.RESUME_S3_PUBLIC_URL) return process.env.RESUME_S3_PUBLIC_URL

  const region = process.env.AWS_REGION
  const bucket = process.env.RESUME_S3_BUCKET
  if (!region || !bucket) return null

  const encodedKey = RESUME_KEY.split("/").map(encodeURIComponent).join("/")
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`
}

export async function GET() {
  const resumeUrl = resolveResumeUrl()
  if (!resumeUrl) {
    return NextResponse.json({ error: "Resume URL is not configured" }, { status: 500 })
  }

  return NextResponse.redirect(resumeUrl)
}
