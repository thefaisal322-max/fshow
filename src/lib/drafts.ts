import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';

import type { Visibility } from './social';

/**
 * Drafts: unfinished posts/reels kept on this phone (like TikTok / Facebook).
 * The photo or video is copied into the app's own folder so it survives even if it is
 * deleted from the gallery.
 */
export type Draft = {
  id: string;
  uid: string;
  body: string;
  image: string | null;
  video: { uri: string; duration?: number | null; size?: number | null; mime?: string | null } | null;
  location: string | null;
  feeling: string | null;
  visibility: Visibility;
  saved_at: string;
};

const KEY = 'fshow.drafts.v1';
const DIR = `${FS.documentDirectory ?? ''}drafts/`;

async function readAll(): Promise<Draft[]> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v ? (JSON.parse(v) as Draft[]) : [];
  } catch {
    return [];
  }
}
async function writeAll(list: Draft[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

async function keepFile(uri: string, id: string): Promise<string> {
  if (uri.startsWith(DIR)) return uri;
  await FS.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  const ext = (uri.split('?')[0].split('.').pop() || 'bin').slice(0, 5);
  const to = `${DIR}${id}-${Date.now().toString(36)}.${ext}`;
  await FS.copyAsync({ from: uri, to });
  return to;
}

async function dropFiles(d: Draft) {
  for (const u of [d.image, d.video?.uri]) if (u && u.startsWith(DIR)) await FS.deleteAsync(u, { idempotent: true }).catch(() => {});
}

export const drafts = {
  list: async (uid: string) => (await readAll()).filter((d) => d.uid === uid).sort((a, b) => b.saved_at.localeCompare(a.saved_at)),
  get: async (id: string) => (await readAll()).find((d) => d.id === id) ?? null,
  /** Save (or update) a draft. Returns its id. */
  save: async (d: Omit<Draft, 'id' | 'saved_at'> & { id?: string | null }) => {
    const id = d.id || `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const image = d.image ? await keepFile(d.image, id) : null;
    const video = d.video ? { ...d.video, uri: await keepFile(d.video.uri, id) } : null;
    const all = await readAll();
    const old = all.find((x) => x.id === id);
    const next: Draft = { ...d, id, image, video, saved_at: new Date().toISOString() };
    if (old) {
      // files that were replaced
      if (old.image && old.image !== image) await FS.deleteAsync(old.image, { idempotent: true }).catch(() => {});
      if (old.video?.uri && old.video.uri !== video?.uri) await FS.deleteAsync(old.video.uri, { idempotent: true }).catch(() => {});
    }
    await writeAll([next, ...all.filter((x) => x.id !== id)].slice(0, 30));
    return id;
  },
  remove: async (id: string) => {
    const all = await readAll();
    const d = all.find((x) => x.id === id);
    if (d) await dropFiles(d);
    await writeAll(all.filter((x) => x.id !== id));
  },
};
