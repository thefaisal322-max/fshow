import * as ImageManipulator from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Share } from 'react-native';

import { StringKey, tr } from '@/i18n';

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
  video_path: string | null;
  /** small JPG cover of a video (made on the phone when posting) */
  thumb_path?: string | null;
  location: string | null;
  feeling: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
  saves_count: number;
  shares_count: number;
  views_count: number;
  boosted: boolean;
  liked: boolean;
  saved: boolean;
  visibility?: Visibility;
  edited?: boolean;
  /** I follow the author */
  following?: boolean;
  feedback?: Feedback | null;
  author: Author;
  /** When this post is a repost: a small preview of the original. */
  shared: PostPreview | null;
};

export type Visibility = 'public' | 'friends' | 'private';
export type Feedback = 'interested' | 'not_interested' | 'hide';
export type TrendingTag = { tag: string; count: number };

export type PostPreview = {
  id: string;
  body: string;
  image_path: string | null;
  video_path: string | null;
  created_at: string;
  author: Author;
};

export type Comment = {
  id: string;
  body: string;
  created_at: string;
  can_delete: boolean;
  likes_count: number;
  liked: boolean;
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
  blocked_by_me: boolean;
  blocked_me: boolean;
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
    for (const r of ['rate-limited', 'forbidden', 'invalid-input', 'blocked']) if (msg.includes(r)) throw new ApiError(r);
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
  reels: async (offset = 0, mode: 'foryou' | 'following' = 'foryou') =>
    check<Post[]>(await supabase.rpc('get_reels', { p_offset: offset, p_limit: 10, p_mode: mode })) ?? [],
  tagPosts: async (tag: string, offset = 0) =>
    check<Post[]>(await supabase.rpc('get_tag_posts', { p_tag: tag, p_offset: offset, p_limit: PAGE })) ?? [],
  trendingTags: async () => check<TrendingTag[]>(await supabase.rpc('get_trending_tags', { p_limit: 15 })) ?? [],
  feed: async (mode: 'foryou' | 'following', offset = 0) =>
    check<Post[]>(await supabase.rpc('get_feed', { p_mode: mode, p_offset: offset, p_limit: PAGE })) ?? [],
  /** kind: all / posts (no video) / reels (videos) — the profile tabs */
  userPosts: async (userId: string, offset = 0, kind: 'all' | 'posts' | 'reels' = 'all', limit = PAGE) =>
    check<Post[]>(await supabase.rpc('get_user_posts', { p_user: userId, p_offset: offset, p_limit: limit, p_kind: kind })) ?? [],
  savedPosts: async (offset = 0) =>
    check<Post[]>(await supabase.rpc('get_saved_posts', { p_offset: offset, p_limit: PAGE })) ?? [],
  post: async (id: string) => check<Post | null>(await supabase.rpc('get_post', { p_post: id })),
  comments: async (postId: string) =>
    check<Comment[]>(await supabase.rpc('get_comments', { p_post: postId, p_offset: 0, p_limit: 100 })) ?? [],
  profile: async (userId: string) => check<UserProfile | null>(await supabase.rpc('get_profile', { p_user: userId })),
  /** Posts and reels whose text, #hashtags or author name match. kind: all / posts / reels */
  searchPosts: async (q: string, kind: 'all' | 'posts' | 'reels' = 'all', offset = 0, limit = PAGE) =>
    check<Post[]>(await supabase.rpc('search_posts', { p_query: q, p_kind: kind, p_offset: offset, p_limit: limit })) ?? [],
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
    const text = [post.body, postImageUrl(post.image_path ?? post.video_path)].filter(Boolean).join('\n\n');
    const res = await Share.share({ message: `${name} — Faisal Show\n\n${text}` });
    if (res.action === Share.sharedAction) await supabase.rpc('record_share', { p_post: post.id });
  },
  comment: async (postId: string, body: string) => {
    check(await supabase.from('comments').insert({ post_id: postId, body: body.trim() }));
  },
  heartComment: async (id: string, on: boolean, uid: string) => {
    if (on) {
      const r = await supabase.from('comment_likes').insert({ comment_id: id });
      if (r.error && r.error.code !== '23505') check(r);
    } else check(await supabase.from('comment_likes').delete().eq('comment_id', id).eq('user_id', uid));
  },
  /** Share to my feed (repost), optionally with my own text. */
  repost: async (postId: string, body = '') => {
    check(await supabase.from('posts').insert({ shared_post_id: postId, body: body.trim() }));
  },
  /** Send a post into a chat. */
  sendToChat: async (convId: string, postId: string) => {
    check(await supabase.from('messages').insert({ conversation_id: convId, post_id: postId, body: '' }));
  },
  /** Interested / Not interested / Hide from my feed (null = undo). */
  feedback: async (postId: string, kind: Feedback | null) => {
    check(await supabase.rpc('set_post_feedback', { p_post: postId, p_kind: kind }));
  },
  /** Change my post's text and/or who can see it. */
  updatePost: async (postId: string, fields: { body?: string; visibility?: Visibility }) => {
    check(await supabase.rpc('update_post', { p_post: postId, p_body: fields.body ?? null, p_visibility: fields.visibility ?? null }));
  },
  block: async (userId: string, on: boolean) => {
    check(await supabase.rpc(on ? 'block_user' : 'unblock_user', { p_user: userId }));
  },
  deleteComment: async (id: string) => {
    check(await supabase.from('comments').delete().eq('id', id));
  },
  report: async (target: { postId?: string; userId?: string }, reason: string) => {
    check(await supabase.from('reports').insert({ post_id: target.postId ?? null, user_id: target.userId ?? null, reason }));
  },

  /**
   * Creates a post with optional photo OR video, location and feeling.
   * Photos are resized to max 1080 px JPEG on the phone (also strips EXIF/GPS).
   * Videos must be ≤ 60 s and ≤ 25 MB (checked here and by the storage bucket).
   */
  createPost: async (
    uid: string,
    input: { body: string; image?: string | null; video?: { uri: string; duration?: number | null; size?: number | null; mime?: string | null } | null; location?: string | null; feeling?: string | null; visibility?: Visibility },
  ) => {
    let imagePath: string | null = null;
    let videoPath: string | null = null;
    let thumbPath: string | null = null;
    const name = () => `${uid}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    if (input.image) {
      const img = await ImageManipulator.manipulateAsync(input.image, [{ resize: { width: 1080 } }], {
        compress: 0.75,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const bytes = await (await fetch(img.uri)).arrayBuffer();
      if (bytes.byteLength > 8 * 1024 * 1024) throw new ApiError('image-too-big');
      imagePath = `${name()}.jpg`;
      const up = await supabase.storage.from('posts').upload(imagePath, bytes, { contentType: 'image/jpeg' });
      if (up.error) throw new ApiError('upload-failed');
    } else if (input.video) {
      if (input.video.duration && input.video.duration > 61_000) throw new ApiError('video-too-long');
      const bytes = await (await fetch(input.video.uri)).arrayBuffer();
      if (bytes.byteLength > 25 * 1024 * 1024) throw new ApiError('video-too-big');
      const mime = input.video.mime && input.video.mime.startsWith('video/') ? input.video.mime : 'video/mp4';
      videoPath = `${name()}.${mime === 'video/quicktime' ? 'mov' : mime === 'video/3gpp' ? '3gp' : mime === 'video/webm' ? 'webm' : 'mp4'}`;
      const up = await supabase.storage.from('posts').upload(videoPath, bytes, { contentType: mime });
      if (up.error) throw new ApiError(/size|large/i.test(up.error.message) ? 'video-too-big' : 'upload-failed');
      thumbPath = await uploadThumb(input.video.uri, `${name()}.jpg`);
    }
    const r = await supabase.from('posts').insert({
      body: input.body.trim(),
      image_path: imagePath,
      video_path: videoPath,
      thumb_path: thumbPath,
      location: input.location?.trim() || null,
      feeling: input.feeling || null,
      visibility: input.visibility ?? 'public',
    });
    if (r.error) {
      const files = [imagePath, videoPath, thumbPath].filter(Boolean) as string[];
      if (files.length) await supabase.storage.from('posts').remove(files);
      check(r);
    }
  },
  deletePost: async (post: Post) => {
    check(await supabase.from('posts').delete().eq('id', post.id));
    const files = [post.image_path, post.video_path, post.thumb_path].filter(Boolean) as string[];
    if (files.length) await supabase.storage.from('posts').remove(files);
  },
};

/** Cover picture of a video (frame at 0.5 s, 480 px wide). If it fails the post is made without one. */
async function uploadThumb(videoUri: string, path: string): Promise<string | null> {
  try {
    const frame = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 500, quality: 0.8 });
    const img = await ImageManipulator.manipulateAsync(frame.uri, [{ resize: { width: 480 } }], {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const bytes = await (await fetch(img.uri)).arrayBuffer();
    const up = await supabase.storage.from('posts').upload(path, bytes, { contentType: 'image/jpeg' });
    return up.error ? null : path;
  } catch {
    return null;
  }
}

/** Relative time ("5 min ago") in the current language. */
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return tr('time_now');
  if (s < 3600) return tr('time_min', { n: Math.floor(s / 60) });
  if (s < 86400) return tr('time_hour', { n: Math.floor(s / 3600) });
  if (s < 7 * 86400) return tr('time_day', { n: Math.floor(s / 86400) });
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

export const FEELINGS = [
  { code: 'happy', emoji: '😊' },
  { code: 'loved', emoji: '😍' },
  { code: 'sad', emoji: '😢' },
  { code: 'cool', emoji: '😎' },
  { code: 'thinking', emoji: '🤔' },
  { code: 'tired', emoji: '😴' },
  { code: 'party', emoji: '🥳' },
  { code: 'thankful', emoji: '🙏' },
  { code: 'angry', emoji: '😡' },
  { code: 'sick', emoji: '🤒' },
] as const;

/** Feelings are stored as a code ("happy") and shown in the reader's language. */
export function feelingLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const f = FEELINGS.find((x) => x.code === code);
  if (!f) return code;
  return `${f.emoji} ${tr(`f_${f.code}` as StringKey)}`;
}

export function videoUrl(path: string | null | undefined): string | null {
  return postImageUrl(path);
}

/** Link that opens the post in the app (fshow:// is the app's own link scheme). */
export function postLink(id: string): string {
  return `fshow://post/${id}`;
}

