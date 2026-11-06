// POST { email, code, newPassword } → sets a new password and logs out every device.
import { admin, clientIp, consumeCode, fail, findUserId, handler, HOUR, rateLimit, sql } from '../_shared/server.ts';
import { isStrongPassword, isValidCode, isValidEmail, normalizeEmail } from '../_shared/validation.ts';

Deno.serve(
  handler(async (b, req) => {
    const email = normalizeEmail(b.email);
    if (!isValidEmail(email)) fail(400, 'invalid-input', { message: 'ایمیل سم نه دی' });
    if (!isValidCode(b.code)) fail(400, 'invalid-code', { remaining: 0 });
    if (!isStrongPassword(b.newPassword)) fail(400, 'weak-password');

    await rateLimit(`verify:ip:${clientIp(req)}`, 30, HOUR);
    await consumeCode('reset', email, b.code as string);

    const uid = await findUserId(email);
    if (!uid) fail(400, 'code-expired');

    const { error } = await admin.auth.admin.updateUserById(uid, { password: b.newPassword as string });
    if (error) {
      if (error.code === 'weak_password') fail(400, 'weak-password');
      console.error('updateUser failed', error);
      fail(500, 'internal');
    }
    // Log out every device that used the old password (refresh tokens go with their session).
    let loggedOut = true;
    try {
      await sql`DELETE FROM auth.sessions WHERE user_id = ${uid}`;
    } catch (e) {
      loggedOut = false;
      console.error('could not revoke sessions', e);
    }
    return { ok: true, loggedOut };
  }),
);
