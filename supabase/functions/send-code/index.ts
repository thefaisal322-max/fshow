// POST { email, purpose: 'signup' | 'reset' | 'change' } → emails a 5-digit code.
// 'change' = the NEW address when a logged-in user changes their email (must not be in use).
import { canSend, codeDocId, CODE_TTL_MS, generateCode, hashCode, newSalt, Purpose } from '../_shared/codes.ts';
import { sendCodeEmail } from '../_shared/email.ts';
import { clientIp, fail, findUserId, handler, HOUR, rateLimit, rowToCodeDoc, sql } from '../_shared/server.ts';
import { isValidEmail, normalizeEmail } from '../_shared/validation.ts';

Deno.serve(
  handler(async (b, req) => {
    const email = normalizeEmail(b.email);
    const purpose = b.purpose as Purpose;
    if (!isValidEmail(email)) fail(400, 'invalid-input', { message: 'ایمیل سم نه دی' });
    if (purpose !== 'signup' && purpose !== 'reset' && purpose !== 'change') fail(400, 'invalid-input');

    await rateLimit(`send:ip:${clientIp(req)}`, 20, HOUR);

    const exists = (await findUserId(email)) !== null;
    if ((purpose === 'signup' || purpose === 'change') && exists) fail(409, 'email-in-use');
    // For reset we answer "ok" either way, so nobody can test which emails are registered.
    if (purpose === 'reset' && !exists) return { ok: true };

    const id = codeDocId(purpose, email);
    const code = generateCode();
    const salt = newSalt();
    const now = Date.now();

    const decision = await sql.begin(async (tx) => {
      const [row] = await tx`SELECT * FROM private.email_codes WHERE id = ${id} FOR UPDATE`;
      const d = canSend(rowToCodeDoc(row), now);
      if (d.ok) {
        const values = {
          id,
          hash: hashCode(code, salt),
          salt,
          expires_at: now + CODE_TTL_MS,
          attempts: 0,
          last_sent_at: now,
          send_count: d.sendCount,
          window_start: d.windowStart,
        };
        await tx`
          INSERT INTO private.email_codes ${tx(values)}
          ON CONFLICT (id) DO UPDATE SET hash = EXCLUDED.hash, salt = EXCLUDED.salt, expires_at = EXCLUDED.expires_at,
            attempts = 0, last_sent_at = EXCLUDED.last_sent_at, send_count = EXCLUDED.send_count, window_start = EXCLUDED.window_start`;
      }
      return d;
    });
    if (!decision.ok) {
      if (decision.reason === 'resend-wait') fail(429, 'resend-wait', { wait: decision.wait });
      fail(429, 'rate-limited');
    }

    try {
      await sendCodeEmail(email, code, purpose, async (to, c, p) => {
        await sql`INSERT INTO private.test_outbox (to_email, code, purpose) VALUES (${to}, ${c}, ${p})`;
      });
    } catch (e) {
      console.error('email send failed', e);
      // Let the user retry right away instead of waiting 60 s for an email that never came.
      await sql`UPDATE private.email_codes SET last_sent_at = 0 WHERE id = ${id}`;
      fail(502, 'email-send-failed');
    }
    return { ok: true };
  }),
);
