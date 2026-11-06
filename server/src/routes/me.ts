import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';

import type { Config } from '../config';
import { Db, tx } from '../db';
import { fail } from '../errors';
import { HOUR, rateLimit } from '../ratelimit';
import { requireAuth } from '../sessions';
import { meUser, UserRow } from '../users';
import { cleanBio, isValidUsername, normalizeUsername } from '../validation';

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export async function meRoutes(app: FastifyInstance, { db, cfg }: { db: Db; cfg: Config }) {
  const auth = requireAuth(db);
  const reload = async (id: string) =>
    meUser((await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id])).rows[0], cfg.publicUrl);

  // ── GET /v1/me ────────────────────────────────────────────
  app.get('/me', { preHandler: auth }, async (req) => ({ user: meUser(req.user!, cfg.publicUrl) }));

  // ── PATCH /v1/me  { bio } ─────────────────────────────────
  app.patch('/me', { preHandler: auth }, async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const bio = cleanBio(b.bio);
    if (bio === null) fail(400, 'invalid-input', { message: 'بایو تر ۱۵۰ تورو کم وي' });
    await db.query('UPDATE users SET bio = $2 WHERE id = $1', [req.user!.id, bio]);
    return { user: await reload(req.user!.id) };
  });

  // ── POST /v1/me/username  { username, bio } ───────────────
  // Claims a unique ID Name and finishes the profile.
  app.post('/me/username', { preHandler: auth }, async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const username = normalizeUsername(b.username);
    const bio = cleanBio(b.bio);
    if (!isValidUsername(username)) fail(400, 'username-invalid');
    if (bio === null) fail(400, 'invalid-input', { message: 'بایو تر ۱۵۰ تورو کم وي' });
    await rateLimit(db, `username:${req.user!.id}`, 10, HOUR);
    try {
      await db.query('UPDATE users SET username = $2, bio = $3, profile_complete = true WHERE id = $1', [
        req.user!.id,
        username,
        bio,
      ]);
    } catch (e: any) {
      if (e?.code === '23505') fail(409, 'username-taken');
      throw e;
    }
    return { user: await reload(req.user!.id) };
  });

  // ── POST /v1/me/avatar  multipart "file" ──────────────────
  app.post('/me/avatar', { preHandler: auth }, async (req) => {
    await rateLimit(db, `avatar:${req.user!.id}`, 20, HOUR);
    const file = await req.file({ limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } });
    if (!file) fail(400, 'invalid-image');

    let input: Buffer;
    try {
      input = await file.toBuffer();
    } catch (e: any) {
      if (e?.code === 'FST_REQ_FILE_TOO_LARGE') fail(413, 'image-too-big');
      throw e;
    }

    // Re-encode every image: this checks it really is an image, fixes rotation,
    // strips EXIF (GPS location!) and makes all avatars 512×512 JPEG.
    let output: Buffer;
    try {
      output = await sharp(input, { limitInputPixels: 50_000_000 })
        .rotate()
        .resize(512, 512, { fit: 'cover' })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    } catch {
      fail(400, 'invalid-image');
    }

    const rel = `avatars/${req.user!.id}-${crypto.randomBytes(6).toString('hex')}.jpg`;
    await fs.mkdir(path.join(cfg.mediaDir, 'avatars'), { recursive: true });
    await fs.writeFile(path.join(cfg.mediaDir, rel), output);

    const old = await tx(db, async (c) => {
      const { rows } = await c.query('SELECT photo_path FROM users WHERE id = $1 FOR UPDATE', [req.user!.id]);
      await c.query('UPDATE users SET photo_path = $2 WHERE id = $1', [req.user!.id, rel]);
      return rows[0]?.photo_path as string | null;
    });
    if (old && /^avatars\/[\w-]+\.jpg$/.test(old)) {
      await fs.unlink(path.join(cfg.mediaDir, old)).catch(() => {});
    }
    return { user: await reload(req.user!.id) };
  });
}
