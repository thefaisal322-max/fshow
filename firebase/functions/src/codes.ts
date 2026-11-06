import * as crypto from 'crypto';

import { CODE_LENGTH } from './validation';

export const CODE_TTL_MS = 10 * 60 * 1000; // a code is valid for 10 minutes
export const RESEND_WAIT_MS = 60 * 1000; // one email per minute per address
export const MAX_ATTEMPTS = 5; // wrong guesses before the code dies
export const MAX_SENDS_PER_HOUR = 5; // emails per address per hour

export type Purpose = 'signup' | 'reset';

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** Firestore doc id for a code — hashed so emails are not visible as ids. */
export function codeDocId(purpose: Purpose, email: string): string {
  return sha256(`${purpose}:${email}`);
}

/** Cryptographically random 5-digit code, e.g. "04821". */
export function generateCode(): string {
  return crypto.randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, '0');
}

export function newSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/** Codes are never stored in plain text. */
export function hashCode(code: string, salt: string): string {
  return crypto.createHmac('sha256', salt).update(code).digest('hex');
}

/** Constant-time comparison so timing cannot leak the code. */
export function codeMatches(code: string, salt: string, expectedHash: string): boolean {
  const a = Buffer.from(hashCode(code, salt), 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type CodeDoc = {
  hash: string;
  salt: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  sendCount: number;
  windowStart: number;
};

export type CheckResult =
  | { ok: true }
  | { ok: false; reason: 'code-expired' | 'too-many-attempts' }
  | { ok: false; reason: 'invalid-code'; remaining: number };

/** Pure decision logic for a code guess (easy to unit-test). */
export function checkCode(docData: CodeDoc | undefined, code: string, now: number): CheckResult {
  if (!docData || docData.expiresAt < now) return { ok: false, reason: 'code-expired' };
  if (docData.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too-many-attempts' };
  if (codeMatches(code, docData.salt, docData.hash)) return { ok: true };
  const remaining = MAX_ATTEMPTS - (docData.attempts + 1);
  if (remaining <= 0) return { ok: false, reason: 'too-many-attempts' };
  return { ok: false, reason: 'invalid-code', remaining };
}

export type SendDecision =
  | { ok: true; sendCount: number; windowStart: number }
  | { ok: false; reason: 'resend-wait'; wait: number }
  | { ok: false; reason: 'rate-limited' };

/** Pure decision logic for "may we email a new code now?". */
export function canSend(docData: CodeDoc | undefined, now: number): SendDecision {
  if (docData && now - docData.lastSentAt < RESEND_WAIT_MS) {
    return { ok: false, reason: 'resend-wait', wait: Math.ceil((RESEND_WAIT_MS - (now - docData.lastSentAt)) / 1000) };
  }
  const inWindow = docData && now - docData.windowStart < 60 * 60 * 1000;
  if (inWindow && docData!.sendCount >= MAX_SENDS_PER_HOUR) return { ok: false, reason: 'rate-limited' };
  return inWindow
    ? { ok: true, sendCount: docData!.sendCount + 1, windowStart: docData!.windowStart }
    : { ok: true, sendCount: 1, windowStart: now };
}
