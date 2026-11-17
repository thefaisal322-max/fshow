import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { mediaDevices, MediaStream, RTCIceCandidate, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';

import { ApiError } from './api';
import type { Author } from './social';
import { supabase } from './supabase';

export type CallStatus = 'ringing' | 'accepted' | 'declined' | 'missed' | 'ended' | 'busy';
export type Call = {
  id: string;
  conversation_id: string;
  video: boolean;
  status: CallStatus;
  caller_id: string;
  callee_id: string;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
  caller: Author;
  callee: Author;
};

function check<T>(res: { data: T | null; error: { message?: string } | null }): T {
  if (res.error) {
    const msg = res.error.message ?? '';
    for (const r of ['call-ended', 'blocked', 'no-messages', 'rate-limited', 'forbidden', 'unauthenticated']) {
      if (msg.includes(r)) throw new ApiError(r);
    }
    if (/fetch|network/i.test(msg)) throw new ApiError('network');
    throw new ApiError('internal', { message: msg });
  }
  return res.data as T;
}

export const calls = {
  start: async (convId: string, video: boolean) => check<Call>(await supabase.rpc('start_call', { p_conv: convId, p_video: video })),
  answer: async (id: string) => check<Call>(await supabase.rpc('answer_call', { p_call: id })),
  end: async (id: string) => check<Call>(await supabase.rpc('end_call', { p_call: id })),
  get: async (id: string) => check<Call | null>(await supabase.rpc('get_call', { p_call: id })),
  ringing: async () => check<Call | null>(await supabase.rpc('my_ringing_call')),
};

// ───────────── ICE servers (STUN + Cloudflare TURN), cached for 12 h ─────────────
type Ice = { urls: string | string[]; username?: string; credential?: string };
let iceCache: { list: Ice[]; until: number } | null = null;
async function iceServers(): Promise<Ice[]> {
  if (iceCache && iceCache.until > Date.now()) return iceCache.list;
  try {
    const { data, error } = await supabase.functions.invoke('turn-credentials', { body: {} });
    if (!error && data?.iceServers?.length) {
      iceCache = { list: data.iceServers as Ice[], until: Date.now() + 12 * 3600_000 };
      return iceCache.list;
    }
  } catch {
    /* fall back below */
  }
  return [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
}

export async function askCallPermissions(video: boolean): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const want = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, ...(video ? [PermissionsAndroid.PERMISSIONS.CAMERA] : [])];
  const res = await PermissionsAndroid.requestMultiple(want);
  return res[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
}

// ───────────── ringtones ─────────────
export const ring = {
  incoming: () => {
    try {
      InCallManager.startRingtone('_DEFAULT_', [0, 800, 600], 'playback', 50);
    } catch {
      /* no sound is fine */
    }
  },
  stop: () => {
    try {
      InCallManager.stopRingtone();
    } catch {
      /* ignore */
    }
  },
};

type Signal =
  | { t: 'ready' }
  | { t: 'offer'; sdp: string }
  | { t: 'answer'; sdp: string }
  | { t: 'ice'; c: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } }
  | { t: 'cam'; on: boolean }
  /** callee → caller: "the line dropped, please make a fresh connection" */
  | { t: 'restart' }
  | { t: 'bye' };

export type Phase = 'starting' | 'ringing' | 'connecting' | 'connected' | 'reconnecting' | 'ended';

/**
 * One call, phone to phone (WebRTC). The phones swap their connection details on a Realtime
 * channel named after the call; Cloudflare TURN relays the sound/video when a direct path is blocked.
 */