/** True when a text is only emojis (shown big, like a sticker). Works without Unicode regex support. */
export function isEmojiOnly(text: string): boolean {
  const chars = Array.from(text.replace(/\s/g, ''));
  if (chars.length === 0 || chars.length > 12) return false;
  return chars.every((ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x200d || cp === 0xfe0f) return true; // joiner / emoji style
    if (cp >= 0x3000 && cp <= 0xffef) return false; // CJK etc.
    return cp >= 0x2190; // arrows, symbols, dingbats and all emoji planes
  });
}

/** Splits text into plain parts, #hashtags (English, digits, _ and Pashto/Dari letters) and @mentions. */
export function splitTags(text: string): { text: string; tag?: string; mention?: string }[] {
  const out: { text: string; tag?: string; mention?: string }[] = [];
  const re = /#([0-9A-Za-z_\u0600-\u06FF]{1,50})|@([A-Za-z0-9._]{3,20})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    // "name@mail.com" is an email, not a mention
    if (m[2] && m.index > 0 && /[A-Za-z0-9._]/.test(text[m.index - 1])) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[1]) out.push({ text: m[0], tag: m[1].toLowerCase() });
    else out.push({ text: m[0], mention: m[2].toLowerCase().replace(/\.+$/, '') });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Finds the profile id for @username (null if there is no such person). */
export async function userIdByUsername(username: string): Promise<string | null> {
  const { data } = await supabase.rpc('user_id_by_username', { p_username: username });
  return (data as string | null) ?? null;
}
