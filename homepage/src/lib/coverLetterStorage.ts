import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSecret } from './secrets'

const COVER_LETTER_STORAGE_PREFIX = 'coverletter'
const REFERENCE_RESUME_PREFIX = `${COVER_LETTER_STORAGE_PREFIX}/reference-resumes`
const SAVED_LETTER_PREFIX = `${COVER_LETTER_STORAGE_PREFIX}/letters`
const MAX_REFERENCE_RESUME_BYTES = 10 * 1024 * 1024

export interface StoredReferenceResumeSummary {
  id: string
  name: string
  size: number
  uploadedAt: string | null
  href: string
}

export interface StoredCoverLetterSummary {
  id: string
  title: string
  size: number
  updatedAt: string | null
}

export interface StoredCoverLetterDocument {
  id: string
  title: string
  html: string
  plainText: string
  jobPosting: string
  createdAt: string
  updatedAt: string
}

interface CoverLetterStorageClient {
  bucket: string
  client: S3Client
}

interface SaveStoredCoverLetterInput {
  id?: string
  title: string
  html: string
  plainText: string
  jobPosting?: string
}

export class CoverLetterStorageError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'CoverLetterStorageError'
    this.status = status
  }
}

function normalizeId(value: string) {
  const trimmed = value.trim()
  if (!trimmed || !/^[a-zA-Z0-9-]+$/.test(trimmed)) {
    throw new CoverLetterStorageError('Invalid storage id', 400)
  }

  return trimmed
}

function normalizeDocumentTitle(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    throw new CoverLetterStorageError('Document title is required', 400)
  }

  return normalized
}

function encodeMetadataValue(value: string) {
  return encodeURIComponent(value)
}

function decodeMetadataValue(value: string | undefined, fallback: string) {
  if (!value) return fallback

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function getReferenceResumeKey(id: string) {
  return `${REFERENCE_RESUME_PREFIX}/${normalizeId(id)}.pdf`
}

function getSavedLetterKey(id: string) {
  return `${SAVED_LETTER_PREFIX}/${normalizeId(id)}.json`
}

function extractIdFromKey(key: string, prefix: string, suffix: string) {
  const prefixWithSlash = `${prefix}/`
  if (!key.startsWith(prefixWithSlash) || !key.endsWith(suffix)) {
    return null
  }

  const id = key.slice(prefixWithSlash.length, -suffix.length)
  return id || null
}

function isS3NotFoundError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const errorName = 'name' in error ? String(error.name) : ''
  return errorName === 'NoSuchKey' || errorName === 'NotFound'
}

// This workbench storage intentionally reuses the existing resume bucket.
// Prefixes keep public resume files and private cover-letter assets separated.
async function getCoverLetterStorageClient(): Promise<CoverLetterStorageClient> {
  const region = (await getSecret('AWS_REGION')) || 'us-east-1'
  const bucket = await getSecret('RESUME_S3_BUCKET')
  const accessKeyId = await getSecret('AWS_ACCESS_KEY_ID')
  const secretAccessKey = await getSecret('AWS_SECRET_ACCESS_KEY')

  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new CoverLetterStorageError('S3 environment variables are not configured', 500)
  }

  return {
    bucket,
    client: new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
  }
}

