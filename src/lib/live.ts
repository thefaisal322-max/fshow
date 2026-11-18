import { useCallback, useEffect, useRef, useState } from 'react';
import InCallManager from 'react-native-incall-manager';
import { mediaDevices, MediaStream, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';

import { ApiError } from './api';
import { askCallPermissions, iceServers } from './calls';
import type { Author } from './social';
import { supabase } from './supabase';

export type Tier = 'unranked' | 'special' | 'aplus' | 'afg';
export const TIERS: { tier: Tier; price: number; reach: string; label: string }[] = [
  { tier: 'unranked', price: 250, reach: '99', label: 'Unranked' },
  { tier: 'special', price: 750, reach: '👥 + 👥👥 + 100', label: 'Special' },
  { tier: 'aplus', price: 999, reach: '1,000', label: 'A+' },
  { tier: 'afg', price: 1499, reach: '5,000', label: 'AFG' },
];
export const tierLabel = (t: string | null, name?: string | null) => (t === 'special' ? name || 'Special' : TIERS.find((x) => x.tier === t)?.label ?? '');
export const LIVE_MINUTES = 25;
export const ROUND_SECONDS = 180;
export const TAPS_PACK = { taps: 100, price: 50 };

export type LiveHost = Author & { side: 'A' | 'B'; pub: string | null; mic_off: boolean; cam_off: boolean; main: boolean };
export type Round = { round: number; a: number; b: number; ga: number; gb: number; winner: 'A' | 'B' | 'draw'; done: boolean };
export type Live = {
  id: string;
  kind: 'live' | 'match';
  status: 'waiting' | 'live' | 'ended';
  title: string;
  tier: Tier | null;
  match_name: string | null;
  random: boolean;
  started_at: string | null;
  ends_at: string | null;
  ended_at: string | null;
  now: string;
  winner_side: 'A' | 'B' | 'draw' | null;
  card_post_id: string | null;
  host: Author;
  opponent: Author | null;
  hosts: LiveHost[];
  my_invite: 'A' | 'B' | null;
  i_host: boolean;
  viewers: number;
  viewers_peak: number;
  round: number;
  rounds: Round[];
  taps_a: number;
  taps_b: number;
  gifts_a: number;
  gifts_b: number;
  my_taps: number;
  most_comment: { body: string; count: number } | null;
  result: Record<string, any> | null;
};
export type LiveListItem = {
  id: string;
  kind: 'live' | 'match';
  title: string;
  tier: Tier | null;
  match_name: string | null;
  viewers: number;
  host: Author;
  opponent: Author | null;
};
export type LiveEvent = {
  id: number;
  live_id: string;
  user_id: string | null;
  kind: 'comment' | 'gift' | 'join' | 'system' | 'taps';
  body: string;
  gift: string | null;
  amount: number;
  side: 'A' | 'B' | null;
  created_at: string;
};

function check<T>(res: { data: T | null; error: { message?: string } | null }): T {
  if (res.error) {
    const msg = res.error.message ?? '';
    for (const r of ['not-enough-coins', 'too-young', 'need-followers', 'forbidden', 'invalid-input', 'rate-limited', 'unauthenticated']) {
      if (msg.includes(r)) throw new ApiError(r);
    }
    if (/fetch|network|abort/i.test(msg)) throw new ApiError('network');
    throw new ApiError('internal', { message: msg });
  }
  return res.data as T;
}

export const live = {
  now: async () => check<LiveListItem[]>(await supabase.rpc('lives_now')) ?? [],
  mine: async () => check<string | null>(await supabase.rpc('my_live')),
  start: async (title: string) => check<string>(await supabase.rpc('live_start', { p_title: title })),
  createMatch: async (tier: Tier, name: string | null, opponent: string | null, random: boolean) =>
    check<string>(await supabase.rpc('match_create', { p_tier: tier, p_name: name, p_opponent: opponent, p_random: random })),
  findRandom: async () => check<string | null>(await supabase.rpc('match_find_random')),
  get: async (id: string, join = true) => check<Live>(await supabase.rpc('live_get', { p_live: id, p_join: join })),
  accept: async (id: string) => {
    check(await supabase.rpc('live_accept', { p_live: id }));
  },
  decline: async (id: string) => {
    check(await supabase.rpc('live_decline', { p_live: id }));
  },
  invite: async (id: string, username: string) => {
    check(await supabase.rpc('live_invite', { p_live: id, p_username: username }));
  },
  kick: async (id: string, user: string) => {
    check(await supabase.rpc('live_kick', { p_live: id, p_user: user }));
  },
  leave: async (id: string) => check<Live | null>(await supabase.rpc('live_leave', { p_live: id })),
  end: async (id: string) => check<Live>(await supabase.rpc('live_end', { p_live: id })),
  comment: async (id: string, body: string) => {
    check(await supabase.rpc('live_comment', { p_live: id, p_body: body }));
  },
  tap: async (id: string, side: 'A' | 'B', n: number) => check<{ a: number; b: number }>(await supabase.rpc('live_tap', { p_live: id, p_side: side, p_n: n })),
  buyTaps: async (id: string, side: 'A' | 'B', packs: number) =>
    check<{ price: number; balance: number }>(await supabase.rpc('live_buy_taps', { p_live: id, p_side: side, p_packs: packs })),
  setMedia: async (id: string, micOff: boolean | null, camOff: boolean | null) => {
    await supabase.rpc('live_set_media', { p_live: id, p_mic_off: micOff, p_cam_off: camOff });
  },
  recentEvents: async (id: string) => {
    const r = await supabase.from('live_events').select('*').eq('live_id', id).order('id', { ascending: false }).limit(40);
    return ((r.data as LiveEvent[] | null) ?? []).reverse();
  },
};

/** calls the "sfu" Edge Function (the Cloudflare token stays on the server) */
async function sfu<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('sfu', { body });
  if (error) {
    let reason = 'network';
    try {
      reason = (await (error as any).context?.json())?.error ?? reason;
    } catch {
      /* not JSON */
    }
    throw new ApiError(reason);
  }
  return data as T;
}

