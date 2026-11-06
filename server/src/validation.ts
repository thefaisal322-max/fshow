// Server-side validation. Mirrors src/lib/validation.ts in the app, but this is
// the copy that actually protects the data — the app's copy is only for UX.

export const MIN_AGE = 13;
export const CODE_LENGTH = 5;

export type Gender = 'male' | 'female';

export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function isStrongPassword(pw: unknown): pw is string {
  return (
    typeof pw === 'string' &&
    pw.length >= 8 &&
    pw.length <= 128 &&
    /[A-Za-z]/.test(pw) &&
    /\d/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  );
}

export function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const n = name.trim().replace(/\s+/g, ' ');
  if (n.length < 1 || n.length > 40) return null;
  if (/[<>{}\[\]\\/@#$%^*=+|~`"]/.test(n) || /\d/.test(n)) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(n)) return null;
  return n;
}

export function isGender(g: unknown): g is Gender {
  return g === 'male' || g === 'female';
}

/** Valid YYYY-MM-DD that is a real calendar date. */
export function isValidBirthday(b: unknown): b is string {
  if (typeof b !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return false;
  const [y, m, d] = b.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function ageFrom(birthday: string, now = new Date()): number {
  const [y, m, d] = birthday.split('-').map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--;
  return age;
}

export function isValidCode(code: unknown): code is string {
  return typeof code === 'string' && new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code);
}

const RESERVED = new Set([
  'admin', 'fshow', 'faisalshow', 'faisal_show', 'fainet', 'support', 'help',
  'official', 'root', 'system', 'null', 'undefined', 'moderator', 'security',
]);

export function normalizeUsername(name: unknown): string {
  return typeof name === 'string' ? name.trim().toLowerCase().replace(/^@/, '') : '';
}

export function isValidUsername(name: string): boolean {
  return (
    name.length >= 3 &&
    name.length <= 20 &&
    /^[a-z0-9._]+$/.test(name) &&
    !name.startsWith('.') &&
    !name.endsWith('.') &&
    !name.includes('..') &&
    !RESERVED.has(name)
  );
}

export function cleanBio(bio: unknown): string | null {
  if (bio === undefined || bio === null) return '';
  if (typeof bio !== 'string') return null;
  const b = bio.trim();
  return b.length <= 150 ? b : null;
}

/** Accounts with this email domain get a reach boost (see docs/ROADMAP.md). */
export const BOOST_DOMAIN = 'fainet.org';

export function isFainetEmail(email: string): boolean {
  return email.endsWith('@' + BOOST_DOMAIN);
}
