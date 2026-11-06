import { sha256 } from './codes';
import type { Db } from './db';
import { fail } from './errors';

/**
 * Fixed-window counter in Postgres, atomic in one statement.
 * Throws 429 `rate-limited` when `key` was hit more than `max` times in `windowMs`.
 */
export async function rateLimit(db: Db, key: string, max: number, windowMs: number): Promise<void> {
  const now = Date.now();
  const { rows } = await db.query<{ count: number }>(
    `INSERT INTO rate_limits (key, count, window_start) VALUES ($1, 1, $2)
     ON CONFLICT (key) DO UPDATE SET
       count        = CASE WHEN rate_limits.window_start <= $2 - $3 THEN 1  ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start <= $2 - $3 THEN $2 ELSE rate_limits.window_start END
     RETURNING count`,
    [sha256(key), now, windowMs],
  );
  if (rows[0].count > max) {
    fail(429, 'rate-limited');
  }
}

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
