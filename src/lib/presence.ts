import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { tr } from '@/i18n';

import { supabase } from './supabase';

/** Tells the server "I am online" every 45 s while the app is open. */
export function usePresenceHeartbeat(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const ping = () => {
      supabase.rpc('touch_presence').then(() => {}, () => {});
    };
    const start = () => {
      ping();
      if (!timer) timer = setInterval(ping, 45_000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    start();
    const sub = AppState.addEventListener('change', (s) => (s === 'active' ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, [userId]);
}

export type Presence = Record<string, string | null>;

/** Last-seen times of some people, refreshed every 30 s. */
export function usePresence(ids: string[]): Presence {
  const key = [...new Set(ids)].sort().join(',');
  const [map, setMap] = useState<Presence>({});
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase.rpc('get_presence', { p_users: key.split(',') });
      if (!alive || !Array.isArray(data)) return;
      const next: Presence = {};
      for (const r of data as { id: string; last_seen_at: string | null }[]) next[r.id] = r.last_seen_at;
      setMap(next);
    };
    load().catch(() => {});
    const timer = setInterval(() => load().catch(() => {}), 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [key]);
  return map;
}

export function isOnline(lastSeen: string | null | undefined): boolean {
  return !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 2 * 60_000;
}

/** "Online" / "Active 5 min ago" / "" */
export function presenceText(lastSeen: string | null | undefined): string {
  if (!lastSeen) return '';
  const s = (Date.now() - new Date(lastSeen).getTime()) / 1000;
  if (s < 120) return tr('online');
  if (s < 3600) return tr('active_min', { n: Math.floor(s / 60) });
  if (s < 86400) return tr('active_hour', { n: Math.floor(s / 3600) });
  if (s < 7 * 86400) return tr('active_day', { n: Math.floor(s / 86400) });
  return '';
}