// Reference resumes are stored as PDF objects so later Gemini review can pull
// concrete source resumes from S3 without asking the user to re-upload them.
export async function listStoredReferenceResumes(): Promise<StoredReferenceResumeSummary[]> {
  const { bucket, client } = await getCoverLetterStorageClient()
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${REFERENCE_RESUME_PREFIX}/`,
    })
  )

  const objects = (response.Contents ?? []).filter((object) => object.Key?.endsWith('.pdf'))

  const resumes = await Promise.all(
    objects.map(async (object) => {
      const key = object.Key
      if (!key) {
        throw new CoverLetterStorageError('Reference resume key is missing', 500)
      }

      const id = extractIdFromKey(key, REFERENCE_RESUME_PREFIX, '.pdf')
      if (!id) {
        throw new CoverLetterStorageError('Reference resume key is invalid', 500)
      }

      const head = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      )

      return {
        id,
        name: decodeMetadataValue(head.Metadata?.originalname, `${id}.pdf`),
        size: Number(head.ContentLength ?? object.Size ?? 0),
        uploadedAt: object.LastModified?.toISOString() ?? null,
        href: `/api/coverletter/reference-resumes/${id}`,
      }
    })
  )

  return resumes.sort((left, right) => (right.uploadedAt ?? '').localeCompare(left.uploadedAt ?? ''))
}

export async function uploadStoredReferenceResume(file: File): Promise<StoredReferenceResumeSummary> {
  if (file.type !== 'application/pdf') {
    throw new CoverLetterStorageError('Only PDF files are supported', 400)
  }

  if (file.size > MAX_REFERENCE_RESUME_BYTES) {
    throw new CoverLetterStorageError('Reference resume PDFs must be 10MB or smaller', 400)
  }

  const id = crypto.randomUUID()
  const uploadedAt = new Date().toISOString()
  const { bucket, client } = await getCoverLetterStorageClient()

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: getReferenceResumeKey(id),
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: 'application/pdf',
      CacheControl: 'no-cache',
      Metadata: {
        originalname: encodeMetadataValue(file.name),
      },
    })
  )

  return {
    id,
    name: file.name,
    size: file.size,
    uploadedAt,
    href: `/api/coverletter/reference-resumes/${id}`,
  }
}

export async function readStoredReferenceResume(id: string) {
  const { bucket, client } = await getCoverLetterStorageClient()

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: getReferenceResumeKey(id),
      })
    )

    if (!response.Body) {
      throw new CoverLetterStorageError('Reference resume body is missing', 500)
    }

    return {
      bytes: Buffer.from(await response.Body.transformToByteArray()),
      contentType: response.ContentType || 'application/pdf',
      name: decodeMetadataValue(response.Metadata?.originalname, `${normalizeId(id)}.pdf`),
    }
  } catch (error) {
    if (isS3NotFoundError(error)) {
      throw new CoverLetterStorageError('Reference resume not found', 404)
    }

    throw error
  }
}

export async function deleteStoredReferenceResume(id: string) {
  const { bucket, client } = await getCoverLetterStorageClient()

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: getReferenceResumeKey(id),
      })
    )
  } catch (error) {
    if (isS3NotFoundError(error)) {
      throw new CoverLetterStorageError('Reference resume not found', 404)
    }

    throw error
  }
}

// Saved cover letters store both HTML and plain text so the workbench can
// restore rich editor state while still giving Gemini a clean plain-text draft.
export async function listStoredCoverLetters(): Promise<StoredCoverLetterSummary[]> {
  const { bucket, client } = await getCoverLetterStorageClient()
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${SAVED_LETTER_PREFIX}/`,
    })
  )

  const objects = (response.Contents ?? []).filter((object) => object.Key?.endsWith('.json'))

  const letters = await Promise.all(
    objects.map(async (object) => {
      const key = object.Key
      if (!key) {
        throw new CoverLetterStorageError('Saved cover letter key is missing', 500)
      }

      const id = extractIdFromKey(key, SAVED_LETTER_PREFIX, '.json')
      if (!id) {
        throw new CoverLetterStorageError('Saved cover letter key is invalid', 500)
      }

      const head = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      )

      return {
        id,
        title: decodeMetadataValue(head.Metadata?.title, `Draft ${id.slice(0, 8)}`),
        size: Number(head.ContentLength ?? object.Size ?? 0),
        updatedAt: object.LastModified?.toISOString() ?? null,
      }
    })
  )

  return letters.sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''))
}

export async function readStoredCoverLetter(id: string): Promise<StoredCoverLetterDocument> {
  const { bucket, client } = await getCoverLetterStorageClient()

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: getSavedLetterKey(id),
      })
    )

    const raw = await response.Body?.transformToString()
    if (!raw) {
      throw new CoverLetterStorageError('Saved cover letter body is missing', 500)
    }

    const parsed = JSON.parse(raw) as Partial<StoredCoverLetterDocument>
    return {
      id: normalizeId(String(parsed.id ?? id)),
      title: normalizeDocumentTitle(String(parsed.title ?? 'Untitled Draft')),
      html: String(parsed.html ?? ''),
      plainText: String(parsed.plainText ?? ''),
      jobPosting: String(parsed.jobPosting ?? ''),
      createdAt: String(parsed.createdAt ?? new Date().toISOString()),
      updatedAt: String(parsed.updatedAt ?? new Date().toISOString()),
    }
  } catch (error) {
    if (isS3NotFoundError(error)) {
      throw new CoverLetterStorageError('Saved cover letter not found', 404)
    }

    throw error
  }
}

export async function saveStoredCoverLetter(
  input: SaveStoredCoverLetterInput
): Promise<StoredCoverLetterDocument> {
  const id = input.id ? normalizeId(input.id) : crypto.randomUUID()
  const title = normalizeDocumentTitle(input.title)
  const html = input.html.trim()
  const plainText = input.plainText.trim()
  const jobPosting = input.jobPosting?.trim() ?? ''

  if (!html || !plainText) {
    throw new CoverLetterStorageError('Cover letter content is required', 400)
  }

  const existing = input.id
    ? await readStoredCoverLetter(id).catch((error) => {
        if (error instanceof CoverLetterStorageError && error.status === 404) {
          return null
        }

        throw error
      })
    : null

  const timestamp = new Date().toISOString()
  const document: StoredCoverLetterDocument = {
    id,
    title,
    html,
    plainText,
    jobPosting,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }

  const { bucket, client } = await getCoverLetterStorageClient()
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: getSavedLetterKey(id),
      Body: JSON.stringify(document, null, 2),
      ContentType: 'application/json',
      CacheControl: 'no-cache',
      Metadata: {
        title: encodeMetadataValue(title),
      },
    })
  )

  return document
}

export async function deleteStoredCoverLetter(id: string) {
  const { bucket, client } = await getCoverLetterStorageClient()

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: getSavedLetterKey(id),
      })
    )
  } catch (error) {
    if (isS3NotFoundError(error)) {
      throw new CoverLetterStorageError('Saved cover letter not found', 404)
    }

    throw error
  }
}