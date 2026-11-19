import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

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

const loginKey = (id: string) => `fshow.login.${id}`;
async function savedLogin(id: string): Promise<{ email: string; password: string } | null> {
  try {
    const v = await SecureStore.getItemAsync(loginKey(id));
    return v ? (JSON.parse(v) as { email: string; password: string }) : null;
  } catch {
    return null;
  }
}
async function forgetLogin(id: string) {
  try {
    await SecureStore.deleteItemAsync(loginKey(id));
  } catch {
    /* nothing saved */
  }
}

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
    if (!error && data.session) return;
    // that login ended → use the saved login info (if the person chose "Save login info")
    const login = await savedLogin(id);
    if (login) {
      const r = await supabase.auth.signInWithPassword(login);
      if (!r.error && r.data.session?.user.id === id) return;
      if (r.error && /invalid login/i.test(r.error.message)) await forgetLogin(id); // the password was changed
    }
    await accounts.forget(id);
    throw new ApiError('session-expired');
  },

  /** "Save login info": email + password in the phone's secure storage (Android Keystore), only for switching */
  saveLogin: async (id: string, email: string, password: string) => {
    try {
      await SecureStore.setItemAsync(loginKey(id), JSON.stringify({ email, password }), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } catch {
      /* the phone has no secure storage → not saved */
    }
  },
  hasLogin: async (id: string) => !!(await savedLogin(id)),
  forgetLogin: (id: string) => forgetLogin(id),

  /** "Add account": keep this one saved and go to the login screen (this login is NOT ended). */
  addAnother: async () => {
    await supabase.auth.signOut({ scope: 'local' });
  },

  forget: async (id: string) => {
    await writeAll((await readAll()).filter((a) => a.id !== id));
  },
  /** removed from this phone completely (also the saved login info) */
  remove: async (id: string) => {
    await writeAll((await readAll()).filter((a) => a.id !== id));
    await forgetLogin(id);
  },
};
