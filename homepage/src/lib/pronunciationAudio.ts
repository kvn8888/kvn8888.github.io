import { Buffer } from 'node:buffer'

export const NORMALIZATION_VERSION = 'pcm16k-rms23-pad200-v1'
export const MAX_PRONUNCIATION_SECONDS = 30
const RATE = 16000
const PAD = RATE / 5

/** Strict PCM reader; don't let ambiguous containers into the scoring path. */
export function readMonoPcmWav(buffer: Buffer) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Expected 16 kHz mono PCM WAV')
  let format = false
  let samples: Buffer | undefined
  for (let at = 12; at + 8 <= buffer.length;) {
    const id = buffer.toString('ascii', at, at + 4)
    const len = buffer.readUInt32LE(at + 4)
    const start = at + 8
    if (start + len > buffer.length) throw new Error('Truncated WAV')
    if (id === 'fmt ' && len >= 16) {
      format = buffer.readUInt16LE(start) === 1 && buffer.readUInt16LE(start + 2) === 1 && buffer.readUInt32LE(start + 4) === RATE && buffer.readUInt32LE(start + 8) === RATE * 2 && buffer.readUInt16LE(start + 12) === 2 && buffer.readUInt16LE(start + 14) === 16
    }
    if (id === 'data') samples = buffer.subarray(start, start + len)
    at = start + len + (len % 2)
  }
  if (!format || !samples?.length || samples.length % 2) throw new Error('Expected 16 kHz mono PCM WAV')
  if (samples.length > MAX_PRONUNCIATION_SECONDS * RATE * 2) throw new Error('Recording must be under 30 seconds')
  return samples
}

function encode(samples: Int16Array) {
  const wav = Buffer.alloc(44 + samples.length * 2)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 2, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i++) wav.writeInt16LE(samples[i], 44 + i * 2)
  return wav
}

/** Keep a safety margin around low-energy consonants. Normalize active RMS, not LUFS. */
export function normalizePronunciationWav(input: Buffer) {
  const pcm = readMonoPcmWav(input)
  const samples = Int16Array.from({ length: pcm.length / 2 }, (_, i) => pcm.readInt16LE(i * 2))
  const frame = 160 // 10ms
  const rms: number[] = []
  for (let i = 0; i < samples.length; i += frame) {
    let sum = 0
    for (let j = i; j < Math.min(i + frame, samples.length); j++) sum += (samples[j] / 32768) ** 2
    rms.push(Math.sqrt(sum / Math.min(frame, samples.length - i)))
  }
  const peakFrame = Math.max(...rms)
  if (peakFrame < 0.001) throw new Error('No audible speech detected')
  const threshold = Math.max(0.001, peakFrame * 0.012)
  const first = rms.findIndex(x => x >= threshold)
  let last = rms.length - 1
  while (last >= 0 && rms[last] < threshold) last--
  const start = Math.max(0, first * frame - 640)
  const end = Math.min(samples.length, (last + 1) * frame + 640)
  const signal = samples.subarray(start, end)
  const active = rms.filter(x => x >= Math.max(threshold, peakFrame / 10))
  const activeRms = Math.sqrt(active.reduce((sum, x) => sum + x*x, 0) / active.length)
  let peak = 0
  for (const value of signal) peak = Math.max(peak, Math.abs(value))
  const gain = Math.min(10 ** (-23/20) / activeRms, 0.95 * 32767 / peak, 4)
  if (signal.length + 2 * PAD > MAX_PRONUNCIATION_SECONDS * RATE) throw new Error('Shorten recording to allow boundary padding (max 30 seconds)')
  const padded = new Int16Array(signal.length + 2 * PAD)
  for (let i = 0; i < signal.length; i++) padded[PAD + i] = Math.round(signal[i] * gain)
  return { wav: encode(padded), durationSeconds: padded.length / RATE, gain, normalizationVersion: NORMALIZATION_VERSION }
}
