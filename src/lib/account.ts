import { ApiError } from './api';
import type { Conversation } from './chat';
import type { Author, Visibility } from './social';
import { supabase } from './supabase';

/** My privacy settings + extra profile details (columns of public.profiles). */
export type AccountSettings = {
  who_can_message: 'everyone' | 'followers' | 'nobody';
  searchable: boolean;
  default_visibility: Visibility;
  city: string;
  hometown: string;
  work: string;
  education: string;
  website: string;
};

export type FriendRequest = Author & { requested_at: string; mutual: number };

export type CreatorStats = {
  followers: number;
  views: number;
  likes: number;
  posts: number;
  reels: number;
  verified: boolean;
  need_followers: number;
  need_views: number;
  monetize: 'pending' | 'approved' | 'rejected' | null;
  verify: 'pending' | 'approved' | 'rejected' | null;
};

function check<T>(res: { data: T | null; error: { message?: string } | null }): T {
  if (res.error) {
    const msg = res.error.message ?? '';
    for (const r of ['not-eligible', 'no-messages', 'forbidden', 'invalid-input', 'unauthenticated', 'rate-limited']) {
      if (msg.includes(r)) throw new ApiError(r);
    }
    if (/fetch|network|abort/i.test(msg)) throw new ApiError('network');
    if (/website|check constraint/i.test(msg)) throw new ApiError('invalid-input');
    throw new ApiError('internal', { message: msg });
  }
  return res.data as T;
}

const FIELDS = 'who_can_message, searchable, default_visibility, city, hometown, work, education, website';

export const account = {
  settings: async (uid: string) =>
    check<AccountSettings>(await supabase.from('profiles').select(FIELDS).eq('id', uid).single()),
  save: async (uid: string, fields: Partial<AccountSettings>) => {
    check(await supabase.from('profiles').update(fields).eq('id', uid));
  },
  /** Put all my old posts on the same privacy. Returns how many changed. */
  allPostsVisibility: async (v: Visibility) => check<number>(await supabase.rpc('set_all_posts_visibility', { p_visibility: v })) ?? 0,

  counts: async () => check<{ messages: number; friends: number } | null>(await supabase.rpc('request_counts')) ?? { messages: 0, friends: 0 },
  messageRequests: async () => check<Conversation[]>(await supabase.rpc('get_message_requests')) ?? [],
  acceptMessage: async (convId: string) => {
    check(await supabase.rpc('accept_message_request', { p_conv: convId }));
  },
  deleteMessageRequest: async (convId: string) => {
    check(await supabase.rpc('delete_chat_for_me', { p_conv: convId }));
  },
  friendRequests: async () => check<FriendRequest[]>(await supabase.rpc('get_friend_requests')) ?? [],
  dismissFriend: async (userId: string) => {
    check(await supabase.rpc('dismiss_friend_request', { p_user: userId }));
  },

  creatorStats: async () => check<CreatorStats | null>(await supabase.rpc('get_creator_stats')),
  applyFor: async (kind: 'monetize' | 'verify') => check<string>(await supabase.rpc('apply_for', { p_kind: kind })),
};
