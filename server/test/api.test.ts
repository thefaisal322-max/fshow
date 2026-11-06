/**
 * End-to-end API tests against a real PostgreSQL.
 * Run with DATABASE_URL set (CI provides a throwaway database). Skipped otherwise.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';

import { buildApp, cleanup } from '../src/app';
import { loadConfig } from '../src/config';
import { createPool, Db, migrate } from '../src/db';
import { outbox } from '../src/email';

const DATABASE_URL = process.env.DATABASE_URL;

describe('API', { skip: !DATABASE_URL && 'DATABASE_URL not set' }, () => {
  let app: FastifyInstance;
  let db: Db;
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fshow-media-'));
  let ipCounter = 1;
  // Each test uses its own fake IP so per-IP rate limits do not interfere.
  const freshIp = () => `10.0.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`;

  before(async () => {
    db = createPool(DATABASE_URL!);
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(db);
    await migrate(db); // second run must be a no-op
    const cfg = loadConfig({ databaseUrl: DATABASE_URL!, emailTransport: 'memory', mediaDir, publicUrl: 'https://api.test', trustProxy: true });
    app = await buildApp(cfg, db);
  });

  after(async () => {
    await app?.close();
    await db?.end();
  });

  async function req(method: string, url: string, body?: unknown, opts: { token?: string; ip?: string } = {}) {
    const res = await app.inject({
      method: method as any,
      url,
      payload: body as any,
      headers: {
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        'x-forwarded-for': opts.ip ?? '10.255.255.1',
      },
    });
    return { status: res.statusCode, body: res.json() as any };
  }

  const lastCode = (email: string) => [...outbox].reverse().find((m) => m.to === email)!.code;

  const person = (email: string) => ({
    email,
    password: 'fai123@afg',
    firstName: 'فیصل',
    lastName: 'خان',
    gender: 'male',
    birthday: '2000-05-10',
  });

  async function signup(email: string) {
    const ip = freshIp();
    const s = await req('POST', '/v1/auth/send-code', { email, purpose: 'signup' }, { ip });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    const r = await req('POST', '/v1/auth/signup', { ...person(email), code: lastCode(email) }, { ip });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body as { token: string; user: any };
  }

  test('health', async () => {
    const r = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(r.statusCode, 200);
  });

  test('full signup flow + fainet flag', async () => {
    const email = 'thefaisal322@fainet.org';
    const ip = freshIp();
    const s = await req('POST', '/v1/auth/send-code', { email: '  TheFaisal322@FAINET.org ', purpose: 'signup' }, { ip });
    assert.equal(s.status, 200);
    assert.match(lastCode(email), /^\d{5}$/);

    // wrong code → remaining attempts
    const wrong = lastCode(email) === '00000' ? '11111' : '00000';
    const w = await req('POST', '/v1/auth/signup', { ...person(email), code: wrong }, { ip });
    assert.equal(w.status, 400);
    assert.deepEqual(w.body, { error: 'invalid-code', remaining: 4 });

    // bad input does not burn the code
    const bad = await req('POST', '/v1/auth/signup', { ...person(email), code: lastCode(email), password: 'weak' }, { ip });
    assert.equal(bad.body.error, 'weak-password');

    const ok = await req('POST', '/v1/auth/signup', { ...person(email), code: lastCode(email) }, { ip });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.ok(ok.body.token.length > 30);
    assert.equal(ok.body.user.email, email);
    assert.equal(ok.body.user.isFainet, true);
    assert.equal(ok.body.user.profileComplete, false);
    assert.equal(ok.body.user.birthday, '2000-05-10');
    assert.equal(ok.body.user.password_hash, undefined);

    // code is single-use
    const again = await req('POST', '/v1/auth/signup', { ...person(email), code: lastCode(email) }, { ip });
    assert.equal(again.body.error, 'code-expired');

    // email now taken
    const dup = await req('POST', '/v1/auth/send-code', { email, purpose: 'signup' }, { ip: freshIp() });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error, 'email-in-use');

    const me = await req('GET', '/v1/me', undefined, { token: ok.body.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.displayName, 'فیصل خان');
  });

  test('normal email is not fainet', async () => {
    const r = await signup('ahmad@gmail.com');
    assert.equal(r.user.isFainet, false);
  });

  test('resend wait', async () => {
    const ip = freshIp();
    const email = 'wait@example.com';
    assert.equal((await req('POST', '/v1/auth/send-code', { email, purpose: 'signup' }, { ip })).status, 200);
    const r = await req('POST', '/v1/auth/send-code', { email, purpose: 'signup' }, { ip });
    assert.equal(r.status, 429);
    assert.equal(r.body.error, 'resend-wait');
    assert.ok(r.body.wait > 50 && r.body.wait <= 60);
  });

  test('code locks after 5 wrong tries', async () => {
    const ip = freshIp();
    const email = 'lock@example.com';
    await req('POST', '/v1/auth/send-code', { email, purpose: 'signup' }, { ip });
    const right = lastCode(email);
    const wrong = right === '00000' ? '11111' : '00000';
    const reasons = [];
    for (let i = 0; i < 5; i++) reasons.push((await req('POST', '/v1/auth/signup', { ...person(email), code: wrong }, { ip })).body.error);
    assert.deepEqual(reasons, ['invalid-code', 'invalid-code', 'invalid-code', 'invalid-code', 'too-many-attempts']);
    const r = await req('POST', '/v1/auth/signup', { ...person(email), code: right }, { ip });
    assert.equal(r.body.error, 'too-many-attempts');
  });

  test('signup validation', async () => {
    const ip = freshIp();
    const email = 'kid@example.com';
    await req('POST', '/v1/auth/send-code', { email, purpose: 'signup' }, { ip });
    const young = await req('POST', '/v1/auth/signup', { ...person(email), birthday: '2020-01-01', code: lastCode(email) }, { ip });
    assert.equal(young.body.error, 'too-young');
    const name = await req('POST', '/v1/auth/signup', { ...person(email), firstName: '<b>', code: lastCode(email) }, { ip });
    assert.equal(name.body.error, 'invalid-input');
    const badJson = await app.inject({ method: 'POST', url: '/v1/auth/signup', payload: '{bad', headers: { 'content-type': 'application/json' } });
    assert.equal(badJson.statusCode, 400);
  });

  test('login, wrong password, logout', async () => {
    const email = 'login@example.com';
    await signup(email);
    const ip = freshIp();
    const bad = await req('POST', '/v1/auth/login', { email, password: 'nope123@x' }, { ip });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error, 'invalid-credentials');
    const ghost = await req('POST', '/v1/auth/login', { email: 'ghost@example.com', password: 'nope123@x' }, { ip });
    assert.equal(ghost.body.error, 'invalid-credentials');

    const ok = await req('POST', '/v1/auth/login', { email: 'LOGIN@example.com', password: 'fai123@afg' }, { ip });
    assert.equal(ok.status, 200);
    const token = ok.body.token;
    assert.equal((await req('GET', '/v1/me', undefined, { token })).status, 200);
    assert.equal((await req('POST', '/v1/auth/logout', undefined, { token })).status, 200);
    assert.equal((await req('GET', '/v1/me', undefined, { token })).status, 401);
    assert.equal((await req('GET', '/v1/me', undefined, { token: 'garbage' })).status, 401);
    assert.equal((await req('GET', '/v1/me')).status, 401);
  });

  test('login brute force is limited per email', async () => {
    const email = 'brute@example.com';
    await signup(email);
    let last;
    for (let i = 0; i < 11; i++) last = await req('POST', '/v1/auth/login', { email, password: `wrong${i}@pass` }, { ip: freshIp() });
    assert.equal(last!.status, 429);
    assert.equal(last!.body.error, 'rate-limited');
  });

  test('password reset revokes old sessions', async () => {
    const email = 'reset@example.com';
    const { token: oldToken } = await signup(email);
    const ip = freshIp();

    // unknown email: same answer, no email sent
    const before = outbox.length;
    assert.equal((await req('POST', '/v1/auth/send-code', { email: 'nobody@example.com', purpose: 'reset' }, { ip })).status, 200);
    assert.equal(outbox.length, before);

    assert.equal((await req('POST', '/v1/auth/send-code', { email, purpose: 'reset' }, { ip })).status, 200);
    const r = await req('POST', '/v1/auth/reset', { email, code: lastCode(email), newPassword: 'new456#pw' }, { ip });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((await req('GET', '/v1/me', undefined, { token: oldToken })).status, 401);
    assert.equal((await req('GET', '/v1/me', undefined, { token: r.body.token })).status, 200);
    assert.equal((await req('POST', '/v1/auth/login', { email, password: 'fai123@afg' }, { ip })).status, 401);
    assert.equal((await req('POST', '/v1/auth/login', { email, password: 'new456#pw' }, { ip })).status, 200);
  });

  test('username claim and uniqueness', async () => {
    const a = await signup('user.a@example.com');
    const b = await signup('user.b@example.com');
    const bad = await req('POST', '/v1/me/username', { username: '.bad' }, { token: a.token });
    assert.equal(bad.body.error, 'username-invalid');
    const reserved = await req('POST', '/v1/me/username', { username: 'admin' }, { token: a.token });
    assert.equal(reserved.body.error, 'username-invalid');

    const ok = await req('POST', '/v1/me/username', { username: '@Faisal.Khan', bio: 'سلام' }, { token: a.token });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.user.username, 'faisal.khan');
    assert.equal(ok.body.user.bio, 'سلام');
    assert.equal(ok.body.user.profileComplete, true);

    const taken = await req('POST', '/v1/me/username', { username: 'faisal.khan' }, { token: b.token });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.error, 'username-taken');

    const longBio = await req('PATCH', '/v1/me', { bio: 'x'.repeat(151) }, { token: a.token });
    assert.equal(longBio.status, 400);
  });

  test('avatar upload re-encodes image', async () => {
    const { token } = await signup('photo@example.com');
    const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#1877F2' } }).png().toBuffer();

    const upload = async (buf: Buffer, filename: string, type: string) => {
      const boundary = '----fshowtest';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
        buf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/me/avatar',
        payload: body,
        headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      });
      return { status: res.statusCode, body: res.json() as any };
    };

    const r = await upload(png, 'a.png', 'image/png');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const url: string = r.body.user.photoURL;
    assert.match(url, /^https:\/\/api\.test\/media\/avatars\/[\w-]+\.jpg$/);
    const rel = url.replace('https://api.test/media/', '');
    const meta = await sharp(path.join(mediaDir, rel)).metadata();
    assert.equal(meta.width, 512);
    assert.equal(meta.format, 'jpeg');

    // served as static file
    const file = await app.inject({ method: 'GET', url: `/media/${rel}` });
    assert.equal(file.statusCode, 200);

    // second upload replaces and deletes the old file
    const r2 = await upload(png, 'b.png', 'image/png');
    assert.equal(r2.status, 200);
    assert.equal(fs.existsSync(path.join(mediaDir, rel)), false);

    // not an image
    const fake = await upload(Buffer.from('<?php echo 1; ?>'), 'x.jpg', 'image/jpeg');
    assert.equal(fake.status, 400);
    assert.equal(fake.body.error, 'invalid-image');

    // too big
    const big = await upload(Buffer.alloc(6 * 1024 * 1024, 1), 'big.jpg', 'image/jpeg');
    assert.equal(big.status, 413);

    // no auth
    const noAuth = await app.inject({ method: 'POST', url: '/v1/me/avatar' });
    assert.equal(noAuth.statusCode, 401);
  });

  test('path traversal on media is blocked', async () => {
    const r = await app.inject({ method: 'GET', url: '/media/../package.json' });
    assert.notEqual(r.statusCode, 200);
  });

  test('cleanup runs', async () => {
    await cleanup(db);
  });
});
