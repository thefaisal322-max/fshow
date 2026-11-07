// End-to-end tests against a local Supabase (`supabase start` + `supabase functions serve`).
// Env: API_URL, ANON_KEY, DB_URL  (from `supabase status -o env`)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

const API = process.env.API_URL;
const KEY = process.env.ANON_KEY;
const DB = process.env.DB_URL;
let ipN = 1;
const ip = () => `10.1.${Math.floor(ipN / 250)}.${ipN++ % 250}`;

function psql(query) {
  return execFileSync('psql', [DB, '-tAc', query], { encoding: 'utf8' }).trim();
}
const lastCode = (email) => psql(`SELECT code FROM private.test_outbox WHERE to_email = '${email}' ORDER BY created_at DESC LIMIT 1`);

async function fn(name, body, fakeIp = ip()) {
  const res = await fetch(`${API}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'x-forwarded-for': fakeIp },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function login(email, password) {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, body: await res.json() };
}

async function rest(token, method, path, body, extraHeaders = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...extraHeaders },
    body: body === undefined ? undefined : typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

const person = (email) => ({ email, password: 'fai123@afg', firstName: 'فیصل', lastName: 'خان', gender: 'male', birthday: '2000-05-10' });

async function signup(email) {
  const i = ip();
  assert.equal((await fn('send-code', { email, purpose: 'signup' }, i)).status, 200);
  const r = await fn('signup', { ...person(email), code: lastCode(email) }, i);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const l = await login(email, 'fai123@afg');
  assert.equal(l.status, 200, JSON.stringify(l.body));
  return l.body; // { access_token, refresh_token, user }
}

test('full signup flow with 5-digit code', async () => {
  const email = 'thefaisal322@fainet.org';
  const i = ip();
  const s = await fn('send-code', { email: ' TheFaisal322@FAINET.org ', purpose: 'signup' }, i);
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const code = lastCode(email);
  assert.match(code, /^\d{5}$/);

  const wrong = code === '00000' ? '11111' : '00000';
  const w = await fn('signup', { ...person(email), code: wrong }, i);
  assert.equal(w.status, 400);
  assert.deepEqual(w.body, { error: 'invalid-code', remaining: 4 });

  const weak = await fn('signup', { ...person(email), code, password: 'weak' }, i);
  assert.equal(weak.body.error, 'weak-password');

  const ok = await fn('signup', { ...person(email), code }, i);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  const reuse = await fn('signup', { ...person(email), code }, i);
  assert.equal(reuse.body.error, 'code-expired');

  const dup = await fn('send-code', { email, purpose: 'signup' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'email-in-use');

  const l = await login(email, 'fai123@afg');
  assert.equal(l.status, 200);
  const me = await rest(l.body.access_token, 'GET', `/rest/v1/profiles?id=eq.${l.body.user.id}&select=*`);
  assert.equal(me.status, 200);
  assert.equal(me.body[0].is_fainet, true);
  assert.equal(me.body[0].first_name, 'فیصل');
  assert.equal(me.body[0].profile_complete, false);
  const priv = await rest(l.body.access_token, 'GET', '/rest/v1/profiles_private?select=*');
  assert.equal(priv.body.length, 1);
  assert.equal(priv.body[0].birthday, '2000-05-10');
});

test('public sign-up through Supabase Auth is disabled', async () => {
  const res = await fetch(`${API}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bypass@example.com', password: 'fai123@afg' }),
  });
  assert.ok(res.status >= 400, `signup bypass returned ${res.status}`);
});

test('resend wait and lockout', async () => {
  const i = ip();
  const email = 'wait@example.com';
  assert.equal((await fn('send-code', { email, purpose: 'signup' }, i)).status, 200);
  const r = await fn('send-code', { email, purpose: 'signup' }, i);
  assert.equal(r.status, 429);
  assert.equal(r.body.error, 'resend-wait');

  const right = lastCode(email);
  const wrong = right === '00000' ? '11111' : '00000';
  const reasons = [];
  for (let k = 0; k < 5; k++) reasons.push((await fn('signup', { ...person(email), code: wrong }, i)).body.error);
  assert.deepEqual(reasons, ['invalid-code', 'invalid-code', 'invalid-code', 'invalid-code', 'too-many-attempts']);
  assert.equal((await fn('signup', { ...person(email), code: right }, i)).body.error, 'too-many-attempts');
});

test('validation', async () => {
  const i = ip();
  const email = 'kid@example.com';
  await fn('send-code', { email, purpose: 'signup' }, i);
  assert.equal((await fn('signup', { ...person(email), birthday: '2020-01-01', code: lastCode(email) }, i)).body.error, 'too-young');
  assert.equal((await fn('signup', { ...person(email), firstName: '<b>', code: lastCode(email) }, i)).body.error, 'invalid-input');
  assert.equal((await fn('send-code', { email: 'not-an-email', purpose: 'signup' })).status, 400);
});

