import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';

import { SUPABASE_URL } from '@/config/supabase.config';

/**
 * Offline mode.
 *  • The last Home feed, Reels, profiles and Saved lists are kept on the phone (AsyncStorage).
 *  • Pictures and up to MAX_VIDEOS videos from them are downloaded into the app folder,
 *    so they open without internet (and load faster with internet, using less data).
 *  • When the internet is gone, the lists come from the phone and a small "Offline" bar is shown.
 */

const DIR = `${FileSystem.documentDirectory}offline/`;
const MAX_FILES = 160;
const MAX_VIDEOS = 8;
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;

type Bucket = 'posts' | 'avatars';
const keyOf = (bucket: Bucket, path: string) => `${bucket}__${path.replace(/\//g, '__')}`;

/** Names of the files already on the phone (loaded once when the app starts). */
const have = new Set<string>();
let ready = false;
const readyWaiters: (() => void)[] = [];

(async () => {
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    for (const name of await FileSystem.readDirectoryAsync(DIR)) if (!name.endsWith('.part')) have.add(name);
  } catch {
    // no offline files — fine
  }
  ready = true;
  readyWaiters.splice(0).forEach((f) => f());
})();

function whenReady(): Promise<void> {
  return ready ? Promise.resolve() : new Promise((r) => readyWaiters.push(r));
}

/** Local file if it was saved for offline, else the normal internet address. */
export function mediaUrl(bucket: Bucket, path: string): string {
  const k = keyOf(bucket, path);
  if (have.has(k)) return DIR + k;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

// ───────────────────────── online / offline state ─────────────────────────
let offline = false;
const listeners = new Set<(v: boolean) => void>();

export function setOffline(v: boolean) {
  if (v === offline) return;
  offline = v;
  listeners.forEach((f) => f(v));
}

/** true while the app is showing saved (offline) content. */
export function useOffline(): boolean {
  const [v, setV] = useState(offline);
  useEffect(() => {
    listeners.add(setV);
    setV(offline);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}

// ───────────────────────── saved lists ─────────────────────────
export async function saveList(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(`offline:${key}`, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // storage full — not important
  }
}

export async function readList<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`offline:${key}`);
    return raw ? (JSON.parse(raw).data as T) : null;
  } catch {
    return null;
  }
}

/**
 * Runs a list request. With internet: returns it and keeps a copy (first page only).
 * Without internet: returns the copy and switches to offline mode.
 */
export async function withOffline<T>(key: string, firstPage: boolean, run: () => Promise<T>, onSaved?: (data: T) => void): Promise<T> {
  try {
    const data = await run();
    setOffline(false);
    if (firstPage) {
      saveList(key, data);
      onSaved?.(data);
    }
    return data;
  } catch (e: any) {
    if (e?.reason === 'network' || /network|fetch|abort/i.test(String(e?.message ?? ''))) {
      const saved = firstPage ? await readList<T>(key) : null;
      setOffline(true);
      if (saved) return saved;
      if (!firstPage) return [] as unknown as T; // no more pages while offline
    }
    throw e;
  }
}

// ───────────────────────── downloading media ─────────────────────────
type Job = { bucket: Bucket; path: string; video?: boolean };
const queue: Job[] = [];
let running = false;

type MediaPost = {
  image_path?: string | null;
  video_path?: string | null;
  thumb_path?: string | null;
  author?: { photo_path?: string | null } | null;
};

/** Saves pictures (and some videos) of these posts for offline, in the background. */
export function keepForOffline(posts: MediaPost[], videos = 4) {
  let v = 0;
  for (const p of posts.slice(0, 25)) {
    if (p.author?.photo_path) queue.push({ bucket: 'avatars', path: p.author.photo_path });
    if (p.image_path) queue.push({ bucket: 'posts', path: p.image_path });
    if (p.thumb_path) queue.push({ bucket: 'posts', path: p.thumb_path });
    if (p.video_path && v < videos) {
      queue.push({ bucket: 'posts', path: p.video_path, video: true });
      v++;
    }
  }
  run();
}

async function run() {
  if (running) return;
  running = true;
  await whenReady();
  try {
    while (queue.length) {
      const job = queue.shift()!;
      const k = keyOf(job.bucket, job.path);
      if (have.has(k)) continue;
      if (job.video && [...have].filter((n) => /\.(mp4|mov|3gp|webm)$/i.test(n)).length >= MAX_VIDEOS) await dropOldest(true);
      const tmp = `${DIR}${k}.part`;
      try {
        const url = `${SUPABASE_URL}/storage/v1/object/public/${job.bucket}/${job.path}`;
        const r = await FileSystem.downloadAsync(url, tmp);
        const info = await FileSystem.getInfoAsync(tmp);
        if (r.status !== 200 || !info.exists || (job.video && (info.size ?? 0) > MAX_VIDEO_BYTES)) {
          await FileSystem.deleteAsync(tmp, { idempotent: true });
          if (r.status === 0) break; // no internet — try again next time
          continue;
        }
        await FileSystem.moveAsync({ from: tmp, to: DIR + k });
        have.add(k);
      } catch {
        await FileSystem.deleteAsync(tmp, { idempotent: true }).catch(() => {});
        break; // probably offline; stop for now
      }
    }
    if (have.size > MAX_FILES) await dropOldest(false);
  } finally {
    queue.length = 0;
    running = false;
  }
}

/** Deletes the oldest saved files (one video, or down to 80 % of the limit). */
async function dropOldest(videoOnly: boolean) {
  try {
    const names = [...have].filter((n) => !videoOnly || /\.(mp4|mov|3gp|webm)$/i.test(n));
    const infos = await Promise.all(
      names.map(async (n) => {
        const i = await FileSystem.getInfoAsync(DIR + n);
        return { n, t: i.exists ? (i.modificationTime ?? 0) : 0 };
      }),
    );
    infos.sort((a, b) => a.t - b.t);
    const remove = videoOnly ? infos.slice(0, 1) : infos.slice(0, Math.max(0, have.size - Math.floor(MAX_FILES * 0.8)));
    for (const { n } of remove) {
      await FileSystem.deleteAsync(DIR + n, { idempotent: true });
      have.delete(n);
    }
  } catch {
    // ignore
  }
}

/** Size of the offline folder in MB and how many files (for Settings). */
export async function offlineInfo(): Promise<{ files: number; mb: number }> {
  await whenReady();
  let bytes = 0;
  for (const n of have) {
    try {
      const i = await FileSystem.getInfoAsync(DIR + n);
      if (i.exists) bytes += i.size ?? 0;
    } catch {
      // ignore
    }
  }
  return { files: have.size, mb: Math.round((bytes / 1024 / 1024) * 10) / 10 };
}

/** Removes everything saved for offline. */
export async function clearOffline(): Promise<void> {
  await FileSystem.deleteAsync(DIR, { idempotent: true });
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  have.clear();
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('offline:'));
  await AsyncStorage.multiRemove(keys);
}
