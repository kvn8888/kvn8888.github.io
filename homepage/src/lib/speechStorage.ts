import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getSecret } from '@/lib/secrets'

/* ── S3 client ── */

async function getSpeechS3Client(): Promise<{ client: S3Client; bucket: string; region: string }> {
  const bucket = await getSecret('SPEECH_S3_BUCKET')
  const region = (await getSecret('AWS_REGION')) || 'us-east-1'
  const accessKeyId = await getSecret('AWS_ACCESS_KEY_ID')
  const secretAccessKey = await getSecret('AWS_SECRET_ACCESS_KEY')

  if (!bucket) throw new Error('SPEECH_S3_BUCKET not configured')
  if (!accessKeyId || !secretAccessKey) throw new Error('AWS credentials not configured')

  return {
    bucket,
    region,
    client: new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      // Follow redirects server-side only; client presigned URLs must not redirect
    }),
  }
}

/* ── Presigned PUT URL for browser-direct uploads ── */

export async function createPresignedPutUrl(
  key: string,
  contentType: string
): Promise<{ url: string; key: string; region: string }> {
  const { client, bucket, region } = await getSpeechS3Client()
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  })
  const url = await getSignedUrl(client, command, { expiresIn: 600 })
  return { url, key, region }
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

/* ── Saved recordings (max 3, stored under recordings/ prefix) ── */

// S3 prefix for saved mic recordings
const RECORDINGS_PREFIX = 'recordings/'
// Hard limit on stored recordings — oldest is auto-evicted when exceeded
const MAX_RECORDINGS = 3

// Shape returned to the client for each saved recording
export interface SavedRecording {
  id: string         // filename without prefix, e.g. "1712678400000-abc123.webm"
  key: string        // full S3 key, e.g. "recordings/1712678400000-abc123.webm"
  sizeBytes: number
  createdAt: string  // ISO 8601 timestamp from S3 LastModified
}

/**
 * List all saved recordings, sorted oldest-first.
 * Returns at most MAX_RECORDINGS items.
 */
export async function listRecordings(): Promise<SavedRecording[]> {
  const { client, bucket } = await getSpeechS3Client()
  const res = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: RECORDINGS_PREFIX })
  )
  if (!res.Contents) return []

  return res.Contents
    .filter((obj) => obj.Key && obj.Key !== RECORDINGS_PREFIX)
    .map((obj) => ({
      id: obj.Key!.replace(RECORDINGS_PREFIX, ''),
      key: obj.Key!,
      sizeBytes: obj.Size ?? 0,
      createdAt: obj.LastModified?.toISOString() ?? new Date().toISOString(),
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * Upload a new recording to S3. If we already have MAX_RECORDINGS,
 * the oldest one is automatically deleted to make room.
 * Returns the metadata of the newly saved recording.
 */
export async function uploadRecording(
  body: Buffer,
  filename: string,
  contentType: string
): Promise<SavedRecording> {
  const existing = await listRecordings()

  // Auto-evict oldest recordings until we have room for one more
  while (existing.length >= MAX_RECORDINGS) {
    const oldest = existing.shift()!
    await deleteFromS3(oldest.key)
  }

  // Generate a unique key: timestamp + 6-char random hex
  const timestamp = Date.now()
  const rand = Math.random().toString(16).slice(2, 8)
  const ext = filename.split('.').pop() || 'webm'
  const key = `${RECORDINGS_PREFIX}${timestamp}-${rand}.${ext}`

  const { client, bucket } = await getSpeechS3Client()
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )

  return {
    id: key.replace(RECORDINGS_PREFIX, ''),
    key,
    sizeBytes: body.byteLength,
    createdAt: new Date(timestamp).toISOString(),
  }
}

/**
 * Generate a short-lived presigned GET URL so the browser can download
 * a saved recording for retry transcription (expires in 10 minutes).
 */
export async function createPresignedGetUrl(key: string): Promise<string> {
  const { client, bucket } = await getSpeechS3Client()
  const command = new GetObjectCommand({ Bucket: bucket, Key: key })
  return getSignedUrl(client, command, { expiresIn: 600 })
}
