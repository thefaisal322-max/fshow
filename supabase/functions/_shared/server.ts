// Shared helpers for all Edge Functions: DB connection, admin client, HTTP, rate limits, codes.
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { checkCode, CodeDoc, codeDocId, Purpose, sha256 } from './codes.ts';

// Direct Postgres connection (needed for transactions and the private schema).
// SUPABASE_DB_URL is provided automatically to every Edge Function.
export const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3, idle_timeout: 20 });

// Admin client — creates users / sets passwords. Never exposed to the app.
export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ───────── HTTP ─────────

export class ApiError extends Error {
  constructor(public status: number, public reason: string, public extra: Record<string, unknown> = {}) {
    super(reason);
  }
}

export function fail(status: number, reason: string, extra: Record<string, unknown> = {}): never {
  throw new ApiError(status, reason, extra);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/** Wraps a handler: JSON body in, JSON out, errors → { error: reason, ...extra }. */
export function handler(fn: (body: Record<string, unknown>, req: Request) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'not-found' }, 404);
    try {
      const text = await req.text();
      if (text.length > 16_000) fail(413, 'invalid-input');
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        fail(400, 'invalid-input');
      }
      if (typeof body !== 'object' || body === null || Array.isArray(body)) fail(400, 'invalid-input');
      return json(await fn(body as Record<string, unknown>, req));
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.reason, ...e.extra }, e.status);
      console.error(e);
      return json({ error: 'internal' }, 500);
    }
  };
}

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
}

// ───────── rate limit (atomic, in Postgres) ─────────

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export async function rateLimit(key: string, max: number, windowMs: number): Promise<void> {
  const now = Date.now();
  const [row] = await sql`
    INSERT INTO private.rate_limits (key, count, window_start) VALUES (${sha256(key)}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count        = CASE WHEN private.rate_limits.window_start <= ${now - windowMs} THEN 1 ELSE private.rate_limits.count + 1 END,
      window_start = CASE WHEN private.rate_limits.window_start <= ${now - windowMs} THEN ${now} ELSE private.rate_limits.window_start END
    RETURNING count`;
  if (Number(row.count) > max) fail(429, 'rate-limited');
}

// ───────── codes ─────────

export function rowToCodeDoc(r: Record<string, unknown> | undefined): CodeDoc | undefined {
  if (!r) return undefined;
  return {
    hash: r.hash as string,
    salt: r.salt as string,
    expiresAt: Number(r.expires_at),
    attempts: Number(r.attempts),
    lastSentAt: Number(r.last_sent_at),
    sendCount: Number(r.send_count),
    windowStart: Number(r.window_start),
  };
}

/** Checks a code and deletes it on success; wrong guesses are counted. Throws on failure. */
export async function consumeCode(purpose: Purpose, email: string, code: string): Promise<void> {
  const id = codeDocId(purpose, email);
  const result = await sql.begin(async (tx) => {
    const [row] = await tx`SELECT * FROM private.email_codes WHERE id = ${id} FOR UPDATE`;
    const r = checkCode(rowToCodeDoc(row), code, Date.now());
    if (r.ok) await tx`DELETE FROM private.email_codes WHERE id = ${id}`;
    else if (row) await tx`UPDATE private.email_codes SET attempts = attempts + 1 WHERE id = ${id}`;
    return r;
  });
  if (!result.ok) fail(400, result.reason, 'remaining' in result ? { remaining: result.remaining } : {});
}

export async function findUserId(email: string): Promise<string | null> {
  const [row] = await sql`SELECT id FROM auth.users WHERE lower(email) = ${email} LIMIT 1`;
  return row ? (row.id as string) : null;
}

/** Returns the logged-in user's id from the Authorization header, or fails with 401. */
export async function requireUser(req: Request): Promise<{ id: string; email: string }> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) fail(401, 'unauthenticated');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) fail(401, 'unauthenticated');
  return { id: data.user.id, email: (data.user.email ?? '').toLowerCase() };
}
