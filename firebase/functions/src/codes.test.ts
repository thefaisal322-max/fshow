import assert from 'node:assert/strict';
import { test } from 'node:test';

import { canSend, checkCode, CodeDoc, generateCode, hashCode, MAX_ATTEMPTS, newSalt } from './codes';
import { ageFrom, cleanName, isStrongPassword, isValidBirthday, isValidUsername } from './validation';

function makeDoc(code: string, over: Partial<CodeDoc> = {}): CodeDoc {
  const salt = newSalt();
  return { hash: hashCode(code, salt), salt, expiresAt: 10_000, attempts: 0, lastSentAt: 0, sendCount: 1, windowStart: 0, ...over };
}

test('generateCode gives 5 digits', () => {
  for (let i = 0; i < 200; i++) assert.match(generateCode(), /^\d{5}$/);
});

test('correct code passes', () => {
  assert.deepEqual(checkCode(makeDoc('12345'), '12345', 1000), { ok: true });
});

test('wrong code counts down attempts', () => {
  assert.deepEqual(checkCode(makeDoc('12345'), '00000', 1000), { ok: false, reason: 'invalid-code', remaining: 4 });
  assert.deepEqual(checkCode(makeDoc('12345', { attempts: MAX_ATTEMPTS - 1 }), '00000', 1000), { ok: false, reason: 'too-many-attempts' });
});

test('locked code rejects even the right code', () => {
  assert.equal(checkCode(makeDoc('12345', { attempts: MAX_ATTEMPTS }), '12345', 1000).ok, false);
});

test('expired / missing code', () => {
  assert.deepEqual(checkCode(makeDoc('12345'), '12345', 20_000), { ok: false, reason: 'code-expired' });
  assert.deepEqual(checkCode(undefined, '12345', 0), { ok: false, reason: 'code-expired' });
});

test('resend wait and hourly limit', () => {
  const now = 10 * 60 * 1000;
  assert.deepEqual(canSend(undefined, now), { ok: true, sendCount: 1, windowStart: now });
  const r = canSend(makeDoc('1', { lastSentAt: now - 20_000 }), now);
  assert.deepEqual(r, { ok: false, reason: 'resend-wait', wait: 40 });
  assert.deepEqual(canSend(makeDoc('1', { lastSentAt: now - 61_000, sendCount: 5, windowStart: now - 1000 }), now), { ok: false, reason: 'rate-limited' });
  assert.deepEqual(canSend(makeDoc('1', { lastSentAt: now - 61_000, sendCount: 2, windowStart: now - 1000 }), now), { ok: true, sendCount: 3, windowStart: now - 1000 });
});

test('validation', () => {
  assert.equal(isStrongPassword('fai123@afg'), true);
  assert.equal(isStrongPassword('fai12345'), false);
  assert.equal(isStrongPassword('short1@'), false);
  assert.equal(isValidBirthday('2001-02-29'), false);
  assert.equal(isValidBirthday('2000-02-29'), true);
  assert.equal(ageFrom('2010-11-07', new Date('2026-11-06')), 15);
  assert.equal(cleanName('  احمد   خان '), 'احمد خان');
  assert.equal(cleanName('<script>'), null);
  assert.equal(isValidUsername('faisal.khan'), true);
  assert.equal(isValidUsername('.faisal'), false);
  assert.equal(isValidUsername('admin'), false);
  assert.equal(isValidUsername('Faisal'), false);
});
