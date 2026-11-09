import { ApiError } from './api';
import type { Author } from './social';
import { supabase } from './supabase';

export type FriendStatus = 'friends' | 'sent' | 'received' | 'none';
export type Friend = Author & { last_seen_at: string | null; online: boolean; friends_since: string };
export type SentRequest = Author & { requested_at: string };
export type FriendCounts = { friends: number; online: number; requests: number };

function check<T>(res: { data: T | null; error: { message?: string } | null }): T {
  if (res.error) {
    const msg = res.error.message ?? '';
    for (const r of ['blocked', 'rate-limited', 'invalid-input', 'unauthenticated']) if (msg.includes(r)) throw new ApiError(r);
    if (/fetch|network|abort/i.test(msg)) throw new ApiError('network');
    throw new ApiError('internal', { message: msg });
  }
  return res.data as T;
}

/** Friends = people who follow each other. A friend request, once accepted, makes both follow each other. */
export const friends = {
  send: async (userId: string) => check<FriendStatus>(await supabase.rpc('send_friend_request', { p_to: userId })),
  cancel: async (userId: string) => {
    check(await supabase.rpc('cancel_friend_request', { p_to: userId }));
  },
  respond: async (userId: string, accept: boolean) =>
    check<FriendStatus>(await supabase.rpc('respond_friend_request', { p_from: userId, p_accept: accept })),
  unfriend: async (userId: string) => {
    check(await supabase.rpc('unfriend', { p_user: userId }));
  },
  list: async (userId?: string, offset = 0) =>
    check<Friend[]>(await supabase.rpc('get_friends', { p_user: userId ?? null, p_offset: offset, p_limit: 50 })) ?? [],
  sent: async () => check<SentRequest[]>(await supabase.rpc('get_sent_friend_requests')) ?? [],
  counts: async () => check<FriendCounts | null>(await supabase.rpc('get_friend_counts')) ?? { friends: 0, online: 0, requests: 0 },
};

/** "6w", "3d", "5h" — short age like Facebook's friend requests. */
export function shortAge(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  if (s < 365 * 86400) return `${Math.floor(s / (7 * 86400))}w`;
  return `${Math.floor(s / (365 * 86400))}y`;
}
