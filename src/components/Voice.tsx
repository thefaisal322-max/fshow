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
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
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
        <Text style={st.recHint} numberOfLines={1}>
          {ready ? t('recording') : '…'}
        </Text>
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
  const fg = mine ? '#fff' : colors.primary;
  if (!url) {
    return (
      <View style={st.voice}>
        <ActivityIndicator color={fg} />
      </View>
    );
  }
  return <VoicePlayer url={url} fg={fg} mine={mine} />;
}

function VoicePlayer({ url, fg, mine }: { url: string; fg: string; mine: boolean }) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || 0;
  const pos = status.currentTime || 0;
  const pct = duration > 0 ? Math.min(1, pos / duration) : 0;

  function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (duration > 0 && pos >= duration - 0.15)) player.seekTo(0);
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    player.play();
  }

  return (
    <View style={st.voice}>
      <Pressable onPress={toggle} hitSlop={8} style={[st.play, { backgroundColor: mine ? 'rgba(255,255,255,0.25)' : colors.soft }]}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color={fg} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={[st.wave, { backgroundColor: mine ? 'rgba(255,255,255,0.35)' : colors.border }]}>
          <View style={[st.waveFill, { backgroundColor: fg, width: `${Math.round(pct * 100)}%` as `${number}%` }]} />
        </View>
        <Text style={{ color: mine ? '#eef' : colors.muted, fontSize: 11 }}>
          🎤 {mmss(status.playing || pos > 0 ? pos : duration)}
        </Text>
      </View>
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
  voice: { width: 200, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  wave: { height: 4, borderRadius: 2, overflow: 'hidden' },
  waveFill: { height: 4, borderRadius: 2 },
});
