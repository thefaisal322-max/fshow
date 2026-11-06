import crypto from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';

import { sha256 } from './codes';
import type { Db } from './db';
import { fail } from './errors';
import { UserRow } from './users';

export const SESSION_DAYS = 60;
const DAY = 24 * 60 * 60 * 1000;

/** Creates a login session and returns the raw token (shown to the app once, never stored). */
export async function createSession(db: Db | { query: Db['query'] }, userId: string, req: FastifyRequest): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))`,
    [userId, sha256(token), String(req.headers['user-agent'] ?? '').slice(0, 300), req.ip, SESSION_DAYS],
  );
  return token;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserRow;
    sessionId?: string;
  }
}

/** preHandler: requires `Authorization: Bearer <token>`; sets req.user. */
export function requireAuth(db: Db) {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token || token.length > 100) fail(401, 'unauthenticated');

    const { rows } = await db.query(
      `SELECT s.id AS session_id, s.last_used_at, u.*
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [sha256(token)],
    );
    const row = rows[0];
    if (!row) fail(401, 'unauthenticated');
    if (row.status !== 'active') fail(403, 'account-disabled');

    // Sliding expiry: active users stay logged in. Only touch the row once per hour.
    if (Date.now() - new Date(row.last_used_at).getTime() > DAY / 24) {
      await db.query(
        `UPDATE sessions SET last_used_at = now(), expires_at = now() + make_interval(days => $2) WHERE id = $1`,
        [row.session_id, SESSION_DAYS],
      );
    }
    req.sessionId = row.session_id;
    req.user = row as UserRow;
  };
}
