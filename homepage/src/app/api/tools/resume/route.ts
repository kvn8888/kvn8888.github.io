import { auth } from "@/auth"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { NextResponse } from "next/server"

const RESUME_KEY = process.env.RESUME_S3_KEY || "Kevin_Chen_Resume.pdf"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const region = process.env.AWS_REGION
  const bucket = process.env.RESUME_S3_BUCKET
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    return NextResponse.json({ error: "S3 environment variables are not configured" }, { status: 500 })
  }

  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "PDF file is required" }, { status: 400 })
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 })
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "PDF must be 10MB or smaller" }, { status: 400 })
  }

  try {
    const client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: RESUME_KEY,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: "application/pdf",
        CacheControl: "no-cache",
      }),
    )

    return NextResponse.json({ ok: true, url: "/api/resume" })
  } catch {
    return NextResponse.json({ error: "Failed to upload resume to S3" }, { status: 500 })
  }
}
