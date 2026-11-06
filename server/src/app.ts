import fs from 'node:fs';

import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { FastifyInstance } from 'fastify';

import type { Config } from './config';
import type { Db } from './db';
import { ApiError } from './errors';
import { authRoutes } from './routes/auth';
import { AVATAR_MAX_BYTES, meRoutes } from './routes/me';

export async function buildApp(cfg: Config, db: Db): Promise<FastifyInstance> {
  const app = Fastify({
    logger: cfg.production ? { level: 'info' } : { level: process.env.LOG_LEVEL ?? 'warn' },
    trustProxy: cfg.trustProxy,
    bodyLimit: 64 * 1024, // JSON bodies are small; files go through multipart
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.status).send({ error: err.reason, ...err.extra });
    }
    if (err.validation || err.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || err.statusCode === 400) {
      return reply.status(400).send({ error: 'invalid-input' });
    }
    if (err.statusCode === 413) return reply.status(413).send({ error: 'image-too-big' });
    if (err.statusCode === 406 || err.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
      return reply.status(400).send({ error: 'invalid-image' });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'internal' });
  });

  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'not-found' }));

  // Basic security headers
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
  });

  await app.register(multipart, { limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 5 } });

  fs.mkdirSync(cfg.mediaDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: cfg.mediaDir,
    prefix: '/media/',
    index: false,
    list: false,
    dotfiles: 'deny',
    maxAge: '30d',
    immutable: true,
  });

  app.get('/health', async () => {
    await db.query('SELECT 1');
    return { ok: true };
  });

  await app.register(
    async (v1) => {
      await authRoutes(v1, { db, cfg });
      await meRoutes(v1, { db, cfg });
    },
    { prefix: '/v1' },
  );

  return app;
}

/** Deletes expired codes, sessions and rate-limit rows. */
export async function cleanup(db: Db): Promise<void> {
  const now = Date.now();
  await db.query('DELETE FROM email_codes WHERE expires_at < $1 AND last_sent_at < $2', [now, now - 2 * 3600_000]);
  await db.query('DELETE FROM sessions WHERE expires_at < now()');
  await db.query('DELETE FROM rate_limits WHERE window_start < $1', [now - 24 * 3600_000]);
}
