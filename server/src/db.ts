import fs from 'node:fs';
import path from 'node:path';

import pg from 'pg';

// Return BIGINT columns as JS numbers (our values stay far below 2^53).
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = pg.Pool;

export function createPool(databaseUrl: string): Db {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}

/** Runs fn inside BEGIN/COMMIT, rolling back on any error. */
export async function tx<T>(db: Db, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

/** Applies migrations/NNN_*.sql in order, once each. Safe to run on every start. */
export async function migrate(db: Db): Promise<string[]> {
  return tx(db, async (c) => {
    // Lock so two server instances never migrate at the same time.
    await c.query('SELECT pg_advisory_xact_lock(424242)');
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name as string));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
    const applied: string[] = [];
    for (const f of files) {
      if (done.has(f)) continue;
      await c.query(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      applied.push(f);
    }
    return applied;
  });
}
