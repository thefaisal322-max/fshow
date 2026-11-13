// POST { userId, action: 'ban' | 'unban' | 'delete' }  — admins only (the owner's emails).
// ban: cannot log in or post, posts hidden. delete: removes the account, its posts and files for good.
import { admin, fail, handler, requireUser, sql } from '../_shared/server.ts';

async function removeFolder(bucket: string, folder: string) {
  for (let i = 0; i < 20; i++) {
    const { data } = await admin.storage.from(bucket).list(folder, { limit: 100 });
    if (!data || data.length === 0) return;
    await admin.storage.from(bucket).remove(data.map((f) => `${folder}/${f.name}`));
  }
}

Deno.serve(
  handler(async (b, req) => {
    const me = await requireUser(req);
    const [{ ok }] = await sql`SELECT private.email_is_admin(${me.email ?? ''}) AS ok`;
    if (!ok) fail(403, 'forbidden');

    const userId = typeof b.userId === 'string' ? b.userId : '';
    const action = b.action;
    if (!/^[0-9a-f-]{36}$/.test(userId) || !['ban', 'unban', 'delete'].includes(String(action))) fail(400, 'invalid-input');
    if (userId === me.id) fail(400, 'invalid-input'); // not yourself

    if (action === 'ban' || action === 'unban') {
      const ban = action === 'ban';
      await sql`SELECT private.set_banned(${userId}::uuid, ${ban})`;
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: ban ? '876000h' : 'none' });
      if (error) console.error('auth ban failed', error);
      return { ok: true };
    }

    await removeFolder('avatars', userId);
    await removeFolder('posts', userId);
    await removeFolder('proofs', userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error('delete user failed', error);
      fail(500, 'internal');
    }
    return { ok: true };
  }),
);
