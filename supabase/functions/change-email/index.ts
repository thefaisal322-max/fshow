// POST { newEmail, code }  (logged in) → moves the account to a new, verified email.
// The verified ✓ mark follows the email: only @fainet.org addresses are verified.
import { admin, clientIp, consumeCode, fail, handler, HOUR, rateLimit, requireUser, sql } from '../_shared/server.ts';
import { isFainetEmail, isValidCode, isValidEmail, normalizeEmail } from '../_shared/validation.ts';

Deno.serve(
  handler(async (b, req) => {
    const user = await requireUser(req);
    const newEmail = normalizeEmail(b.newEmail);
    if (!isValidEmail(newEmail)) fail(400, 'invalid-input', { message: 'ایمیل سم نه دی' });
    if (newEmail === user.email) fail(400, 'invalid-input', { message: 'دا همدا اوسنی ایمیل دی' });
    if (!isValidCode(b.code)) fail(400, 'invalid-code', { remaining: 0 });

    await rateLimit(`verify:ip:${clientIp(req)}`, 30, HOUR);
    await consumeCode('change', newEmail, b.code as string);

    const { error } = await admin.auth.admin.updateUserById(user.id, { email: newEmail, email_confirm: true });
    if (error) {
      if (error.code === 'email_exists' || error.status === 422) fail(409, 'email-in-use');
      console.error('change email failed', error);
      fail(500, 'internal');
    }
    await sql.begin(async (tx) => {
      await tx`UPDATE public.profiles_private SET email = ${newEmail} WHERE id = ${user.id}`;
      await tx`UPDATE public.profiles SET is_fainet = ${isFainetEmail(newEmail)} WHERE id = ${user.id}`;
    });
    return { ok: true, isFainet: isFainetEmail(newEmail) };
  }),
);
