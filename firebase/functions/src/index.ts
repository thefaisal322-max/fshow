/**
 * Faisal Show — Cloud Functions (phase 1: accounts)
 *
 *   sendCode       email a 5-digit code (signup or password reset)
 *   verifySignup   check the code and create the account
 *   resetPassword  check the code and set a new password
 *   claimUsername  pick a unique ID Name and finish the profile
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

import { canSend, checkCode, CodeDoc, codeDocId, CODE_TTL_MS, generateCode, hashCode, newSalt, Purpose, sha256 } from './codes';
import { sendCodeEmail } from './email';
import {
  ageFrom,
  cleanBio,
  cleanName,
  isFainetEmail,
  isGender,
  isStrongPassword,
  isValidBirthday,
  isValidCode,
  isValidEmail,
  isValidUsername,
  MIN_AGE,
  normalizeEmail,
  normalizeUsername,
} from './validation';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const db = getFirestore();
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

/**
 * Turn this on after setting up App Check in the Firebase console
 * (Play Integrity for Android). Then only the real app can call these functions.
 */
const ENFORCE_APP_CHECK = false;

const callOpts = { enforceAppCheck: ENFORCE_APP_CHECK, cors: false };

/** Every error the app understands carries a `reason` (see src/lib/api.ts errorMessage). */
function fail(reason: string, extra: Record<string, unknown> = {}, code: 'invalid-argument' | 'failed-precondition' | 'resource-exhausted' | 'already-exists' | 'unauthenticated' = 'failed-precondition'): never {
  throw new HttpsError(code, reason, { reason, ...extra });
}

// ───────────────────────── rate limit per IP ─────────────────────────

async function rateLimit(key: string, max: number, windowMs: number): Promise<void> {
  const ref = db.collection('rateLimits').doc(sha256(key));
  const now = Date.now();
  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() as { count: number; windowStart: number } | undefined;
    if (!d || now - d.windowStart > windowMs) {
      tx.set(ref, { count: 1, windowStart: now, expireAt: new Date(now + windowMs) });
      return true;
    }
    if (d.count >= max) return false;
    tx.update(ref, { count: FieldValue.increment(1) });
    return true;
  });
  if (!allowed) fail('rate-limited', {}, 'resource-exhausted');
}

function clientIp(req: CallableRequest): string {
  return req.rawRequest?.ip ?? 'unknown';
}

async function emailExists(email: string): Promise<boolean> {
  try {
    await getAuth().getUserByEmail(email);
    return true;
  } catch (e: any) {
    if (e?.code === 'auth/user-not-found') return false;
    throw e;
  }
}

// ───────────────────────── codes ─────────────────────────

/** Checks a code inside a transaction and burns it on success. */
async function consumeCode(purpose: Purpose, email: string, code: string): Promise<void> {
  const ref = db.collection('emailCodes').doc(codeDocId(purpose, email));
  const now = Date.now();
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as CodeDoc | undefined;
    const r = checkCode(data, code, now);
    if (r.ok) tx.delete(ref);
    else if (r.reason === 'invalid-code' || r.reason === 'too-many-attempts') {
      if (snap.exists) tx.update(ref, { attempts: FieldValue.increment(1) });
    }
    return r;
  });
  if (!result.ok) fail(result.reason, 'remaining' in result ? { remaining: result.remaining } : {});
}

export const sendCode = onCall({ ...callOpts, secrets: [RESEND_API_KEY] }, async (req) => {
  const email = normalizeEmail(req.data?.email);
  const purpose = req.data?.purpose as Purpose;
  if (!isValidEmail(email)) fail('invalid-input', { message: 'ایمیل سم نه دی' }, 'invalid-argument');
  if (purpose !== 'signup' && purpose !== 'reset') fail('invalid-input', {}, 'invalid-argument');

  await rateLimit(`send:${clientIp(req)}`, 20, 60 * 60 * 1000);

  const exists = await emailExists(email);
  if (purpose === 'signup' && exists) fail('email-in-use', {}, 'already-exists');
  // For reset we answer "ok" either way, so nobody can test which emails are registered.
  if (purpose === 'reset' && !exists) return { ok: true };

  const ref = db.collection('emailCodes').doc(codeDocId(purpose, email));
  const code = generateCode();
  const salt = newSalt();
  const now = Date.now();

  const decision = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = canSend(snap.data() as CodeDoc | undefined, now);
    if (d.ok) {
      const doc: CodeDoc & { expireAt: Date } = {
        hash: hashCode(code, salt),
        salt,
        expiresAt: now + CODE_TTL_MS,
        attempts: 0,
        lastSentAt: now,
        sendCount: d.sendCount,
        windowStart: d.windowStart,
        expireAt: new Date(now + 2 * 60 * 60 * 1000), // for Firestore TTL cleanup
      };
      tx.set(ref, doc);
    }
    return d;
  });
  if (!decision.ok) {
    if (decision.reason === 'resend-wait') fail('resend-wait', { wait: decision.wait }, 'resource-exhausted');
    fail('rate-limited', {}, 'resource-exhausted');
  }

  try {
    await sendCodeEmail(RESEND_API_KEY.value(), email, code, purpose);
  } catch (e) {
    logger.error('Resend failed', e);
    // Let the user try again right away instead of waiting 60 s for an email that never came.
    await ref.update({ lastSentAt: 0 });
    fail('email-send-failed', {}, 'failed-precondition');
  }
  return { ok: true };
});

