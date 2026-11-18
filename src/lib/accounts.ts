import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from './api';
import { supabase } from './supabase';

/**
 * Several Faisal Show accounts on one phone (like Instagram / TikTok "Switch account").
 * Each saved account keeps its own login tokens on this phone; switching just loads them.
 * Tokens stay on the phone only (the same place Supabase keeps the normal login).
 */
export type SavedAccount = {
  id: string;
  name: string;
  username: string | null;
  photo_path: string | null;
  access_token: string;
  refresh_token: string;
  saved_at: string;
};

const KEY = 'fshow.accounts.v1';
const MAX = 5;

async function readAll(): Promise<SavedAccount[]> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v ? (JSON.parse(v) as SavedAccount[]) : [];
  } catch {
    return [];
  }
}
async function writeAll(list: SavedAccount[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

/** Keep the saved tokens of the account in use fresh (Supabase renews them every hour). */
supabase.auth.onAuthStateChange(async (_e, s) => {
  if (!s) return;
  const all = await readAll();
  const i = all.findIndex((a) => a.id === s.user.id);
  if (i < 0) return;
  all[i] = { ...all[i], access_token: s.access_token, refresh_token: s.refresh_token };
  await writeAll(all);
});

export const accounts = {
  list: readAll,

  /** Save (or update) the account that is logged in now. */
  rememberCurrent: async (p: { id: string; name: string; username: string | null; photo_path: string | null }) => {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (!s || s.user.id !== p.id) return;
    const all = (await readAll()).filter((a) => a.id !== p.id);
    await writeAll([
      { ...p, access_token: s.access_token, refresh_token: s.refresh_token, saved_at: new Date().toISOString() },
      ...all,
    ]);
  },

  /** Open another saved account. */
  switchTo: async (id: string) => {
    const target = (await readAll()).find((a) => a.id === id);
    if (!target) throw new ApiError('session-expired');
    const { data, error } = await supabase.auth.setSession({ access_token: target.access_token, refresh_token: target.refresh_token });
    if (error || !data.session) {
      // that login ended (password changed / logged out elsewhere) → log in again
      await accounts.forget(id);
      throw new ApiError('session-expired');
    }
  },

  /** "Add account": keep this one saved and go to the login screen (this login is NOT ended). */
  addAnother: async () => {
    await supabase.auth.signOut({ scope: 'local' });
  },

  forget: async (id: string) => {
    await writeAll((await readAll()).filter((a) => a.id !== id));
  },
};
