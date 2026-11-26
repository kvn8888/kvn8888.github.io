import { auth } from '@/auth'
import { getSecret } from '@/lib/secrets'
import { reportServerEvent } from '@/lib/axiom'
import { after, NextRequest, NextResponse } from 'next/server'
import { normalizePronunciationWav, NORMALIZATION_VERSION } from '@/lib/pronunciationAudio'
import { digest, extractAzureEvidence, type AzureAssessment } from '@/lib/pronunciationEvidence'
import { enrichAttemptInBackground } from '@/lib/pronunciationEnrichment'
import { persistMeasuredAttempt } from '@/lib/pronunciationDb'
import { isPronunciationReferenceVoice, PRONUNCIATION_REFERENCE_MODEL } from '@/lib/pronunciationVoices'

export const maxDuration = 150
const ROUTE = '/api/speech/pronunciation'
const PROVIDER = 'azure-speech'
const audioUrlPattern = /^\/api\/speech\/pronunciation\/reference\?id=[a-f0-9-]{36}$/i

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID()
  const email = (await auth())?.user?.email?.toLowerCase()
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const fail = (error: string, status: number) => NextResponse.json({ error, requestId, retryable: status >= 500 || status === 429 }, { status })
  const log = (event: string, level: 'info'|'warn'|'error', data: Record<string,unknown>) => reportServerEvent({
    event, level, message: event, data: { requestId, route: ROUTE, provider: PROVIDER, ...data },
  })
  try {
    const form = await req.formData()
    const audioFile = form.get('audio'), text = form.get('referenceText'), requestedLanguage = form.get('language')
    const language = typeof requestedLanguage === 'string' ? requestedLanguage : 'en-US'
    const source = form.get('source') === 'reference-voice' ? 'reference-voice' : 'recording'
    const referenceSource = form.get('referenceSource') === 'transcription' ? 'transcription' : 'manual'
    const voice = form.get('voice'), url = form.get('referenceUrl'), transcription = form.get('referenceTranscriptionModel')
    if (!(audioFile instanceof File) || audioFile.size > 1_000_000 || typeof text !== 'string' || !text.trim() || text.length > 5000 || !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8}){1,3}$/.test(language)) return fail('Valid PCM audio up to 30 seconds, a language, and reference text are required', 400)
    const referenceText = text.trim()
    const original = Buffer.from(await audioFile.arrayBuffer())
    let canonical
    try { canonical = normalizePronunciationWav(original) }
    catch (err) { return fail(err instanceof Error ? err.message : 'Invalid PCM audio', 422) }
    const audio = canonical.wav
    const audioMetadata = { sha256: digest(audio), originalSha256: digest(original), sampleRate: 16000, normalized: true, normalizationVersion: NORMALIZATION_VERSION, durationSeconds: canonical.durationSeconds }
    const context = { referenceText, language, source, referenceSource } as const
    const speechKey = await getSecret('AZURE_SPEECH_KEY'), region = await getSecret('AZURE_SPEECH_REGION')
    if (!speechKey || !region) return fail('Azure Speech is not configured', 503)
    const providerUrl = 'https://' + region + '.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=' + encodeURIComponent(language) + '&format=detailed'
    const requestProvider = async (fallback: boolean) => {
      const params = { ReferenceText: referenceText, GradingSystem: 'HundredMark', Granularity: 'Phoneme', Dimension: fallback ? 'Basic' : 'Comprehensive', Format: 'Detailed', PhonemeAlphabet: 'IPA', NBestPhonemeCount: 5, EnableMiscue: 'True', ...(!fallback ? { EnableProsodyAssessment: 'True' } : {}) }
      const started = Date.now()
      const response = await fetch(providerUrl, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': speechKey, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000', 'Pronunciation-Assessment': Buffer.from(JSON.stringify(params)).toString('base64'), Accept: 'application/json' }, body: new Uint8Array(audio), signal: AbortSignal.timeout(22_000) })
      if (!response.ok) { await log('speech.pronunciation.provider.failed','warn',{ status: response.status, fallback, audioSha256: audioMetadata.sha256, referenceTextSha256: digest(referenceText), latencyMs: Date.now()-started }); return { response, data: null } }
      return { response, data: await response.json() as AzureAssessment }
    }
    await log('speech.pronunciation.request.started','info',{ source, language, audioSha256: audioMetadata.sha256, referenceTextSha256: digest(referenceText), durationSeconds: canonical.durationSeconds, normalizationVersion: NORMALIZATION_VERSION })
    let { response, data } = await requestProvider(false)
    if (!data) return fail(response.status === 429 ? 'Azure Speech rate limit reached. Try again shortly.' : 'Pronunciation assessment failed', response.status)
    let evidence = extractAzureEvidence(data, context)
    let fallback = false
    if (!evidence && data.RecognitionStatus === 'Success') {
      const second = await requestProvider(true)
      if (second.data) {
        const candidate = extractAzureEvidence(second.data, context)
        if (candidate) { evidence = candidate; data = second.data; fallback = true }
      }
    }
    await log('speech.pronunciation.provider.response','info',{ source, language, audioSha256: audioMetadata.sha256, referenceTextSha256: digest(referenceText), recognitionStatus: data.RecognitionStatus, scores: evidence?.input.scores, fallback, wordCount: evidence?.input.words.length })
    if (!evidence) return NextResponse.json({ ...data, _requestId: requestId, _audio: audioMetadata })
    let stored
    let storageError = false
    try {
      stored = await persistMeasuredAttempt({ email, id: requestId, input: evidence.input, historyWords: evidence.historyWords, lexical: evidence.lexical, confidence: evidence.confidence, raw: data, audio, originalAudio: original, audioMetadata, fallback,
        voice: isPronunciationReferenceVoice(voice) ? voice : undefined, model: source === 'reference-voice' ? PRONUNCIATION_REFERENCE_MODEL : undefined,
        referenceUrl: typeof url === 'string' && audioUrlPattern.test(url) ? url : undefined,
        referenceTranscriptionModel: typeof transcription === 'string' ? transcription.slice(0,80) : undefined })
    } catch (error) {
      storageError = true
      await log('speech.pronunciation.persistence.failed','error',{ errorType: error instanceof Error ? error.name : 'Unknown', audioSha256: audioMetadata.sha256 })
    }
    if (stored && form.get('autoEnrich') === 'true') {
      after(async () => { try { await enrichAttemptInBackground(email,requestId) } catch { /* measured history is already persisted */ } })
    }
    return NextResponse.json({ ...data, _requestId: requestId, _audio: { ...audioMetadata, ...(stored?.audioStored ? { storageId: requestId } : {}) },
      ...(stored ? { _historyId: stored.id, _attemptId: stored.id, _referenceQuality: stored.quality, _providerProfile: stored.profile, _evidenceStored: stored.evidenceStored } : { _storageError: storageError }),
      ...(fallback ? { _diagnostics: { fallbackUsed: true, requestId } } : {}) })
  } catch (error) {
    await log('speech.pronunciation.route.failed','error',{ errorType: error instanceof Error ? error.name : 'Unknown' })
    return fail('Pronunciation assessment failed', 500)
  }
}
