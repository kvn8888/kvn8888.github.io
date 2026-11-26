import type { Client, InStatement } from '@libsql/client'
import { getTursoClient } from '@/lib/turso'
import { digest, exerciseHash, referenceQuality, assessmentProfile } from '@/lib/pronunciationEvidence'
import { NORMALIZATION_VERSION } from '@/lib/pronunciationAudio'
import type { StoredDelivery } from '@/lib/pronunciationDelivery'
import type { PronunciationCoachInput, PronunciationCoach } from '@/lib/pronunciationCoach'
import { uploadToS3, downloadFromS3 } from '@/lib/speechStorage'

const initialized = new WeakMap<Client, Promise<void>>()
export async function ensureSpeechTables(client: Client): Promise<void> {
  let ready = initialized.get(client)
  if (!ready) {
    ready = client.batch([
      `CREATE TABLE IF NOT EXISTS speech_history (id TEXT PRIMARY KEY, user_email TEXT NOT NULL, modality TEXT NOT NULL, title TEXT NOT NULL, content TEXT, metadata_json TEXT, created_at INTEGER NOT NULL)`,
      'CREATE INDEX IF NOT EXISTS idx_speech_history_user_created ON speech_history (user_email, created_at DESC, id DESC)',
      'CREATE INDEX IF NOT EXISTS idx_speech_history_user_modality_created ON speech_history (user_email, modality, created_at DESC, id DESC)',
      `CREATE TABLE IF NOT EXISTS pronunciation_attempt (
        id TEXT PRIMARY KEY, user_email TEXT NOT NULL, exercise_id TEXT NOT NULL, language TEXT NOT NULL,
        source TEXT NOT NULL, voice TEXT, model TEXT, reference_url TEXT, created_at INTEGER NOT NULL,
        audio_sha TEXT NOT NULL, reference_sha TEXT NOT NULL, normalization_version TEXT NOT NULL, provider_profile TEXT NOT NULL,
        raw_key TEXT, raw_sha TEXT, audio_key TEXT, original_key TEXT, input_json TEXT NOT NULL, delivery_json TEXT, coach_json TEXT, coach_cache_key TEXT, delivery_lease_until INTEGER, coach_lease_until INTEGER,
        reference_accepted INTEGER NOT NULL DEFAULT 0, reference_reason TEXT
      )`,
      'CREATE INDEX IF NOT EXISTS idx_pron_attempt_exercise ON pronunciation_attempt (user_email, exercise_id, source, created_at DESC)',
      `CREATE TABLE IF NOT EXISTS pronunciation_phoneme (
        attempt_id TEXT NOT NULL, word_index INTEGER NOT NULL, phone_index INTEGER NOT NULL, word TEXT NOT NULL,
        phoneme TEXT NOT NULL, score REAL NOT NULL, duration_ms REAL, offset_ms REAL, alt1 TEXT, PRIMARY KEY (attempt_id, word_index, phone_index)
      )`,
      'CREATE INDEX IF NOT EXISTS idx_pron_phone_attempt ON pronunciation_phoneme (attempt_id, phoneme)',
      `CREATE TABLE IF NOT EXISTS pronunciation_coach_cache (user_email TEXT NOT NULL, cache_key TEXT NOT NULL, coach_json TEXT NOT NULL, PRIMARY KEY(user_email, cache_key))`,
    ], 'write').then(() => {}).catch(error => { initialized.delete(client); throw error })
    initialized.set(client, ready)
  }
  await ready
}
export async function pronunciationDb() {
  const client = getTursoClient()
  if (!client) throw new Error('Pronunciation database unavailable')
  await ensureSpeechTables(client)
  return client
}
export function attemptKey(email: string, id: string, file: string) {
  return 'speech/pronunciation/attempts/' + digest(email.toLowerCase()) + '/' + id + '/' + file
}
export type StoredAudio = { sha256: string; originalSha256: string; sampleRate: number; normalized: boolean; normalizationVersion: string; durationSeconds: number; storageId?: string }

