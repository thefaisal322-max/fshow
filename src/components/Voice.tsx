import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { chatFileUrl } from '@/lib/chat';
import { colors } from '@/theme';

function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Recording bar: starts at once, shows a red dot + time; ✕ cancels, ➤ sends. Max 3 minutes. */
export function VoiceRecorder({ onSend, onCancel }: { onSend: (uri: string) => void; onCancel: () => void }) {
  const { t, d } = useI18n();
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true } as typeof RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 120);
  const [levels, setLevels] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const blink = useRef(new Animated.Value(1)).current;
  const stopped = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('', t('mic_permission'));
          onCancel();
          return;
        }
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setReady(true);
      } catch {
        Alert.alert('', t('e_generic'));
        onCancel();
      }
    })();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.2, duration: 500, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      if (!stopped.current) {
        try {
          recorder.stop().catch(() => {});
        } catch {
          // recorder already released
        }
      }
      setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finish(send: boolean) {
    if (stopped.current) return;
    stopped.current = true;
    try {
      await recorder.stop();
    } catch {
      // already stopped
    }
    const uri = recorder.uri;
    if (send && uri && state.durationMillis > 700) onSend(uri);
    else onCancel();
  }

  // live waveform from the microphone level (dB −60…0 → 0…1)
  useEffect(() => {
    const db = Number((state as any).metering);
    if (!state.isRecording || !Number.isFinite(db)) return;
    const v = Math.max(0.08, Math.min(1, (db + 60) / 60));
    setLevels((old) => [...old.slice(-27), v]);
  }, [state]);

  // stop automatically after 3 minutes
  useEffect(() => {
    if (state.durationMillis >= 180_000) finish(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.durationMillis]);

  return (
    <View style={[st.rec, { flexDirection: d.row }]}>
      <Pressable onPress={() => finish(false)} hitSlop={8} style={st.recBtn}>
        <Ionicons name="trash-outline" size={22} color={colors.error} />
      </Pressable>
      <View style={[st.recMid, { flexDirection: d.row }]}>
        <Animated.View style={[st.redDot, { opacity: blink }]} />
        <Text style={st.recTime}>{mmss(state.durationMillis / 1000)}</Text>
        {levels.length ? (
          <View style={[st.liveBars, { flexDirection: d.row }]}>
            {levels.map((v, i) => (
              <View key={i} style={[st.liveBar, { height: 4 + v * 22 }]} />
            ))}
          </View>
        ) : (
          <Text style={st.recHint} numberOfLines={1}>
            {ready ? t('recording') : '…'}
          </Text>
        )}
      </View>
      <Pressable onPress={() => finish(true)} disabled={!ready} style={[st.sendBtn, !ready && { opacity: 0.4 }]}>
        <Ionicons name="send" size={20} color="#fff" style={d.rtl ? { transform: [{ scaleX: -1 }] } : undefined} />
      </Pressable>
    </View>
  );
}

/** Voice message bubble: ▶ / ❚❚, a progress line and the time. */
export function VoiceMessage({ path, mine }: { path: string; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    chatFileUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  if (!url) {
    return (
      <View style={[st.pill, { backgroundColor: mine ? colors.primary : colors.surface }]}>
        <ActivityIndicator color={mine ? '#fff' : colors.primary} />
      </View>
    );
  }
  return <VoicePlayer url={url} mine={mine} />;
}

/** Same path → same bar heights, so a message always shows the same "waveform". */
function bars(seed: string, n = 24): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h >>> 0) % 1000) / 1000;
    // louder in the middle, quieter at the ends — looks like speech
    const shape = 0.45 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / n);
    out.push(Math.max(0.18, Math.min(1, r * shape + 0.15)));
  }
  return out;
}

/** Voice message like a modern messenger: round ▶ button, waveform that fills while playing, time. */
function VoicePlayer({ url, mine }: { url: string; mine: boolean }) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || 0;
  const pos = status.currentTime || 0;
  const pct = duration > 0 ? Math.min(1, pos / duration) : 0;
  const heights = useRef(bars(url.split('?')[0])).current;

  function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (duration > 0 && pos >= duration - 0.15)) player.seekTo(0);
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    player.play();
  }

  const fg = mine ? '#fff' : colors.primary;
  return (
    <View style={[st.pill, { backgroundColor: mine ? colors.primary : colors.surface }]}>
      <Pressable onPress={toggle} hitSlop={8} style={[st.playBig, { backgroundColor: mine ? 'rgba(0,0,0,0.45)' : colors.primary }]}>
        {status.isBuffering && status.playing ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Ionicons name={status.playing ? 'pause' : 'play'} size={22} color="#fff" style={status.playing ? undefined : { marginLeft: 3 }} />
        )}
      </Pressable>
      <View style={st.bars}>
        {heights.map((v, i) => {
          const played = (i + 0.5) / heights.length <= pct;
          return <View key={i} style={[st.bar, { height: 6 + v * 26, backgroundColor: fg, opacity: played || (!status.playing && pos === 0) ? 1 : 0.45 }]} />;
        })}
      </View>
      <Text style={[st.time, { color: mine ? '#fff' : colors.text }]}>{mmss(status.playing || pos > 0 ? pos : duration)}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  rec: { alignItems: 'center', gap: 8, padding: 8 },
  recBtn: { padding: 8 },
  recMid: { flex: 1, alignItems: 'center', gap: 8, backgroundColor: colors.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  redDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30' },
  recTime: { fontSize: 16, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  recHint: { flex: 1, color: colors.muted, fontSize: 13 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  pill: { width: 250, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 26, paddingHorizontal: 10, paddingVertical: 8 },
  playBig: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  bars: { flex: 1, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bar: { width: 3, borderRadius: 2 },
  time: { fontSize: 15, fontWeight: '700', minWidth: 38, textAlign: 'right', fontVariant: ['tabular-nums'] },
  liveBars: { flex: 1, height: 28, alignItems: 'center', gap: 2, overflow: 'hidden' },
  liveBar: { width: 3, borderRadius: 2, backgroundColor: colors.primary },
});