export function useCallSession(call: Call | null, role: 'caller' | 'callee') {
  const [phase, setPhase] = useState<Phase>('starting');
  const [final, setFinal] = useState<CallStatus | null>(null);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [remoteCam, setRemoteCam] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [speaker, setSpeaker] = useState(false);
  const [front, setFront] = useState(true);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [, bump] = useState(0);

  const pc = useRef<RTCPeerConnection | null>(null);
  const chan = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const videoSender = useRef<{ replaceTrack: (t: unknown) => Promise<void> } | null>(null);
  const pendingIce = useRef<RTCIceCandidate[]>([]);
  const offered = useRef(false);
  const gotOffer = useRef(false);
  /** when the connection dropped (weak internet) — we try to reconnect instead of hanging up */
  const lostSince = useRef<number | null>(null);
  const lastRestart = useRef(0);
  const peerReady = useRef(false);
  const closed = useRef(false);

  const send = useCallback((s: Signal) => {
    chan.current?.send({ type: 'broadcast', event: 'sig', payload: s }).catch(() => {});
  }, []);

  const cleanup = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    try {
      localRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    try {
      pc.current?.close();
    } catch {
      /* ignore */
    }
    if (chan.current) supabase.removeChannel(chan.current);
    ring.stop();
    try {
      InCallManager.stopRingback();
      InCallManager.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const finish = useCallback(
    (status: CallStatus) => {
      setFinal(status);
      setPhase('ended');
      cleanup();
    },
    [cleanup],
  );

  /** Hang up (or cancel / decline). */
  const hangUp = useCallback(async () => {
    if (!call) return;
    send({ t: 'bye' });
    let status: CallStatus = 'ended';
    try {
      status = (await calls.end(call.id)).status;
    } catch {
      /* still close here */
    }
    finish(status);
  }, [call, send, finish]);

  async function makeOffer() {
    if (!pc.current || offered.current) return;
    offered.current = true;
    const offer = await pc.current.createOffer({});
    await pc.current.setLocalDescription(offer);
    send({ t: 'offer', sdp: offer.sdp ?? '' });
  }

  /** Weak internet: make a new connection path without ending the call (ICE restart). */
  async function restartIce() {
    const p = pc.current;
    if (!p || closed.current) return;
    lastRestart.current = Date.now();
    if (role === 'callee') {
      send({ t: 'restart' });
      return;
    }
    if (p.signalingState !== 'stable') return;
    try {
      const offer = await p.createOffer({ iceRestart: true } as never);
      await p.setLocalDescription(offer);
      send({ t: 'offer', sdp: offer.sdp ?? '' });
    } catch {
      /* try again on the next tick */
    }
  }

  async function flushIce() {
    const list = pendingIce.current;
    pendingIce.current = [];
    for (const c of list) await pc.current?.addIceCandidate(c).catch(() => {});
  }

  async function onSignal(s: Signal) {
    const p = pc.current;
    if (!p || closed.current) return;
    if (s.t === 'ready' && role === 'caller') {
      peerReady.current = true;
      setPhase((x) => (x === 'ringing' || x === 'starting' ? 'connecting' : x));
      try {
        InCallManager.stopRingback();
      } catch {
        /* ignore */
      }
      await makeOffer();
    } else if (s.t === 'offer' && role === 'callee' && gotOffer.current) {
      // a fresh offer while talking = reconnecting after the line dropped
      await p.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: s.sdp }));
      const answer = await p.createAnswer();
      await p.setLocalDescription(answer);
      send({ t: 'answer', sdp: answer.sdp ?? '' });
      await flushIce();
    } else if (s.t === 'restart' && role === 'caller') {
      await restartIce();
    } else if (s.t === 'offer' && role === 'callee' && !gotOffer.current) {
      gotOffer.current = true;
      await p.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: s.sdp }));
      // use the caller's audio + video lines for our own sound/camera (video can be switched on later)
      const mine = localRef.current;
      for (const tr of p.getTransceivers()) {
        const kind = tr.receiver?.track?.kind;
        const track = mine?.getTracks().find((x) => x.kind === kind) ?? null;
        try {
          (tr as unknown as { direction: string }).direction = 'sendrecv';
        } catch {
          /* older webrtc: fine */
        }
        if (track) await tr.sender.replaceTrack(track);
        if (kind === 'video') videoSender.current = tr.sender as unknown as { replaceTrack: (t: unknown) => Promise<void> };
      }
      const answer = await p.createAnswer();
      await p.setLocalDescription(answer);
      send({ t: 'answer', sdp: answer.sdp ?? '' });
      await flushIce();
    } else if (s.t === 'answer' && role === 'caller') {
      if (p.signalingState === 'have-local-offer') {
        await p.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: s.sdp }));
        await flushIce();
      }
    } else if (s.t === 'ice') {
      const c = new RTCIceCandidate(s.c);
      if (p.remoteDescription) await p.addIceCandidate(c).catch(() => {});
      else pendingIce.current.push(c);
    } else if (s.t === 'cam') {
      setRemoteCam(s.on);
    } else if (s.t === 'bye') {
      finish('ended');
    }
  }
  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  // ───────── set up ─────────
  useEffect(() => {
    if (!call) return;
    let alive = true;
    const video = call.video;
    (async () => {
      if (!(await askCallPermissions(video))) {
        hangUp();
        return;
      }
      let stream: MediaStream;
      try {
        stream = (await mediaDevices.getUserMedia({
          audio: true,
          video: video ? { facingMode: 'user', width: 640, height: 480, frameRate: 24 } : false,
        })) as MediaStream;
      } catch {
        hangUp();
        return;
      }
      if (!alive) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localRef.current = stream;
      setLocal(stream);
      setCamOn(video);
      setRemoteCam(video);
      setSpeaker(video);
      try {
        InCallManager.start({ media: video ? 'video' : 'audio', auto: true, ringback: role === 'caller' ? '_DTMF_' : '' });
        InCallManager.setForceSpeakerphoneOn(video);
      } catch {
        /* ignore */
      }

      const p = new RTCPeerConnection({ iceServers: await iceServers() });
      pc.current = p;
      const remoteStream = new MediaStream();
      setRemote(remoteStream);
      // (react-native-webrtc's types miss addEventListener; it is there at runtime)
      const on = (p as unknown as { addEventListener: (type: string, fn: (e: unknown) => void) => void }).addEventListener.bind(p);
      on('track', (e) => {
        const tr = (e as unknown as { track?: unknown }).track;
        if (tr) {
          remoteStream.addTrack(tr as never);
          bump((n) => n + 1);
        }
      });
      on('icecandidate', (e) => {
        const cand = (e as unknown as { candidate?: unknown }).candidate;
        if (!cand) return;
        const c = cand as { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };
        send({ t: 'ice', c: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex } });
      });
      on('connectionstatechange', () => {
        const s = p.connectionState;
        if (s === 'connected') {
          lostSince.current = null;
          setPhase('connected');
          setConnectedAt((x) => x ?? Date.now());
          try {
            InCallManager.stopRingback();
          } catch {
            /* ignore */
          }
        } else if (s === 'disconnected' || s === 'failed') {
          // weak internet: keep the call, show "Reconnecting…" and try again (see the watchdog below)
          if (lostSince.current === null) lostSince.current = Date.now();
          setPhase((x) => (x === 'ended' ? x : x === 'connected' || x === 'reconnecting' ? 'reconnecting' : x));
          if (s === 'failed') restartIce().catch(() => {});
        }
      });

      if (role === 'caller') {
        const audio = stream.getAudioTracks()[0];
        if (audio) p.addTrack(audio, stream);
        const cam = stream.getVideoTracks()[0];
        if (cam) videoSender.current = p.addTrack(cam, stream) as unknown as { replaceTrack: (t: unknown) => Promise<void> };
        else {
          // audio call: keep a video line ready so the camera can be switched on later
          const tr = p.addTransceiver('video', { direction: 'sendrecv' });
          videoSender.current = tr.sender as unknown as { replaceTrack: (t: unknown) => Promise<void> };
        }
      }

      // private channel: only the caller and callee may join (Realtime Authorization, see migration "hardening").
      // If the server refuses private channels, both phones fall back to an open one so calls still work.
      const join = (priv: boolean) => {
        const ch = supabase.channel(priv ? `call:${call.id}` : `call-open:${call.id}`, {
          config: { private: priv, broadcast: { self: false, ack: false } },
        });
        chan.current = ch;
        ch.on('broadcast', { event: 'sig' }, ({ payload }) => {
          onSignalRef.current(payload as Signal).catch(() => {});
        });
        ch.subscribe((st) => {
          if ((st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') && priv && !closed.current) {
            supabase.removeChannel(ch);
            join(false);
            return;
          }
          if (st !== 'SUBSCRIBED') return;
          if (role === 'callee') {
            setPhase('connecting');
            // say "I'm here" until the offer arrives
            let n = 0;
            const tick = () => {
              if (gotOffer.current || closed.current || n++ > 25) return;
              send({ t: 'ready' });
              setTimeout(tick, 1200);
            };
            tick();
          } else {
            setPhase('ringing');
            if (peerReady.current) makeOffer().catch(() => {});
          }
        });
      };
      join(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.id]);

  // ───────── the call row: declined / cancelled / ended by the other side ─────────
  useEffect(() => {
    if (!call) return;
    const ch = supabase
      .channel(`call-row:${call.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${call.id}` }, ({ new: row }) => {
        const st = (row as { status: CallStatus }).status;
        if (st === 'declined' || st === 'missed' || st === 'ended' || st === 'busy') finish(st);
        else if (st === 'accepted' && role === 'caller') setPhase((x) => (x === 'ringing' ? 'connecting' : x));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [call, role, finish]);

  // ───────── nobody answered in 45 s ─────────
  useEffect(() => {
    if (!call || role !== 'caller' || phase !== 'ringing') return;
    const t = setTimeout(() => hangUp(), 45_000);
    return () => clearTimeout(t);
  }, [call, role, phase, hangUp]);

  // ───────── line dropped: try a fresh connection every 8 s; give up after 60 s ─────────
  useEffect(() => {
    if (phase !== 'reconnecting') return;
    const t = setInterval(() => {
      const since = lostSince.current;
      if (since === null) return;
      const gone = Date.now() - since;
      if (gone > 60_000) hangUp();
      else if (gone > 4000 && Date.now() - lastRestart.current > 8000) restartIce().catch(() => {});
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, hangUp]);

  // leaving the screen ends the call
  useEffect(() => () => cleanup(), [cleanup]);

  // ───────── buttons ─────────
  const toggleMic = useCallback(() => {
    const t = localRef.current?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
  }, []);

  const toggleSpeaker = useCallback(() => {
    setSpeaker((on) => {
      try {
        InCallManager.setForceSpeakerphoneOn(!on);
      } catch {
        /* ignore */
      }
      return !on;
    });
  }, []);

  const toggleCam = useCallback(async () => {
    const stream = localRef.current;
    if (!stream) return;
    const cur = stream.getVideoTracks()[0];
    if (cur) {
      // camera off: stop it (the light goes off) and send nothing
      await videoSender.current?.replaceTrack(null).catch(() => {});
      cur.stop();
      stream.removeTrack(cur);
      setCamOn(false);
      send({ t: 'cam', on: false });
    } else {
      if (!(await askCallPermissions(true))) return;
      try {
        const v = (await mediaDevices.getUserMedia({ video: { facingMode: front ? 'user' : 'environment', width: 640, height: 480, frameRate: 24 } })) as MediaStream;
        const track = v.getVideoTracks()[0];
        stream.addTrack(track);
        await videoSender.current?.replaceTrack(track);
        setCamOn(true);
        send({ t: 'cam', on: true });
        if (!speaker) {
          try {
            InCallManager.setForceSpeakerphoneOn(true);
          } catch {
            /* ignore */
          }
          setSpeaker(true);
        }
      } catch {
        /* no camera */
      }
    }
    setLocal(stream);
    bump((n) => n + 1);
  }, [front, send, speaker]);

  const flipCam = useCallback(() => {
    const t = localRef.current?.getVideoTracks()[0] as unknown as { _switchCamera?: () => void; applyConstraints?: (c: object) => Promise<void> } | undefined;
    if (!t) return;
    if (t._switchCamera) t._switchCamera();
    else t.applyConstraints?.({ facingMode: front ? 'environment' : 'user' }).catch(() => {});
    setFront((f) => !f);
  }, [front]);

  return { phase, final, local, remote, remoteCam, camOn, micOn, speaker, front, connectedAt, hangUp, toggleMic, toggleSpeaker, toggleCam, flipCam };
}