export async function persistMeasuredAttempt(args: {
  email: string; id: string; input: PronunciationCoachInput; historyWords: unknown[]; lexical?: string; confidence?: number;
  raw: unknown; audio: Buffer; originalAudio: Buffer; audioMetadata: StoredAudio; fallback: boolean;
  voice?: string; model?: string; referenceUrl?: string; referenceTranscriptionModel?: string
}) {
  const { email, id, input, historyWords, audioMetadata } = args
  const client = await pronunciationDb()
  const rawKey = attemptKey(email, id, 'azure.json'), audioKey = attemptKey(email, id, 'normalized.wav')
  const originalKey = attemptKey(email,id,'source.wav')
  const rawBuffer=Buffer.from(JSON.stringify(args.raw))
  const rawSha=digest(rawBuffer)
  const [rawStored, audioStored, originalStored] = await Promise.all([
    uploadToS3(rawBuffer, rawKey, 'application/json'),
    uploadToS3(args.audio, audioKey, 'audio/wav'),
    uploadToS3(args.originalAudio,originalKey,'audio/wav'),
  ])
  const createdAt = Date.now()
  const quality = input.source === 'reference-voice' ? referenceQuality(input) : { accepted: false, reason: undefined }
  const profile = assessmentProfile(args.fallback)
  const exerciseId = exerciseHash(input.referenceText, input.language)
  const metadata = {
    schemaVersion: 4, requestId: id, attemptId: id, exerciseId, language: input.language, source: input.source,
    referenceSource: input.referenceSource, referenceTranscriptionModel: args.referenceTranscriptionModel, referenceText: input.referenceText,
    displayText: input.recognizedText, recognitionStatus: input.recognitionStatus, lexical: args.lexical, confidence: args.confidence, snr: input.snr,
    scores: input.scores, words: historyWords, audio: { ...audioMetadata, storageId: audioStored ? id : undefined },
    providerProfile: profile, evidenceDigest:rawSha, ...(input.source === 'reference-voice' ? { voice: args.voice, referenceModel: args.model, referenceProvider: 'vercel-ai-gateway', storageUrl: args.referenceUrl, referenceQuality: quality } : {}),
    ...(audioStored ? { assessmentAudioUrl: '/api/speech/pronunciation/audio?id=' + id } : {}),
    ...(originalStored ? { assessmentSourceUrl: '/api/speech/pronunciation/audio?id=' + id + '&variant=source' } : {}),
  }
  const statements: InStatement[] = [
    { sql: 'INSERT INTO pronunciation_attempt (id,user_email,exercise_id,language,source,voice,model,reference_url,created_at,audio_sha,reference_sha,normalization_version,provider_profile,raw_key,raw_sha,audio_key,original_key,input_json,reference_accepted,reference_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', args: [id,email,exerciseId,input.language,input.source,args.voice ?? null,args.model ?? null,args.referenceUrl ?? null,createdAt,audioMetadata.sha256,digest(input.referenceText),NORMALIZATION_VERSION,profile,rawStored ? rawKey : null,rawSha,audioStored ? audioKey : null,originalStored ? originalKey : null,JSON.stringify(input),quality.accepted ? 1 : 0,quality.reason ?? null] },
    { sql: 'INSERT INTO speech_history (id,user_email,modality,title,content,metadata_json,created_at) VALUES (?,?,?,?,?,?,?)', args: [id,email,'pronunciation','Pronunciation · '+input.language,input.referenceText,JSON.stringify(metadata),createdAt] },
  ]
  const phones: (string|number|null)[][] = []
  for (const [wi,w] of input.words.entries()) {
    if (w.errorType === 'Omission' || w.errorType === 'Insertion') continue
    for (const [pi,p] of w.phonemes.entries()) {
      if (!p.phoneme) continue
      phones.push([id,wi,pi,w.word,p.phoneme,p.accuracyScore,p.duration == null ? null : p.duration/10000,p.offset == null ? null : p.offset/10000,p.nBestPhonemes[0]?.phoneme ?? null])
    }
  }
  for (let i=0; i<phones.length; i+=50) {
    const group = phones.slice(i,i+50)
    statements.push({ sql: 'INSERT INTO pronunciation_phoneme (attempt_id,word_index,phone_index,word,phoneme,score,duration_ms,offset_ms,alt1) VALUES '+group.map(()=>'(?,?,?,?,?,?,?,?,?)').join(','), args: group.flat() })
  }
  await client.batch(statements, 'write')
  return { id, exerciseId, quality, audioStored: Boolean(audioStored), evidenceStored: Boolean(rawStored), profile }
}

