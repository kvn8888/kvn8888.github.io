#!/usr/bin/env node
/**
 * Tests the STT S3 presigned upload flow end-to-end using secrets from .env.local.
 * Run: node scripts/test-stt-s3.mjs
 *
 * Tests:
 *  1. Presigned PUT URL generation
 *  2. Browser-style PUT upload to S3
 *  3. Server-side GET download from S3
 *  4. Server-side DELETE cleanup
 */

import { readFileSync } from 'fs'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ── Load .env.local ──────────────────────────────────────────────────────────

const envPath = new URL('../.env.local', import.meta.url).pathname
const env = {}
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const key = trimmed.slice(0, eq).trim()
  const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
  env[key] = val
}

const bucket   = env.SPEECH_S3_BUCKET
const region   = env.AWS_REGION || 'us-east-1'
const keyId    = env.AWS_ACCESS_KEY_ID
const secret   = env.AWS_SECRET_ACCESS_KEY

if (!bucket || !keyId || !secret) {
  console.error('Missing one of: SPEECH_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY in .env.local')
  process.exit(1)
}

console.log(`Bucket : ${bucket}`)
console.log(`Region : ${region}`)
console.log(`Key ID : ${keyId}`)
console.log()

// ── S3 client (checksum-safe for presigning) ─────────────────────────────────

const client = new S3Client({
  region,
  credentials: { accessKeyId: keyId, secretAccessKey: secret },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

// ── Tiny synthetic WAV (44-byte header + silence) ────────────────────────────

function makeSilentWav(durationSec = 1, sampleRate = 16000) {
  const numSamples = Math.floor(sampleRate * durationSec)
  const pcm = Buffer.alloc(numSamples * 2, 0) // 16-bit silence
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)          // PCM
  header.writeUInt16LE(1, 22)          // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

const testKey = `speech/stt-upload/test-${Date.now()}.wav`
const testBody = makeSilentWav()
const contentType = 'audio/wav'

// ── Step 1: Generate presigned PUT URL ───────────────────────────────────────

console.log('1/4  Generating presigned PUT URL…')
const putCommand = new PutObjectCommand({ Bucket: bucket, Key: testKey, ContentType: contentType })
const presignedUrl = await getSignedUrl(client, putCommand, { expiresIn: 600 })
console.log(`     URL (first 120 chars): ${presignedUrl.slice(0, 120)}…`)

// Verify no CRC32 checksum baked in
if (presignedUrl.includes('checksum')) {
  console.warn('     ⚠  Presigned URL still contains checksum params — SDK fix may not be applied')
} else {
  console.log('     ✓  No checksum params in URL')
}
console.log()

// ── Step 2: PUT directly to S3 (simulating browser fetch) ───────────────────

console.log(`2/4  Uploading ${testBody.length} bytes via presigned PUT…`)
const putRes = await fetch(presignedUrl, {
  method: 'PUT',
  headers: { 'Content-Type': contentType },
  body: testBody,
})
if (!putRes.ok) {
  const body = await putRes.text()
  console.error(`     ✗  PUT failed: ${putRes.status} ${putRes.statusText}`)
  console.error(`     ${body}`)
  process.exit(1)
}
console.log(`     ✓  PUT ${putRes.status} — object stored at ${testKey}`)
console.log()

// ── Step 3: GET from S3 (simulating server-side STT route download) ──────────

console.log('3/4  Downloading from S3 (server-side credentials)…')
const getResponse = await client.send(new GetObjectCommand({ Bucket: bucket, Key: testKey }))
const bytes = await getResponse.Body?.transformToByteArray()
if (!bytes) throw new Error('Empty body from S3')
console.log(`     ✓  Downloaded ${bytes.length} bytes, Content-Type: ${getResponse.ContentType}`)
console.log()

// ── Step 4: DELETE cleanup ───────────────────────────────────────────────────

console.log('4/4  Deleting test object…')
await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }))
console.log(`     ✓  Deleted ${testKey}`)
console.log()

console.log('All steps passed ✓')
