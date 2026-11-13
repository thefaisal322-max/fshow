import { useEffect, useState } from 'react';

import { ApiError } from './api';
import { useAuth } from './auth-context';
import type { Author } from './social';
import { supabase } from './supabase';

export type Overview = {
  users: number;
  users_today: number;
  online: number;
  posts: number;
  reels: number;
  banned: number;
  reports: number;
  proofs: number;
  monetize: number;
  payouts: number;
  codes_today: number;
};
export type AdminUser = Author & {
  email: string | null;
  created_at: string;
  last_seen_at: string | null;
  followers: number;
  bonus_followers: number;
  posts: number;
  banned: boolean;
  verified: boolean;
  monetize: string | null;
};
export type CodeUse = { id: number; kind: string; amount: number; post_id: string | null; created_at: string; actor: Author | null; target: Author | null };
export type MonetizeRequest = Author & { phone: string; status: string; requested_at: string; email: string | null; followers: number; reels: number };
export type Report = {
  id: string;
  reason: string;
  created_at: string;
  reporter: Author | null;
  user: Author | null;
  post: { id: string; body: string; image_path: string | null; video_path: string | null } | null;
};

function check<T>(res: { data: T | null; error: { message?: string } | null }): T {
  if (res.error) {
    const msg = res.error.message ?? '';
    if (msg.includes('forbidden')) throw new ApiError('forbidden');
    if (/fetch|network|abort/i.test(msg)) throw new ApiError('network');
    throw new ApiError('internal', { message: msg });
  }
  return res.data as T;
}

/** Admin-only tools (the server checks the admin emails on every call). */
export const adminApi = {
  isAdmin: async () => check<boolean>(await supabase.rpc('am_i_admin')) === true,
  overview: async () => check<Overview>(await supabase.rpc('admin_overview')),
  users: async (q = '', offset = 0) => check<AdminUser[]>(await supabase.rpc('admin_users', { p_query: q, p_offset: offset })) ?? [],
  codeUses: async (offset = 0) => check<CodeUse[]>(await supabase.rpc('admin_code_uses', { p_offset: offset })) ?? [],
  monetizeRequests: async () => check<MonetizeRequest[]>(await supabase.rpc('admin_monetize_requests')) ?? [],
  setMonetize: async (userId: string, approve: boolean) => {
    check(await supabase.rpc('admin_set_monetize', { p_user: userId, p_approve: approve }));
  },
  reports: async () => check<Report[]>(await supabase.rpc('admin_reports')) ?? [],
  resolveReport: async (id: string, deletePost: boolean) => {
    check(await supabase.rpc('admin_resolve_report', { p_report: id, p_delete_post: deletePost }));
  },
  setVerified: async (userId: string, on: boolean) => {
    check(await supabase.rpc('admin_set_verified', { p_user: userId, p_verified: on }));
  },
  resetFakes: async (userId: string) => {
    check(await supabase.rpc('admin_reset_fakes', { p_user: userId }));
  },
  /** ban / unban / delete — through an Edge Function because it changes the login too. */
  userAction: async (userId: string, action: 'ban' | 'unban' | 'delete') => {
    const { error } = await supabase.functions.invoke('admin-user', { body: { userId, action } });
    if (error) throw new ApiError('forbidden');
  },
};

let cached: { uid: string; admin: boolean } | null = null;

/** true only for the admin accounts (checked once per login). */
export function useIsAdmin(): boolean {
  const { session, profile } = useAuth();
  const uid = session?.user.id ?? '';
  const [admin, setAdmin] = useState(cached?.uid === uid ? cached.admin : false);
  useEffect(() => {
    if (!uid || !profile?.profileComplete) {
      setAdmin(false);
      return;
    }
    if (cached?.uid === uid) {
      setAdmin(cached.admin);
      return;
    }
    adminApi
      .isAdmin()
      .then((a) => {
        cached = { uid, admin: a };
        setAdmin(a);
      })
      .catch(() => {});
  }, [uid, profile?.profileComplete]);
  return admin;
}