// ───────────────────────── signup ─────────────────────────

export const verifySignup = onCall(callOpts, async (req) => {
  const d = req.data ?? {};
  const email = normalizeEmail(d.email);
  const firstName = cleanName(d.firstName);
  const lastName = cleanName(d.lastName);

  // Validate everything BEFORE touching the code, so a typo does not burn it.
  if (!isValidEmail(email)) fail('invalid-input', { message: 'ایمیل سم نه دی' }, 'invalid-argument');
  if (!isValidCode(d.code)) fail('invalid-code', { remaining: 0 }, 'invalid-argument');
  if (!isStrongPassword(d.password)) fail('weak-password', {}, 'invalid-argument');
  if (!firstName || !lastName) fail('invalid-input', { message: 'نوم یا تخلص سم نه دی' }, 'invalid-argument');
  if (!isGender(d.gender)) fail('invalid-input', { message: 'جنسیت وټاکئ' }, 'invalid-argument');
  if (!isValidBirthday(d.birthday)) fail('invalid-input', { message: 'د زېږېدو نېټه سمه نه ده' }, 'invalid-argument');
  const age = ageFrom(d.birthday);
  if (age < MIN_AGE) fail('too-young', {}, 'failed-precondition');
  if (age > 120) fail('invalid-input', { message: 'د زېږېدو نېټه سمه نه ده' }, 'invalid-argument');

  await rateLimit(`verify:${clientIp(req)}`, 30, 60 * 60 * 1000);
  await consumeCode('signup', email, d.code);

  const displayName = `${firstName} ${lastName}`;
  let uid: string;
  try {
    const user = await getAuth().createUser({ email, password: d.password, emailVerified: true, displayName });
    uid = user.uid;
  } catch (e: any) {
    if (e?.code === 'auth/email-already-exists') fail('email-in-use', {}, 'already-exists');
    logger.error('createUser failed', e);
    throw new HttpsError('internal', 'internal');
  }

  const batch = db.batch();
  batch.set(db.collection('users').doc(uid), {
    firstName,
    lastName,
    displayName,
    gender: d.gender,
    username: null,
    bio: '',
    photoURL: null,
    isFainet: isFainetEmail(email),
    profileComplete: false,
    followersCount: 0,
    followingCount: 0,
    likesCount: 0,
    postsCount: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection('users_private').doc(uid), {
    email,
    birthday: d.birthday,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  logger.info('account created', { uid, fainet: isFainetEmail(email) });
  return { ok: true };
});

// ───────────────────────── password reset ─────────────────────────

export const resetPassword = onCall(callOpts, async (req) => {
  const email = normalizeEmail(req.data?.email);
  const code = req.data?.code;
  const newPassword = req.data?.newPassword;
  if (!isValidEmail(email)) fail('invalid-input', { message: 'ایمیل سم نه دی' }, 'invalid-argument');
  if (!isValidCode(code)) fail('invalid-code', { remaining: 0 }, 'invalid-argument');
  if (!isStrongPassword(newPassword)) fail('weak-password', {}, 'invalid-argument');

  await rateLimit(`verify:${clientIp(req)}`, 30, 60 * 60 * 1000);
  await consumeCode('reset', email, code);

  const user = await getAuth().getUserByEmail(email);
  await getAuth().updateUser(user.uid, { password: newPassword });
  // Log out every other device that was using the old password.
  await getAuth().revokeRefreshTokens(user.uid);
  return { ok: true };
});

// ───────────────────────── ID Name ─────────────────────────

export const claimUsername = onCall(callOpts, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) fail('unauthenticated', {}, 'unauthenticated');
  const username = normalizeUsername(req.data?.username);
  const bio = cleanBio(req.data?.bio);
  if (!isValidUsername(username)) fail('username-invalid', {}, 'invalid-argument');
  if (bio === null) fail('invalid-input', { message: 'بایو تر ۱۵۰ تورو کم وي' }, 'invalid-argument');

  const userRef = db.collection('users').doc(uid);
  const nameRef = db.collection('usernames').doc(username);

  const taken = await db.runTransaction(async (tx) => {
    const [userSnap, nameSnap] = await Promise.all([tx.get(userRef), tx.get(nameRef)]);
    if (!userSnap.exists) throw new HttpsError('failed-precondition', 'no-profile');
    if (nameSnap.exists && nameSnap.get('uid') !== uid) return true;

    const old = userSnap.get('username') as string | null;
    if (old && old !== username) tx.delete(db.collection('usernames').doc(old));
    tx.set(nameRef, { uid, createdAt: FieldValue.serverTimestamp() });
    tx.update(userRef, { username, bio, profileComplete: true });
    return false;
  });
  if (taken) fail('username-taken', {}, 'already-exists');
  return { ok: true };
});