type PullReply = { session_id?: string; sdp: string | null; type?: string; tracks: { mid: string; user: string; kind: 'audio' | 'video'; ok: boolean }[] };

const onEv = (p: RTCPeerConnection) =>
  (p as unknown as { addEventListener: (type: string, fn: (e: any) => void) => void }).addEventListener.bind(p);

/**
 * Video in a live room.
 *  • a host sends camera + mic (480p) to the SFU
 *  • everyone receives the other hosts; when the hosts change, the app asks again
 */
export function useLiveMedia(liveId: string, host: boolean, hostsKey: string, active: boolean) {
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<Record<string, MediaStream>>({});
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [front, setFront] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pubPc = useRef<RTCPeerConnection | null>(null);
  const pullPc = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const pulling = useRef(0);

  // speaker on while in a room
  useEffect(() => {
    if (!active) return;
    try {
      InCallManager.start({ media: 'video', auto: false });
      InCallManager.setForceSpeakerphoneOn(true);
      InCallManager.setKeepScreenOn(true);
    } catch {
      /* ignore */
    }
    return () => {
      try {
        InCallManager.setKeepScreenOn(false);
        InCallManager.stop();
      } catch {
        /* ignore */
      }
    };
  }, [active]);

  // ───── send (hosts) ─────
  useEffect(() => {
    if (!active || !host) return;
    let alive = true;
    (async () => {
      if (!(await askCallPermissions(true))) {
        setError('permission');
        return;
      }
      let stream: MediaStream;
      try {
        stream = (await mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: 'user', width: 480, height: 854, frameRate: 24 },
        })) as MediaStream;
      } catch {
        setError('camera');
        return;
      }
      if (!alive) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localRef.current = stream;
      setLocal(stream);
      const p = new RTCPeerConnection({ iceServers: await iceServers(), bundlePolicy: 'max-bundle' } as any);
      pubPc.current = p;
      const audio = stream.getAudioTracks()[0];
      const video = stream.getVideoTracks()[0];
      const ta = (p as any).addTransceiver(audio, { direction: 'sendonly', streams: [stream] });
      const tv = (p as any).addTransceiver(video, { direction: 'sendonly', streams: [stream] });
      const offer = await p.createOffer({});
      await p.setLocalDescription(offer);
      for (let i = 0; i < 3 && alive; i++) {
        try {
          const ans = await sfu<{ sdp: string; type: string }>({
            action: 'publish',
            live_id: liveId,
            sdp: p.localDescription?.sdp,
            tracks: [
              { mid: ta.mid, kind: 'audio' },
              { mid: tv.mid, kind: 'video' },
            ],
          });
          await p.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: ans.sdp }));
          setError(null);
          break;
        } catch (e) {
          if (i === 2) setError(e instanceof ApiError ? e.reason : 'sfu');
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    })();
    return () => {
      alive = false;
      pubPc.current?.close();
      pubPc.current = null;
      localRef.current?.getTracks().forEach((t) => t.stop());
      localRef.current = null;
      setLocal(null);
      sfu({ action: 'stop', live_id: liveId }).catch(() => {});
    };
  }, [active, host, liveId]);

  // ───── receive (everyone) ─────
  const pull = useCallback(async () => {
    const my = ++pulling.current;
    pullPc.current?.close();
    pullPc.current = null;
    try {
      const r = await sfu<PullReply>({ action: 'pull', live_id: liveId });
      if (my !== pulling.current) return;
      if (!r.sdp || !r.session_id) {
        setRemote({});
        return;
      }
      const byMid = new Map(r.tracks.map((t) => [t.mid, t.user]));
      const streams: Record<string, MediaStream> = {};
      const p = new RTCPeerConnection({ iceServers: await iceServers(), bundlePolicy: 'max-bundle' } as any);
      pullPc.current = p;
      onEv(p)('track', (e) => {
        const mid = e.transceiver?.mid ?? null;
        const user = (mid && byMid.get(mid)) || 'x';
        if (!streams[user]) streams[user] = new MediaStream();
        if (e.track) streams[user].addTrack(e.track);
        if (my === pulling.current) setRemote({ ...streams });
      });
      onEv(p)('connectionstatechange', () => {
        if (p.connectionState === 'failed' && my === pulling.current) setTimeout(() => my === pulling.current && pull(), 2000);
      });
      await p.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: r.sdp }));
      const ans = await p.createAnswer();
      await p.setLocalDescription(ans);
      await sfu({ action: 'answer', live_id: liveId, session_id: r.session_id, sdp: p.localDescription?.sdp });
      // a host who just started may not be ready yet: ask once more for missing tracks
      if (r.tracks.some((t) => !t.ok)) setTimeout(() => my === pulling.current && pull(), 3000);
    } catch {
      if (my === pulling.current) setTimeout(() => my === pulling.current && pull(), 3000);
    }
  }, [liveId]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(pull, 600);
    return () => clearTimeout(t);
  }, [active, hostsKey, pull]);

  useEffect(
    () => () => {
      pulling.current++;
      pullPc.current?.close();
      pullPc.current = null;
    },
    [],
  );

  const toggleMic = useCallback(() => {
    const t = localRef.current?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
    live.setMedia(liveId, !t.enabled, null).catch(() => {});
  }, [liveId]);
  const toggleCam = useCallback(() => {
    const t = localRef.current?.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setCamOn(t.enabled);
    live.setMedia(liveId, null, !t.enabled).catch(() => {});
  }, [liveId]);
  const flip = useCallback(() => {
    const t = localRef.current?.getVideoTracks()[0] as unknown as { _switchCamera?: () => void } | undefined;
    t?._switchCamera?.();
    setFront((f) => !f);
  }, []);

  return { local, remote, micOn, camOn, front, error, toggleMic, toggleCam, flip, repull: pull };
}

/** seconds left (server clock) */
export function secondsLeft(l: Live | null, skew: number): number {
  if (!l?.ends_at) return 0;
  return Math.max(0, Math.round((new Date(l.ends_at).getTime() - (Date.now() + skew)) / 1000));
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
