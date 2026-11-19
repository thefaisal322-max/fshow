import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useState } from 'react';

import { ApiError } from './api';
import { supabase } from './supabase';

/**
 * "Download FC & Live": the gift videos and effects are not inside the APK (it is ~11 MB smaller).
 * They are downloaded once from Cloudflare into the phone and kept there.
 *  • FC (coins, gifts) needs the pack
 *  • Live also needs the pack AND the person must be 15+ (checked on the server too)
 */
const VERSION = 'v1';
const BASE = `https://fshow-media.pages.dev/pack/${VERSION}/`;
const DIR = `${FileSystem.documentDirectory}pack/${VERSION}/`;
const KEY = 'fshow.pack';

/** [file, bytes] */
export const PACK_FILES: [string, number][] = [
  ['bronze_watch.mp4', 151067],
  ['butterfly.mp4', 385440],
  ['car.mp4', 1827491],
  ['claws.png', 23008],
  ['clock_red.png', 511026],
  ['clock_white.png', 602449],
  ['eagle.mp4', 914383],
  ['glow_gold.png', 23400],
  ['glow_orange.png', 23546],
  ['glow_purple.png', 22984],
  ['glow_red.png', 22984],
  ['gold_watch.mp4', 152420],
  ['grad_red.png', 205],
  ['moon.png', 57137],
  ['night.jpg', 19985],
  ['petal_red.png', 5767],
  ['petal_yellow.png', 7080],
  ['power_love.mp4', 3229387],
  ['rose.mp4', 1204267],
  ['smart_gift.mp4', 243819],
  ['spark.png', 1272],
  ['tiger.mp4', 468728],
  ['wings_fire.png', 524059],
  ['yellow_flower.mp4', 534209],
];
export const PACK_BYTES = 10956113;

export type PackState = { fc: boolean; live: boolean };
let state: PackState = { fc: false, live: false };
let loaded = false;
const listeners = new Set<(s: PackState) => void>();
const emit = () => listeners.forEach((l) => l(state));

async function load(): Promise<PackState> {
  if (loaded) return state;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<PackState> & { v?: string }) : null;
    if (saved?.v === VERSION && saved.fc) {
      // the files must really be there (the phone may have cleared them)
      const info = await FileSystem.getInfoAsync(DIR + PACK_FILES[PACK_FILES.length - 1][0]);
      state = info.exists ? { fc: true, live: !!saved.live } : { fc: false, live: false };
    }
  } catch {
    /* not downloaded */
  }
  loaded = true;
  return state;
}

async function save() {
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...state, v: VERSION }));
  emit();
}

/** a file of the pack on this phone (null when the pack is not downloaded) */
export function packUri(name: string): string | null {
  return state.fc ? DIR + name : null;
}

/** can this person go live / watch lives? (15+) */
async function liveAllowed(): Promise<boolean> {
  const r = await supabase.rpc('live_age_ok');
  return !r.error && r.data === true;
}

export const pack = {
  load,
  get: () => state,
  /** downloads everything (progress 0…1); live is unlocked only for 15+ */
  install: async (onProgress?: (p: number) => void): Promise<PackState> => {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
    let done = 0;
    for (const [name, bytes] of PACK_FILES) {
      const target = DIR + name;
      const info = await FileSystem.getInfoAsync(target);
      if (!info.exists || (info as { size?: number }).size !== bytes) {
        const r = await FileSystem.downloadAsync(BASE + name, target + '.part');
        if (r.status !== 200) throw new ApiError('network');
        await FileSystem.moveAsync({ from: target + '.part', to: target });
      }
      done += bytes;
      onProgress?.(done / PACK_BYTES);
    }
    state = { fc: true, live: await liveAllowed().catch(() => false) };
    await save();
    return state;
  },
  /** ask again (e.g. after the birthday was added) */
  recheckLive: async () => {
    if (!state.fc) return state;
    state = { ...state, live: await liveAllowed().catch(() => false) };
    await save();
    return state;
  },
  remove: async () => {
    await FileSystem.deleteAsync(`${FileSystem.documentDirectory}pack/`, { idempotent: true }).catch(() => {});
    state = { fc: false, live: false };
    await save();
  },
};

export function usePack(): PackState & { ready: boolean } {
  const [s, setS] = useState<PackState>(state);
  const [ready, setReady] = useState(loaded);
  useEffect(() => {
    listeners.add(setS);
    load().then((x) => {
      setS(x);
      setReady(true);
    });
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return { ...s, ready };
}

/** the install button logic, shared by the gate and the monetization screen */
export function usePackInstaller() {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const install = useCallback(async () => {
    setError(null);
    setProgress(0);
    try {
      await pack.install(setProgress);
    } catch (e) {
      setError(e instanceof ApiError ? e.reason : 'network');
    } finally {
      setProgress(null);
    }
  }, []);
  return { progress, error, install };
}
