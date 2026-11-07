import * as ImageManipulator from 'expo-image-manipulator';

import { ApiError } from './api';
import type { Author } from './social';
import { supabase } from './supabase';

export type Story = {
  id: string;
  media_path: string;
  media_type: 'image' | 'video';
  caption: string;
  created_at: string;
  seen: boolean;
  views_count: number | null; // only for my own stories
};

export type StoryRing = { author: Author; all_seen: boolean; stories: Story[] };

export type SuggestedPerson = Author & { followers_count: number; mutual: number; follows_me: boolean; is_new: boolean };

/** Rings currently loaded on the home screen — the story viewer reads them from here. */
export const storyStore: { rings: StoryRing[] } = { rings: [] };

export function storyUrl(path: string): string {
  return supabase.storage.from('posts').getPublicUrl(path).data.publicUrl;
}

function check<T>(res: { data: T | null; error: { message?: string } | null }): T {
  if (res.error) {
    const msg = res.error.message ?? '';
    if (msg.includes('rate-limited')) throw new ApiError('rate-limited');
    if (/fetch|network/i.test(msg)) throw new ApiError('network');
    throw new ApiError('internal', { message: msg });
  }
  return res.data as T;
}

export const stories = {
  rings: async () => check<StoryRing[]>(await supabase.rpc('get_stories')) ?? [],
  view: async (id: string) => {
    await supabase.rpc('record_story_view', { p_story: id });
  },
  viewers: async (id: string) => check<(Author & { viewed_at: string })[]>(await supabase.rpc('get_story_viewers', { p_story: id })) ?? [],
  remove: async (s: Story) => {
    check(await supabase.from('stories').delete().eq('id', s.id));
    await supabase.storage.from('posts').remove([s.media_path]);
  },
  /** Photo is resized on the phone; video must be ≤ 60 s and ≤ 25 MB. */
  create: async (uid: string, media: { uri: string; type: 'image' | 'video'; mime?: string | null; duration?: number | null }) => {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    let path: string;
    let bytes: ArrayBuffer;
    let contentType: string;
    if (media.type === 'image') {
      const img = await ImageManipulator.manipulateAsync(media.uri, [{ resize: { width: 1080 } }], {
        compress: 0.75,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      bytes = await (await fetch(img.uri)).arrayBuffer();
      path = `${uid}/stories/${id}.jpg`;
      contentType = 'image/jpeg';
    } else {
      if (media.duration && media.duration > 61_000) throw new ApiError('video-too-long');
      bytes = await (await fetch(media.uri)).arrayBuffer();
      if (bytes.byteLength > 25 * 1024 * 1024) throw new ApiError('video-too-big');
      contentType = media.mime && media.mime.startsWith('video/') ? media.mime : 'video/mp4';
      path = `${uid}/stories/${id}.${contentType === 'video/quicktime' ? 'mov' : 'mp4'}`;
    }
    const up = await supabase.storage.from('posts').upload(path, bytes, { contentType });
    if (up.error) throw new ApiError('upload-failed');
    const r = await supabase.from('stories').insert({ media_path: path, media_type: media.type });
    if (r.error) {
      await supabase.storage.from('posts').remove([path]);
      check(r);
    }
  },
  suggestions: async () => check<SuggestedPerson[]>(await supabase.rpc('suggest_people', { p_limit: 15 })) ?? [],
};
