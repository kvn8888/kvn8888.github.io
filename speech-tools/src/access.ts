import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

const used = new Map<string, number>();
const requests = new Map<string, { expires: number; count: number }>();
let active = 0;
let heavyActive = 0;
const WINDOW_MS = 60_000;

export function requireSpeechAccess(scope: 'analyze-delivery' | 'transcribe' | 'diarize'): RequestHandler {
  return (req, res, next) => {
    const secret = process.env.SPEECH_SERVICE_SECRET;
    if (!secret) { res.status(503).json({ error: 'Speech service not configured' }); return; }
    const token = req.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/)?.[1];
    if (!token || token.length > 1024) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const [payload, signature] = token.split('.');
    const expected = createHmac('sha256', secret).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) { res.status(401).json({ error: 'Unauthorized' }); return; }
    try {
      const p = JSON.parse(Buffer.from(payload, 'base64url').toString());
      const now = Date.now();
      if (p.scope !== scope || typeof p.exp !== 'number' || p.exp * 1000 <= now || p.exp * 1000 > now + 310_000 || !/^[a-f0-9]{64}$/.test(p.sub) || !/^[a-f0-9-]{36}$/.test(p.nonce)) throw new Error();
      for (const [nonce, expires] of used) if (expires <= now) used.delete(nonce);
      for (const [key, record] of requests) if (record.expires <= now) requests.delete(key);
      if (used.has(p.nonce)) { res.status(401).json({ error: 'Token already used' }); return; }
      const key = p.sub;
      const counter = requests.get(key) ?? { expires: now + WINDOW_MS, count: 0 };
      if (counter.count >= 12 || active >= 2 || (scope !== 'analyze-delivery' && heavyActive >= 1)) { res.setHeader('Retry-After', '15'); res.status(429).json({ error: 'Speech service busy; retry shortly' }); return; }
      used.set(p.nonce, p.exp * 1000);
      requests.set(key, { ...counter, count: counter.count + 1 });
      active++;
      if (scope !== "analyze-delivery") heavyActive++;
      let released = false;
      const release = () => { if (!released) { released = true; active--; if (scope !== "analyze-delivery") heavyActive--; } };
      res.locals.releaseSpeechAccess = release;
      res.once('finish', release);
      // A disconnected upload can release immediately; active compute releases in its handler.
      res.once('close', () => { if (!res.locals.speechProcessing) release(); });
      next();
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
    }
  };
}
