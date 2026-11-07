// POST { password }  (logged in) → permanently deletes the account, its posts, chats membership and files.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { admin, clientIp, fail, handler, HOUR, rateLimit, requireUser } from '../_shared/server.ts';

async function removeFolder(bucket: string, folder: string) {
  for (let i = 0; i < 20; i++) {
    const { data } = await admin.storage.from(bucket).list(folder, { limit: 100 });
    if (!data || data.length === 0) return;
    await admin.storage.from(bucket).remove(data.map((f) => `${folder}/${f.name}`));
  }
}

Deno.serve(
  handler(async (b, req) => {
    const user = await requireUser(req);
    await rateLimit(`delete:ip:${clientIp(req)}`, 10, HOUR);
    if (typeof b.password !== 'string' || !b.password) fail(400, 'invalid-credentials');

    // Ask for the password again so a borrowed phone cannot delete the account.
    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: pwError } = await anon.auth.signInWithPassword({ email: user.email, password: b.password });
    if (pwError) fail(401, 'invalid-credentials');

    await removeFolder('avatars', user.id);
    await removeFolder('posts', user.id);
    const { error } = await admin.auth.admin.deleteUser(user.id); // cascades to profile, posts, likes, ...
    if (error) {
      console.error('delete user failed', error);
      fail(500, 'internal');
    }
    return { ok: true };
  }),
);
