import * as ImageManipulator from 'expo-image-manipulator';
import { Share } from 'react-native';

import { ApiError } from './api';
import { supabase } from './supabase';

export type Author = {
  id: string;
  first_name: string;
  last_name: string;
  username: string | null;
  photo_path: string | null;
  is_fainet: boolean;
};

export type Post = {
  id: string;
  body: string;
  image_path: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  shares_count: number;
  views_count: number;
  boosted: boolean;
  liked: boolean;
  saved: boolean;
  author: Author;
};

export type Comment = {
  id: string;
  body: string;
  created_at: string;
  can_delete: boolean;
  author: Author;
};

export type UserProfile = {
  id: string;
  first_name: string;
  last_name: string;
  username: string | null;
  bio: string;
  photo_path: string | null;
  is_fainet: boolean;
  followers_count: number;
  following_count: number;
  likes_count: number;
  posts_count: number;
  followed_by_me: boolean;
  follows_me: boolean;
};

export type SearchResult = Author & { followers_count: number; followed_by_me: boolean };

export type Notification = {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'mention';
  read: boolean;
  created_at: string;
  post_id: string | null;
  post_body: string | null;
  post_image: string | null;
  comment_body: string | null;
  actor: Author;
};

export const PAGE = 20;

function check<T>(res: { data: T | null; error: { message?: string } | null }): T {
  if (res.error) {
    const msg = res.error.message ?? '';
    if (msg.includes('rate-limited')) throw new ApiError('rate-limited');
    if (/fetch|network/i.test(msg)) throw new ApiError('network');
    throw new ApiError('internal', { message: msg });
  }
  return res.data as T;
}

export function postImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('posts').getPublicUrl(path).data.publicUrl;
}

export const social = {
  // ── reading ──
  feed: async (mode: 'foryou' | 'following', offset = 0) =>
    check<Post[]>(await supabase.rpc('get_feed', { p_mode: mode, p_offset: offset, p_limit: PAGE })) ?? [],
  userPosts: async (userId: string, offset = 0) =>
    check<Post[]>(await supabase.rpc('get_user_posts', { p_user: userId, p_offset: offset, p_limit: PAGE })) ?? [],
  savedPosts: async (offset = 0) =>
    check<Post[]>(await supabase.rpc('get_saved_posts', { p_offset: offset, p_limit: PAGE })) ?? [],
  post: async (id: string) => check<Post | null>(await supabase.rpc('get_post', { p_post: id })),
  comments: async (postId: string) =>
    check<Comment[]>(await supabase.rpc('get_comments', { p_post: postId, p_offset: 0, p_limit: 100 })) ?? [],
  profile: async (userId: string) => check<UserProfile | null>(await supabase.rpc('get_profile', { p_user: userId })),
  search: async (q: string) => check<SearchResult[]>(await supabase.rpc('search_profiles', { p_query: q, p_limit: 30 })) ?? [],
  notifications: async (offset = 0) =>
    check<Notification[]>(await supabase.rpc('get_notifications', { p_offset: offset, p_limit: 30 })) ?? [],
  unreadCount: async () => check<number>(await supabase.rpc('unread_notifications')) ?? 0,
  markRead: async () => {
    check(await supabase.rpc('mark_notifications_read'));
  },

  // ── writing (counters are updated by the server) ──
  like: async (postId: string, on: boolean) => {
    if (on) {
      const r = await supabase.from('post_likes').insert({ post_id: postId });
      if (r.error && r.error.code !== '23505') check(r);
    } else check(await supabase.from('post_likes').delete().eq('post_id', postId));
  },
  save: async (postId: string, on: boolean, uid: string) => {
    if (on) {
      const r = await supabase.from('post_saves').insert({ post_id: postId });
      if (r.error && r.error.code !== '23505') check(r);
    } else check(await supabase.from('post_saves').delete().eq('post_id', postId).eq('user_id', uid));
  },
  follow: async (userId: string, on: boolean, me: string) => {
    if (on) {
      const r = await supabase.from('follows').insert({ followee_id: userId });
      if (r.error && r.error.code !== '23505') check(r);
    } else check(await supabase.from('follows').delete().eq('follower_id', me).eq('followee_id', userId));
  },
  view: async (postId: string) => {
    await supabase.rpc('record_view', { p_post: postId });
  },
  share: async (post: Post) => {
    const name = post.author.username ? `@${post.author.username}` : `${post.author.first_name} ${post.author.last_name}`;
    const text = [post.body, postImageUrl(post.image_path)].filter(Boolean).join('\n\n');
    const res = await Share.share({ message: `${name} — Faisal Show\n\n${text}` });
    if (res.action === Share.sharedAction) await supabase.rpc('record_share', { p_post: post.id });
  },
  comment: async (postId: string, body: string) => {
    check(await supabase.from('comments').insert({ post_id: postId, body: body.trim() }));
  },
  deleteComment: async (id: string) => {
    check(await supabase.from('comments').delete().eq('id', id));
  },
  report: async (target: { postId?: string; userId?: string }, reason: string) => {
    check(await supabase.from('reports').insert({ post_id: target.postId ?? null, user_id: target.userId ?? null, reason }));
  },

  /** Creates a post. The image is resized to max 1080 px JPEG on the phone (also strips EXIF/GPS). */
  createPost: async (uid: string, body: string, localImage: string | null) => {
    let imagePath: string | null = null;
    if (localImage) {
      const img = await ImageManipulator.manipulateAsync(localImage, [{ resize: { width: 1080 } }], {
        compress: 0.75,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const bytes = await (await fetch(img.uri)).arrayBuffer();
      if (bytes.byteLength > 8 * 1024 * 1024) throw new ApiError('image-too-big');
      imagePath = `${uid}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
      const up = await supabase.storage.from('posts').upload(imagePath, bytes, { contentType: 'image/jpeg' });
      if (up.error) throw new ApiError('upload-failed');
    }
    const r = await supabase.from('posts').insert({ body: body.trim(), image_path: imagePath });
    if (r.error) {
      if (imagePath) await supabase.storage.from('posts').remove([imagePath]);
      check(r);
    }
  },
  deletePost: async (post: Post) => {
    check(await supabase.from('posts').delete().eq('id', post.id));
    if (post.image_path) await supabase.storage.from('posts').remove([post.image_path]);
  },
};

/** "5 دقیقې مخکې" style relative time in Pashto. */
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'همدا اوس';
  if (s < 3600) return `${Math.floor(s / 60)} دقیقې مخکې`;
  if (s < 86400) return `${Math.floor(s / 3600)} ساعته مخکې`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} ورځې مخکې`;
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

export function authorName(a: Pick<Author, 'first_name' | 'last_name'>): string {
  return `${a.first_name} ${a.last_name}`;
}
