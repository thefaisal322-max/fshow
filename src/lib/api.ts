import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import * as ImageManipulator from 'expo-image-manipulator';

import { StringKey, tr } from '@/i18n';

import { supabase } from './supabase';

export type Gender = 'male' | 'female';

/** Row of public.profiles (see supabase/migrations). */
export type ProfileRow = {
  id: string;
  first_name: string;
  last_name: string;
  gender: Gender;
  username: string | null;
  bio: string;
  photo_path: string | null;
  is_fainet: boolean;
  profile_complete: boolean;
  followers_count: number;
  following_count: number;
  likes_count: number;
  posts_count: number;
  banned?: boolean;
};

/** Error with a stable `reason` code + optional details (remaining, wait, message). */
export class ApiError extends Error {
  constructor(
    public reason: string,
    public details: Record<string, any> = {},
  ) {
    super(reason);
  }
}

/** Calls an Edge Function (supabase/functions/<name>) and turns its errors into ApiError. */
async function callFn<T = { ok: boolean }>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError) {
    let payload: any = {};
    try {
      payload = await error.context.json();
    } catch {
      // not JSON
    }
    const { error: reason, ...details } = payload ?? {};
    throw new ApiError(reason ?? 'internal', details);
  }
  if (error instanceof FunctionsFetchError) throw new ApiError('network');
  throw new ApiError('internal');
}

/** Maps Supabase Auth / PostgREST errors to our reasons. */
function fromSupabase(error: { message?: string; code?: string; status?: number } | null): ApiError {
  const msg = error?.message ?? '';
  const code = error?.code ?? '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return new ApiError('invalid-credentials');
  if (code === 'over_request_rate_limit' || error?.status === 429) return new ApiError('rate-limited');
  if (code === 'user_banned') return new ApiError('account-disabled');
  for (const r of ['username-taken', 'username-invalid', 'invalid-input', 'unauthenticated', 'no-profile', 'already-opened', 'forbidden', 'rate-limited']) {
    if (msg.includes(r)) return new ApiError(r);
  }
  if (/fetch|network/i.test(msg)) return new ApiError('network');
  return new ApiError('internal');
}

export const api = {
  sendCode: (email: string, purpose: 'signup' | 'reset' | 'change') => callFn('send-code', { email, purpose }),

  signup: (data: {
    email: string;
    code: string;
    password: string;
    firstName: string;
    lastName: string;
    gender: Gender;
    birthday: string;
  }) => callFn('signup', data),

  resetPassword: (email: string, code: string, newPassword: string) =>
    callFn('reset-password', { email, code, newPassword }),

  async login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw fromSupabase(error);
  },

  async logout() {
    await supabase.auth.signOut();
  },

  async getProfile(uid: string): Promise<ProfileRow | null> {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) throw fromSupabase(error);
    return data as ProfileRow | null;
  },

  async claimUsername(username: string, bio: string): Promise<ProfileRow> {
    const { data, error } = await supabase.rpc('claim_username', { p_username: username, p_bio: bio });
    if (error) throw fromSupabase(error);
    return data as ProfileRow;
  },

  /** Edit own name + bio (only these + photo are editable; the database enforces it). */
  async updateProfile(uid: string, fields: { first_name?: string; last_name?: string; bio?: string }) {
    const { error } = await supabase.from('profiles').update(fields).eq('id', uid);
    if (error) throw fromSupabase(error);
  },

  /** Checks the current password, then sets a new one. */
  async changePassword(email: string, current: string, next: string) {
    const check = await supabase.auth.signInWithPassword({ email, password: current });
    if (check.error) throw new ApiError('invalid-credentials');
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) throw error.code === 'weak_password' || error.code === 'same_password' ? new ApiError('weak-password') : fromSupabase(error);
  },

  /** Step 2 of email change (step 1 is sendCode(newEmail, 'change')). */
  async changeEmail(newEmail: string, code: string) {
    const r = await callFn<{ ok: boolean; isFainet: boolean }>('change-email', { newEmail, code });
    await supabase.auth.refreshSession();
    return r;
  },

  async deleteAccount(password: string) {
    await callFn('delete-account', { password });
    await supabase.auth.signOut({ scope: 'local' });
  },

  /**
   * Resizes to 512×512 JPEG on the phone (this also removes EXIF / GPS location),
   * uploads to avatars/<uid>/<random>.jpg and saves the path on the profile.
   */
  async uploadAvatar(uid: string, localUri: string, oldPath: string | null): Promise<string> {
    const img = await ImageManipulator.manipulateAsync(localUri, [{ resize: { width: 512, height: 512 } }], {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const bytes = await (await fetch(img.uri)).arrayBuffer();
    if (bytes.byteLength > 5 * 1024 * 1024) throw new ApiError('image-too-big');

    const path = `${uid}/${Date.now().toString(36)}.jpg`;
    const up = await supabase.storage.from('avatars').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
    if (up.error) throw new ApiError(/size|large/i.test(up.error.message) ? 'image-too-big' : 'upload-failed');

    const { error } = await supabase.from('profiles').update({ photo_path: path }).eq('id', uid);
    if (error) throw fromSupabase(error);
    if (oldPath && oldPath !== path) await supabase.storage.from('avatars').remove([oldPath]);
    return path;
  },
};

/** Turns any error into a message in the current language. */
export function errorMessage(e: unknown): string {
  const err = e instanceof ApiError ? e : new ApiError('internal');
  const d = err.details;
  const map: Record<string, StringKey> = {
    'code-expired': 'e_code_expired',
    'too-many-attempts': 'e_too_many',
    'rate-limited': 'e_rate',
    'email-in-use': 'e_email_in_use',
    'weak-password': 'e_weak_password',
    'too-young': 'v_too_young',
    'username-taken': 'e_username_taken',
    'username-invalid': 'e_username_invalid',
    'invalid-credentials': 'e_invalid_credentials',
    'account-disabled': 'e_disabled',
    'image-too-big': 'e_image_big',
    'upload-failed': 'e_upload',
    'email-send-failed': 'e_email_send',
    unauthenticated: 'e_relogin',
    'no-profile': 'e_relogin',
    network: 'e_network',
    'video-too-long': 'e_video_long',
    'video-too-big': 'e_video_big',
    'already-opened': 'e_already_opened',
    forbidden: 'e_forbidden',
    blocked: 'blocked_me_banner',
    'no-messages': 'e_no_messages',
    'not-eligible': 'e_not_eligible',
  };
  if (err.reason === 'invalid-code') return d.remaining ? tr('e_invalid_code', { n: d.remaining }) : tr('e_invalid_code_plain');
  if (err.reason === 'resend-wait') return tr('e_wait', { n: d.wait ?? 60 });
  if (err.reason === 'invalid-input') return d.message && isCurrentLangPashto() ? d.message : tr('e_invalid_input');
  const key = map[err.reason];
  return key ? tr(key) : tr('e_generic');
}

// Server messages in `details.message` are Pashto; show them only when the app is in Pashto.
function isCurrentLangPashto() {
  return tr('next') === 'مخته';
}
