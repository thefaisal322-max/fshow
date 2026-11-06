// POST { email, code, password, firstName, lastName, gender, birthday }
// Checks the 5-digit code, then creates the account + profile.
// The app then logs in with supabase.auth.signInWithPassword.
import { admin, clientIp, consumeCode, fail, handler, HOUR, rateLimit, sql } from '../_shared/server.ts';
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
} from '../_shared/validation.ts';

Deno.serve(
  handler(async (b, req) => {
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

    await rateLimit(`verify:ip:${clientIp(req)}`, 30, HOUR);
    await consumeCode('signup', email, b.code as string);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: b.password as string,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    });
    if (error || !data.user) {
      if (error?.code === 'email_exists' || error?.status === 422) fail(409, 'email-in-use');
      if (error?.code === 'weak_password') fail(400, 'weak-password');
      console.error('createUser failed', error);
      fail(500, 'internal');
    }
    const uid = data.user.id;

    try {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO public.profiles (id, first_name, last_name, gender, is_fainet)
          VALUES (${uid}, ${firstName}, ${lastName}, ${b.gender as string}, ${isFainetEmail(email)})`;
        await tx`INSERT INTO public.profiles_private (id, email, birthday) VALUES (${uid}, ${email}, ${birthday})`;
      });
    } catch (e) {
      // Never leave a half-created account behind.
      await admin.auth.admin.deleteUser(uid).catch(() => {});
      throw e;
    }

    console.log('account created', { uid, fainet: isFainetEmail(email) });
    return { ok: true };
  }),
);
