import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { SUPABASE_KEY, SUPABASE_URL } from '@/config/supabase.config';

import { mediaUrl } from './offline';

/**
 * Network that drops now and then (VPN switching servers, weak 3G/4G):
 *  • every request gives up after 30 s instead of hanging forever (uploads get 3 minutes)
 *  • reads (GET, and get_/search_ functions) are tried again up to 2 more times
 *  Writes are not repeated automatically, so nothing is ever posted twice.
 */
const SAFE_RPC = /\/rest\/v1\/rpc\/(get_|search_|unread_|user_id_by_)/;

async function resilientFetch(input: any, init?: any): Promise<Response> {
  const url: string = typeof input === 'string' ? input : String(input?.href ?? input?.url ?? '');
  const method = (init?.method ?? 'GET').toUpperCase();
  const safe = method === 'GET' || method === 'HEAD' || SAFE_RPC.test(url);
  const upload = url.includes('/storage/v1/object/') && method !== 'GET';
  const tries = safe ? 3 : 1;
  let lastError: unknown;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const outer = init?.signal;
    if (outer?.aborted) ctrl.abort();
    const onAbort = () => ctrl.abort();
    outer?.addEventListener?.('abort', onAbort);
    const timer = setTimeout(() => ctrl.abort(), upload ? 180_000 : 30_000);
    try {
      return await fetch(input, { ...init, signal: ctrl.signal });
    } catch (e) {
      lastError = e;
      if (outer?.aborted) throw e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener?.('abort', onAbort);
    }
  }
  throw lastError;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  global: { fetch: resilientFetch as unknown as typeof fetch },
  auth: {
    storage: AsyncStorage, // keeps the user logged in after the app is closed
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh the login token only while the app is open (recommended by Supabase for mobile).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Public URL of a profile picture stored in the "avatars" bucket. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return mediaUrl('avatars', path); // the phone's copy when saved for offline
}
