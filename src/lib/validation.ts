// Client-side checks give fast feedback. The server (Cloud Functions) repeats
// every check — never trust the app alone.

export const PASSWORD_MIN = 8;
export const MIN_AGE = 13;
export const RESEND_WAIT_SECONDS = 60;
export const CODE_LENGTH = 5;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

/** Returns a Pashto error message, or null if the password is fine. */
export function passwordError(pw: string): string | null {
  if (pw.length < PASSWORD_MIN || pw.length > 128 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) {
    return 'پاسورډ باید لږ تر لږه ۸ توري ولري: توري، شمېره او یو سمبول (لکه fai123@afg)';
  }
  return null;
}

export function nameError(name: string): string | null {
  const n = name.trim();
  if (n.length < 1) return 'نوم او تخلص دواړه ولیکئ';
  if (n.length > 40) return 'نوم ډېر اوږد دی';
  if (/[<>{}\[\]\\/@#$%^*=+|~`"]/.test(n) || /\d/.test(n)) return 'په نوم کې شمېرې او سمبولونه نه منل کېږي';
  return null;
}

/** Builds YYYY-MM-DD from day/month/year inputs, or returns null if it is not a real date. */
export function buildBirthday(day: string, month: string, year: string): string | null {
  const d = Number(day), m = Number(month), y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function ageFrom(birthday: string, now = new Date()): number {
  const [y, m, d] = birthday.split('-').map(Number);
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d);
  if (beforeBirthday) age--;
  return age;
}

const RESERVED = new Set(['admin', 'fshow', 'faisalshow', 'faisal_show', 'fainet', 'support', 'help', 'official', 'root', 'system', 'null', 'undefined']);

export function normalizeUsername(name: string): string {
  return name.trim().toLowerCase().replace(/^@/, '');
}

export function usernameError(name: string): string | null {
  if (name.length < 3 || name.length > 20) return 'ID Name باید له ۳ تر ۲۰ تورو پورې وي';
  if (!/^[a-z0-9._]+$/.test(name)) return 'یوازې انګلیسي توري، شمېرې، ټکی (.) او _ منل کېږي';
  if (name.startsWith('.') || name.endsWith('.') || name.includes('..')) return 'ټکی (.) په پیل، پای یا دوه ځله پرله‌پسې نه راځي';
  if (RESERVED.has(name)) return 'دا نوم ساتل شوی دی';
  return null;
}
