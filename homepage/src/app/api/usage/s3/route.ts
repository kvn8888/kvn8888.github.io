import { auth } from '@/auth'
import { S3Client, ListBucketsCommand, GetBucketLocationCommand } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'

/*
 * S3 Usage API Proxy — /api/usage/s3
 *
 * Returns S3 bucket information for the configured AWS account.
 * Storage metrics (size, object count) require CloudWatch metrics API which
 * is not included here to avoid adding an additional SDK dependency.
 * This route lists buckets and their regions as a lightweight status check.
 *
 * Env vars used (AWS SDK automatically reads these):
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION (default: us-east-1)
 *   SPEECH_S3_BUCKET — the specific bucket name used for TTS audio storage
 */

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hasCredentials = Boolean(
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
  )
  if (!hasCredentials) {
    return NextResponse.json(
      { error: 'AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY not configured' },
      { status: 500 }
    )
  }

  const region = process.env.AWS_REGION || 'us-east-1'
  const speechBucket = process.env.SPEECH_S3_BUCKET || null
  const client = new S3Client({ region })

  try {
    const { Buckets = [] } = await client.send(new ListBucketsCommand({}))

    // Resolve location for each bucket (parallel, best-effort)
    const bucketsWithRegion = await Promise.allSettled(
      Buckets.map(async (b) => {
        if (!b.Name) return { name: b.Name ?? '', region: 'unknown', createdAt: b.CreationDate?.toISOString() ?? null }
        try {
          const loc = await client.send(new GetBucketLocationCommand({ Bucket: b.Name }))
          const bucketRegion = loc.LocationConstraint || 'us-east-1'
          return { name: b.Name, region: bucketRegion, createdAt: b.CreationDate?.toISOString() ?? null }
        } catch {
          return { name: b.Name, region: 'unknown', createdAt: b.CreationDate?.toISOString() ?? null }
        }
      })
    )

    const buckets = bucketsWithRegion
      .filter((r): r is PromiseFulfilledResult<{ name: string; region: string; createdAt: string | null }> => r.status === 'fulfilled')
      .map((r) => r.value)

    return NextResponse.json({
      configured: true,
      region,
      speechBucket,
      bucketCount: buckets.length,
      buckets,
      note: 'Storage byte/object count requires CloudWatch Metrics; visit S3 console for precise usage.',
      dashboardUrl: 'https://s3.console.aws.amazon.com/s3/home',
    })
  } catch (err) {
    console.error('S3 usage fetch failed', { error: err })
    return NextResponse.json(
      { configured: true, error: 'Failed to list S3 buckets. Check IAM permissions (s3:ListAllMyBuckets).', dashboardUrl: 'https://s3.console.aws.amazon.com/s3/home' },
      { status: 200 }
    )
  }
}