export interface StoredAttempt {
  id: string; email: string; exerciseId: string; language: string; source: 'recording' | 'reference-voice'; voice: string | null; model: string | null; referenceUrl: string | null; createdAt: number
  audioSha: string; referenceSha: string; normalizationVersion: string; providerProfile: string; rawKey: string | null; audioKey: string | null; originalKey: string | null
  input: PronunciationCoachInput; delivery: StoredDelivery | null; coach: PronunciationCoach | null; coachCacheKey: string | null; accepted: boolean; reason?: string
}
export function mapAttempt(row: Record<string, unknown>): StoredAttempt {
  return { id: String(row.id), email: String(row.user_email), exerciseId: String(row.exercise_id), language: String(row.language), source: row.source as StoredAttempt['source'],
    voice: row.voice == null ? null : String(row.voice), model: row.model == null ? null : String(row.model), referenceUrl: row.reference_url == null ? null : String(row.reference_url), createdAt: Number(row.created_at),
    audioSha: String(row.audio_sha), referenceSha: String(row.reference_sha), normalizationVersion: String(row.normalization_version), providerProfile: String(row.provider_profile),
    rawKey: row.raw_key == null ? null : String(row.raw_key), audioKey: row.audio_key == null ? null : String(row.audio_key), originalKey: row.original_key == null ? null : String(row.original_key), input: JSON.parse(String(row.input_json)),
    delivery: row.delivery_json ? JSON.parse(String(row.delivery_json)) : null, coach: row.coach_json ? JSON.parse(String(row.coach_json)) : null,
    coachCacheKey: row.coach_cache_key == null ? null : String(row.coach_cache_key), accepted: Number(row.reference_accepted) === 1, reason: row.reference_reason == null ? undefined : String(row.reference_reason),
  }
}
export async function getAttempt(email: string, id: string) {
  const client = await pronunciationDb()
  const result = await client.execute({ sql: 'SELECT a.* FROM pronunciation_attempt a JOIN speech_history h ON h.id=a.id AND h.user_email=a.user_email WHERE a.id=? AND a.user_email=?', args: [id,email] })
  return result.rows[0] ? mapAttempt(result.rows[0]) : null
}
export async function getAttemptAudio(attempt: StoredAttempt, source=false) {
  const key=source?attempt.originalKey:attempt.audioKey
  if (!key) throw new Error('Assessment audio not stored')
  return downloadFromS3(key)
}
export async function updateAttemptAnalysis(email: string, id: string, patch: { delivery?: unknown; deliveryError?: string | null; coach?: PronunciationCoach; coachError?: string | null; coachCacheKey?: string }) {
  const client = await pronunciationDb()
  const statements: InStatement[] = []
  const metadata: Record<string, unknown> = {}
  if (patch.delivery !== undefined) {
    statements.push({ sql: 'UPDATE pronunciation_attempt SET delivery_json=? WHERE id=? AND user_email=?', args: [JSON.stringify(patch.delivery),id,email] })
    metadata.delivery = patch.delivery
  }
  if (patch.coach !== undefined) {
    statements.push({ sql: 'UPDATE pronunciation_attempt SET coach_json=?, coach_cache_key=? WHERE id=? AND user_email=?', args: [JSON.stringify(patch.coach),patch.coachCacheKey??null,id,email] })
    metadata.coach = patch.coach
    if (patch.coachCacheKey) statements.push({ sql: 'INSERT INTO pronunciation_coach_cache (user_email,cache_key,coach_json) VALUES (?,?,?) ON CONFLICT(user_email,cache_key) DO UPDATE SET coach_json=excluded.coach_json', args: [email,patch.coachCacheKey,JSON.stringify(patch.coach)] })
  }
  if (patch.deliveryError !== undefined) metadata.deliveryError = patch.deliveryError
  if (patch.coachError !== undefined) metadata.coachError = patch.coachError
  statements.push({ sql: "UPDATE speech_history SET metadata_json=json_patch(COALESCE(metadata_json,'{}'),?) WHERE id=? AND user_email=? AND modality='pronunciation'", args: [JSON.stringify(metadata),id,email] })
  await client.batch(statements, 'write')
}
export async function readCoachCache(email: string, cacheKey: string) {
  const client = await pronunciationDb()
  const result = await client.execute({ sql: 'SELECT coach_json FROM pronunciation_coach_cache WHERE user_email=? AND cache_key=?', args: [email,cacheKey] })
  return result.rows[0] ? JSON.parse(String(result.rows[0].coach_json)) as PronunciationCoach : null
}

// Lease per phase: background and foreground tasks share the same worker, avoiding duplicate provider calls.
export async function claimAttemptWork(email:string,id:string,phase:'delivery'|'coach') {
  const client=await pronunciationDb()
  const column=phase==='delivery'?'delivery_lease_until':'coach_lease_until'
  const now=Date.now()
  const lease=now+90_000
  const result=await client.execute({sql:'UPDATE pronunciation_attempt SET '+column+'=? WHERE id=? AND user_email=? AND ('+column+' IS NULL OR '+column+'<?)',args:[lease,id,email,now]})
  return result.rowsAffected ? lease : null
}
export async function releaseAttemptWork(email:string,id:string,phase:'delivery'|'coach',lease:number) {
  const client=await pronunciationDb()
  const column=phase==='delivery'?'delivery_lease_until':'coach_lease_until'
  await client.execute({sql:'UPDATE pronunciation_attempt SET '+column+'=NULL WHERE id=? AND user_email=? AND '+column+'=?',args:[id,email,lease]})
}
