import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getSecret } from '@/lib/secrets'

/* ── S3 client ── */

async function getSpeechS3Client(): Promise<{ client: S3Client; bucket: string }> {
  const bucket = await getSecret('SPEECH_S3_BUCKET')
  const region = (await getSecret('AWS_REGION')) || 'us-east-1'
  const accessKeyId = await getSecret('AWS_ACCESS_KEY_ID')
  const secretAccessKey = await getSecret('AWS_SECRET_ACCESS_KEY')

  if (!bucket) throw new Error('SPEECH_S3_BUCKET not configured')
  if (!accessKeyId || !secretAccessKey) throw new Error('AWS credentials not configured')

  return {
    bucket,
    client: new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }),
  }
}

/* ── Presigned PUT URL for browser-direct uploads ── */

export async function createPresignedPutUrl(
  key: string,
  contentType: string
): Promise<{ url: string; key: string }> {
  const { client, bucket } = await getSpeechS3Client()
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  })
  const url = await getSignedUrl(client, command, { expiresIn: 600 })
  return { url, key }
}

/* ── Download from S3 ── */

export async function downloadFromS3(
  key: string
): Promise<{ buffer: Buffer; contentType: string; contentLength: number }> {
  const { client, bucket } = await getSpeechS3Client()
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const bytes = await response.Body?.transformToByteArray()
  if (!bytes) throw new Error('Empty S3 response body')
  return {
    buffer: Buffer.from(bytes),
    contentType: response.ContentType || 'audio/mpeg',
    contentLength: bytes.length,
  }
}

/* ── Delete from S3 (fire-and-forget safe) ── */

export async function deleteFromS3(key: string): Promise<void> {
  try {
    const { client, bucket } = await getSpeechS3Client()
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  } catch (err) {
    console.error('S3 delete error (non-fatal):', err)
  }
}

/* ── Upload buffer to S3 ── */

export async function uploadToS3(
  body: Buffer,
  key: string,
  contentType: string
): Promise<string | null> {
  try {
    const { client, bucket } = await getSpeechS3Client()
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    )
    return `s3://${bucket}/${key}`
  } catch (err) {
    console.error('S3 upload error:', err)
    return null
  }
}
