import type { FastifyInstance, FastifyRequest } from 'fastify';

import { canSend, checkCode, CodeDoc, codeDocId, CODE_TTL_MS, generateCode, hashCode, newSalt, Purpose } from '../codes';
import type { Config } from '../config';
import { Db, tx } from '../db';
import { sendCodeEmail } from '../email';
import { ApiError, fail } from '../errors';
import { fakeVerify, hashPassword, verifyPassword } from '../passwords';
import { HOUR, MINUTE, rateLimit } from '../ratelimit';
import { createSession, requireAuth } from '../sessions';
import { meUser, UserRow } from '../users';
import {
  ageFrom,
  cleanName,
  isFainetEmail,
  isGender,
  isStrongPassword,
  isValidBirthday,
  isValidCode,
  isValidEmail,
  MIN_AGE,
  normalizeEmail,
} from '../validation';

type Body = Record<string, unknown>;

function rowToCodeDoc(r: any): CodeDoc | undefined {
  if (!r) return undefined;
  return {
    hash: r.hash,
    salt: r.salt,
    expiresAt: r.expires_at,
    attempts: r.attempts,
    lastSentAt: r.last_sent_at,
    sendCount: r.send_count,
    windowStart: r.window_start,
  };
}

export async function authRoutes(app: FastifyInstance, { db, cfg }: { db: Db; cfg: Config }) {
  const emailExists = async (email: string) =>
    (await db.query('SELECT 1 FROM users WHERE email = $1', [email])).rowCount! > 0;

  /** Checks a code and deletes it on success. Wrong guesses are counted. */
  async function consumeCode(purpose: Purpose, email: string, code: string): Promise<void> {
    const id = codeDocId(purpose, email);
    const result = await tx(db, async (c) => {
      const { rows } = await c.query('SELECT * FROM email_codes WHERE id = $1 FOR UPDATE', [id]);
      const r = checkCode(rowToCodeDoc(rows[0]), code, Date.now());
      if (r.ok) await c.query('DELETE FROM email_codes WHERE id = $1', [id]);
      else if (rows[0]) await c.query('UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1', [id]);
      return r;
    });
    if (!result.ok) fail(400, result.reason, 'remaining' in result ? { remaining: result.remaining } : {});
  }

  const authReply = async (userId: string, req: FastifyRequest) => {
    const token = await createSession(db, userId, req);
    const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
    return { token, user: meUser(rows[0], cfg.publicUrl) };
  };

  // ── POST /v1/auth/send-code ───────────────────────────────
  app.post('/auth/send-code', async (req) => {
    const b = (req.body ?? {}) as Body;
    const email = normalizeEmail(b.email);
    const purpose = b.purpose as Purpose;
    if (!isValidEmail(email)) fail(400, 'invalid-input', { message: 'ایمیل سم نه دی' });
    if (purpose !== 'signup' && purpose !== 'reset') fail(400, 'invalid-input');

    await rateLimit(db, `send:ip:${req.ip}`, 20, HOUR);

    const exists = await emailExists(email);
    if (purpose === 'signup' && exists) fail(409, 'email-in-use');
    // For reset we answer "ok" either way, so nobody can test which emails are registered.
    if (purpose === 'reset' && !exists) return { ok: true };

    const id = codeDocId(purpose, email);
    const code = generateCode();
    const salt = newSalt();
    const now = Date.now();

    const decision = await tx(db, async (c) => {
      const { rows } = await c.query('SELECT * FROM email_codes WHERE id = $1 FOR UPDATE', [id]);
      const d = canSend(rowToCodeDoc(rows[0]), now);
      if (d.ok) {
        await c.query(
          `INSERT INTO email_codes (id, hash, salt, expires_at, attempts, last_sent_at, send_count, window_start)
           VALUES ($1, $2, $3, $4, 0, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET hash = $2, salt = $3, expires_at = $4, attempts = 0,
             last_sent_at = $5, send_count = $6, window_start = $7`,
          [id, hashCode(code, salt), salt, now + CODE_TTL_MS, now, d.sendCount, d.windowStart],
        );
      }
      return d;
    });
    if (!decision.ok) {
      if (decision.reason === 'resend-wait') fail(429, 'resend-wait', { wait: decision.wait });
      fail(429, 'rate-limited');
    }

    try {
      await sendCodeEmail(cfg, email, code, purpose);
    } catch (e) {
      req.log.error(e, 'email send failed');
      // Let the user retry right away instead of waiting 60 s for an email that never came.
      await db.query('UPDATE email_codes SET last_sent_at = 0 WHERE id = $1', [id]);
      fail(502, 'email-send-failed');
    }
    return { ok: true };
  });

  // ── POST /v1/auth/signup ──────────────────────────────────
  app.post('/auth/signup', async (req, reply) => {
    const b = (req.body ?? {}) as Body;
    const email = normalizeEmail(b.email);
    const firstName = cleanName(b.firstName);
    const lastName = cleanName(b.lastName);

    // Validate everything BEFORE touching the code, so a typo does not burn it.
    if (!isValidEmail(email)) fail(400, 'invalid-input', { message: 'ایمیل سم نه دی' });
    if (!isValidCode(b.code)) fail(400, 'invalid-code', { remaining: 0 });
    if (!isStrongPassword(b.password)) fail(400, 'weak-password');
    if (!firstName || !lastName) fail(400, 'invalid-input', { message: 'نوم یا تخلص سم نه دی' });
    if (!isGender(b.gender)) fail(400, 'invalid-input', { message: 'جنسیت وټاکئ' });
    if (!isValidBirthday(b.birthday)) fail(400, 'invalid-input', { message: 'د زېږېدو نېټه سمه نه ده' });
    const birthday = b.birthday as string;
    const age = ageFrom(birthday);
    if (age < MIN_AGE) fail(400, 'too-young');
    if (age > 120) fail(400, 'invalid-input', { message: 'د زېږېدو نېټه سمه نه ده' });

    await rateLimit(db, `verify:ip:${req.ip}`, 30, HOUR);
    await consumeCode('signup', email, b.code as string);

    const passwordHash = await hashPassword(b.password as string);
    let userId: string;
    try {
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, gender, birthday, is_fainet)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [email, passwordHash, firstName, lastName, b.gender, birthday, isFainetEmail(email)],
      );
      userId = rows[0].id;
    } catch (e: any) {
      if (e?.code === '23505') fail(409, 'email-in-use'); // unique violation
      throw e;
    }
    req.log.info({ userId, fainet: isFainetEmail(email) }, 'account created');
    reply.status(201);
    return authReply(userId, req);
  });

  // ── POST /v1/auth/login ───────────────────────────────────
  app.post('/auth/login', async (req) => {
    const b = (req.body ?? {}) as Body;
    const email = normalizeEmail(b.email);
    const password = typeof b.password === 'string' ? b.password : '';
    if (!isValidEmail(email) || !password || password.length > 128) fail(400, 'invalid-credentials');

    // Two limits: per IP (one attacker, many accounts) and per email (many IPs, one account).
    await rateLimit(db, `login:ip:${req.ip}`, 30, 15 * MINUTE);
    await rateLimit(db, `login:email:${email}`, 10, 15 * MINUTE);

    const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    const ok = user ? await verifyPassword(password, user.password_hash) : await fakeVerify(password);
    if (!ok || !user) fail(401, 'invalid-credentials');
    if (user.status !== 'active') fail(403, 'account-disabled');
    return authReply(user.id, req);
  });

  // ── POST /v1/auth/reset ───────────────────────────────────
  app.post('/auth/reset', async (req) => {
    const b = (req.body ?? {}) as Body;
    const email = normalizeEmail(b.email);
    if (!isValidEmail(email)) fail(400, 'invalid-input', { message: 'ایمیل سم نه دی' });
    if (!isValidCode(b.code)) fail(400, 'invalid-code', { remaining: 0 });
    if (!isStrongPassword(b.newPassword)) fail(400, 'weak-password');

    await rateLimit(db, `verify:ip:${req.ip}`, 30, HOUR);
    await consumeCode('reset', email, b.code as string);

    const passwordHash = await hashPassword(b.newPassword as string);
    const { rows } = await db.query('UPDATE users SET password_hash = $2 WHERE email = $1 RETURNING id', [email, passwordHash]);
    if (!rows[0]) throw new ApiError(400, 'code-expired');
    // Log out every device that used the old password.
    await db.query('DELETE FROM sessions WHERE user_id = $1', [rows[0].id]);
    return authReply(rows[0].id, req);
  });

  // ── POST /v1/auth/logout ──────────────────────────────────
  app.post('/auth/logout', { preHandler: requireAuth(db) }, async (req) => {
    await db.query('DELETE FROM sessions WHERE id = $1', [req.sessionId]);
    return { ok: true };
  });
}
