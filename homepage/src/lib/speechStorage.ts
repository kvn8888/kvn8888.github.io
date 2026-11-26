import { createHash, randomUUID } from 'node:crypto'
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

/* ── Durable, owner-scoped saved recordings ── */

const RECORDINGS_PREFIX = 'recordings/'
const RECORDING_ID = /^\d{10,16}-[a-f0-9-]{6,36}\.[a-z0-9]{1,8}$/i

export function speechOwnerHash(email: string) {
  return createHash('sha256').update(email.toLowerCase()).digest('hex')
}

function recordingPrefix(email: string) { return RECORDINGS_PREFIX + speechOwnerHash(email) + '/' }
function canReadLegacy(email: string) {
  return (process.env.ALLOWED_EMAILS || '').split(',').some(value => value.trim().toLowerCase() === email.toLowerCase())
}
export interface SavedRecording {
  id: string
  key: string
  sizeBytes: number
  createdAt: string
}

export async function listRecordings(email: string): Promise<SavedRecording[]> {
  const { client, bucket } = await getSpeechS3Client()
  const collect = async (prefix: string) => {
    const items: SavedRecording[] = []
    let token: string | undefined
    do {
      const response = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: '/', ContinuationToken: token }))
      for (const obj of response.Contents ?? []) {
        const id = obj.Key?.slice(prefix.length) ?? ''
        if (RECORDING_ID.test(id)) items.push({ id, key: obj.Key!, sizeBytes: obj.Size ?? 0, createdAt: obj.LastModified?.toISOString() ?? new Date().toISOString() })
      }
      token = response.NextContinuationToken
    } while (token)
    return items
  }
  const items = await collect(recordingPrefix(email))
  if (canReadLegacy(email)) items.push(...await collect(RECORDINGS_PREFIX))
  return items.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50)
}

export async function uploadRecording(email: string, body: Buffer, filename: string, contentType: string): Promise<SavedRecording> {
  const timestamp = Date.now()
  const candidate = filename.split('.').pop() || 'webm'
  const ext = /^[a-z0-9]{1,8}$/i.test(candidate) ? candidate : 'webm'
  const id = `${timestamp}-${randomUUID()}.${ext}`
  const key = recordingPrefix(email) + id
  const { client, bucket } = await getSpeechS3Client()
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }))
  return { id, key, sizeBytes: body.byteLength, createdAt: new Date(timestamp).toISOString() }
}

export async function downloadRecording(email: string, id: string) {
  if (!RECORDING_ID.test(id)) throw new Error('Invalid recording ID')
  try { return await downloadFromS3(recordingPrefix(email) + id) }
  catch (error) {
    if (!canReadLegacy(email)) throw error
    return downloadFromS3(RECORDINGS_PREFIX + id)
  }
}

export async function removeRecording(email: string, id: string) {
  if (!RECORDING_ID.test(id)) throw new Error('Invalid recording ID')
  const { client, bucket } = await getSpeechS3Client()
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: recordingPrefix(email) + id }))
  if (canReadLegacy(email)) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: RECORDINGS_PREFIX + id }))
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