test('app can only change bio/photo of own profile', async () => {
  const a = await signup('rls.a@example.com');
  const b = await signup('rls.b@example.com');
  const own = `/rest/v1/profiles?id=eq.${a.user.id}`;

  assert.equal((await rest(a.access_token, 'PATCH', own, { bio: 'سلام' })).status, 200);
  const fake = await rest(a.access_token, 'PATCH', own, { is_fainet: true });
  assert.ok(fake.status >= 400, 'is_fainet change must fail');
  const likes = await rest(a.access_token, 'PATCH', own, { likes_count: 10000 });
  assert.ok(likes.status >= 400, 'likes change must fail');
  const other = await rest(a.access_token, 'PATCH', `/rest/v1/profiles?id=eq.${b.user.id}`, { bio: 'hacked' });
  assert.deepEqual(other.body, []); // RLS: 0 rows
  const codes = await rest(a.access_token, 'GET', '/rest/v1/email_codes?select=*', undefined, { 'Accept-Profile': 'private' });
  assert.ok(codes.status >= 400, 'private schema must not be reachable');

  // username
  const bad = await rest(a.access_token, 'POST', '/rest/v1/rpc/claim_username', { p_username: '.bad' });
  assert.ok(bad.status >= 400 && JSON.stringify(bad.body).includes('username-invalid'));
  const ok = await rest(a.access_token, 'POST', '/rest/v1/rpc/claim_username', { p_username: 'faisal.e2e', p_bio: 'bio' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.username, 'faisal.e2e');
  assert.equal(ok.body.profile_complete, true);
  const taken = await rest(b.access_token, 'POST', '/rest/v1/rpc/claim_username', { p_username: 'faisal.e2e' });
  assert.ok(taken.status >= 400 && JSON.stringify(taken.body).includes('username-taken'));
});

test('avatar storage rules', async () => {
  const a = await signup('photo.a@example.com');
  const b = await signup('photo.b@example.com');
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  const up = (token, path, type = 'image/jpeg') =>
    rest(token, 'POST', `/storage/v1/object/avatars/${path}`, jpeg, { 'Content-Type': type, 'x-upsert': 'true' });

  const mine = await up(a.access_token, `${a.user.id}/avatar.jpg`);
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  const theirs = await up(a.access_token, `${b.user.id}/avatar.jpg`);
  assert.ok(theirs.status >= 400, 'upload into another user folder must fail');
  const html = await up(a.access_token, `${a.user.id}/x.html`, 'text/html');
  assert.ok(html.status >= 400, 'non-image must fail');

  const set = await rest(a.access_token, 'PATCH', `/rest/v1/profiles?id=eq.${a.user.id}`, { photo_path: `${a.user.id}/avatar.jpg` });
  assert.equal(set.status, 200);
  const steal = await rest(a.access_token, 'PATCH', `/rest/v1/profiles?id=eq.${a.user.id}`, { photo_path: `${b.user.id}/avatar.jpg` });
  assert.ok(steal.status >= 400, 'photo_path outside own folder must fail');

  const pub = await fetch(`${API}/storage/v1/object/public/avatars/${a.user.id}/avatar.jpg`);
  assert.equal(pub.status, 200);
});

test('password reset', async () => {
  const email = 'reset@example.com';
  const s = await signup(email);
  const i = ip();

  const before = psql(`SELECT count(*) FROM private.test_outbox`);
  assert.equal((await fn('send-code', { email: 'nobody@example.com', purpose: 'reset' }, i)).status, 200);
  assert.equal(psql(`SELECT count(*) FROM private.test_outbox`), before);

  assert.equal((await fn('send-code', { email, purpose: 'reset' }, i)).status, 200);
  const r = await fn('reset-password', { email, code: lastCode(email), newPassword: 'new456#pw' }, i);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.loggedOut, true, 'sessions should be revoked');

  const refresh = await fetch(`${API}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  assert.ok(refresh.status >= 400, 'old refresh token must stop working');
  assert.equal((await login(email, 'fai123@afg')).status, 400);
  assert.equal((await login(email, 'new456#pw')).status, 200);
});

async function fnAuth(name, body, token) {
  const res = await fetch(`${API}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-forwarded-for': ip() },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('change email moves the verified mark with the domain', async () => {
  const s = await signup('mover@example.com');
  const me = () => rest(s.access_token, 'GET', `/rest/v1/profiles?id=eq.${s.user.id}&select=is_fainet`);
  assert.equal((await me()).body[0].is_fainet, false);

  assert.equal((await fnAuth('change-email', { newEmail: 'x@fainet.org', code: '12345' }, KEY)).status, 401, 'needs login');
  const taken = await fn('send-code', { email: 'thefaisal322@fainet.org', purpose: 'change' });
  assert.equal(taken.body.error, 'email-in-use');

  const newEmail = 'mover@fainet.org';
  assert.equal((await fn('send-code', { email: newEmail, purpose: 'change' })).status, 200);
  const r = await fnAuth('change-email', { newEmail, code: lastCode(newEmail) }, s.access_token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.isFainet, true);
  assert.equal((await me()).body[0].is_fainet, true);
  assert.equal((await login(newEmail, 'fai123@afg')).status, 200);
  assert.equal((await login('mover@example.com', 'fai123@afg')).status, 400);
});

test('delete account needs the password and removes everything', async () => {
  const s = await signup('leaver@example.com');
  const wrong = await fnAuth('delete-account', { password: 'wrong123@x' }, s.access_token);
  assert.equal(wrong.status, 401);
  const ok = await fnAuth('delete-account', { password: 'fai123@afg' }, s.access_token);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await login('leaver@example.com', 'fai123@afg')).status, 400);
  assert.equal(psql(`SELECT count(*) FROM public.profiles WHERE id = '${s.user.id}'`), '0');
});
