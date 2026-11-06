import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import * as ImageManipulator from 'expo-image-manipulator';

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
  for (const r of ['username-taken', 'username-invalid', 'invalid-input', 'unauthenticated', 'no-profile']) {
    if (msg.includes(r)) return new ApiError(r);
  }
  if (/fetch|network/i.test(msg)) return new ApiError('network');
  return new ApiError('internal');
}

export const api = {
  sendCode: (email: string, purpose: 'signup' | 'reset') => callFn('send-code', { email, purpose }),

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

/** Turns any error into a Pashto message for the user. */
export function errorMessage(e: unknown): string {
  const err = e instanceof ApiError ? e : new ApiError('internal');
  const d = err.details;
  switch (err.reason) {
    case 'invalid-code':
      return d.remaining ? `کوډ غلط دی. ${d.remaining} هڅې پاتې دي` : 'کوډ غلط دی';
    case 'code-expired':
      return 'کوډ ختم شوی. نوی کوډ وغواړئ';
    case 'too-many-attempts':
      return 'ډېرې غلطې هڅې وشوې. نوی کوډ وغواړئ';
    case 'resend-wait':
      return `لطفاً ${d.wait ?? 60} ثانیې صبر وکړئ`;
    case 'rate-limited':
      return 'ډېرې هڅې وشوې. لږ وروسته بیا هڅه وکړئ';
    case 'email-in-use':
      return 'دا ایمیل مخکې ثبت شوی. Login وکړئ';
    case 'weak-password':
      return 'پاسورډ کمزوری دی';
    case 'too-young':
      return 'د حساب جوړولو لپاره باید لږ تر لږه ۱۳ کلن یاست';
    case 'username-taken':
      return 'دا ID Name بل چا اخیستی';
    case 'username-invalid':
      return 'ID Name سم نه دی';
    case 'invalid-credentials':
      return 'ایمیل یا پاسورډ غلط دی';
    case 'account-disabled':
      return 'دا حساب بند شوی';
    case 'image-too-big':
      return 'عکس ډېر لوی دی (تر 5MB کم)';
    case 'upload-failed':
      return 'عکس پورته نه شو. بیا هڅه وکړئ';
    case 'email-send-failed':
      return 'ایمیل ونه لېږل شو. بیا هڅه وکړئ';
    case 'invalid-input':
      return d.message ?? 'معلومات سم نه دي';
    case 'unauthenticated':
    case 'no-profile':
      return 'بیا Login وکړئ';
    case 'network':
      return 'سرور ته نه رسېږو. انټرنېټ وګورئ او بیا هڅه وکړئ';
    default:
      return 'یوه ستونزه پېښه شوه. بیا هڅه وکړئ';
  }
}
