import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth-context';
import { Call, calls, useCallSession } from '@/lib/calls';
import { authorName } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** The call screen: the other person's video (or photo), my small camera, and the buttons at the bottom. */
export default function CallScreen() {
  const { id, role } = useLocalSearchParams<{ id: string; role?: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [call, setCall] = useState<Call | null>(null);
  const [now, setNow] = useState(Date.now());
  const me = session?.user.id ?? '';
  const asRole = role === 'callee' ? 'callee' : 'caller';

  useEffect(() => {
    calls
      .get(id)
      .then((c) => (c ? setCall(c) : router.back()))
      .catch(() => router.back());
  }, [id, router]);

  const s = useCallSession(call, asRole);
  const other = call ? (call.caller_id === me ? call.callee : call.caller) : null;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // back button = hang up
  const hangUp = s.hangUp;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      hangUp();
      return true;
    });
    return () => sub.remove();
  }, [hangUp]);

  // finished → show why for a moment, then close
  useEffect(() => {
    if (s.phase !== 'ended') return;
    const timer = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/')), 1600);
    return () => clearTimeout(timer);
  }, [s.phase, router]);

  const status =
    s.phase === 'ended'
      ? s.final === 'declined'
        ? t('call_declined')
        : s.final === 'busy'
          ? t('busy_word')
          : s.final === 'missed'
            ? t('no_answer')
            : `${t('call_ended')}${s.connectedAt ? ` · ${clock(now - s.connectedAt)}` : ''}`
      : s.phase === 'connected'
        ? clock(now - (s.connectedAt ?? now))
        : s.phase === 'reconnecting'
          ? t('reconnecting')
          : s.phase === 'ringing'
            ? t('ringing_word')
            : s.phase === 'connecting'
              ? t('connecting')
              : t('calling');

  const showRemote = !!s.remote && s.remoteCam && s.phase === 'connected' && s.remote.getVideoTracks().length > 0;
  const showLocal = !!s.local && s.camOn && s.local.getVideoTracks().length > 0;
  const ended = s.phase === 'ended';

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      {showRemote ? (
        <RTCView streamURL={s.remote!.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" zOrder={0} />
      ) : showLocal && s.phase !== 'connected' ? (
        // while it rings in a video call, my own camera fills the screen (like Messenger)
        <RTCView streamURL={s.local!.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" mirror={s.front} zOrder={0} />
      ) : null}
      {showRemote || (showLocal && s.phase !== 'connected') ? <View style={st.shade} pointerEvents="none" /> : null}

      {/* name + status */}
      <View style={[st.top, { paddingTop: insets.top + 24 }]}>
        {!showRemote ? <Avatar uri={avatarUrl(other?.photo_path)} name={other?.first_name} size={showLocal && s.phase !== 'connected' ? 72 : 118} /> : null}
        <Text style={st.name} numberOfLines={1}>
          {other ? authorName(other) : ''}
        </Text>
        <Text style={st.status}>
          {call && s.phase !== 'connected' && !ended ? `${call.video ? t('video_call') : t('audio_call')} · ` : ''}
          {status}
        </Text>
      </View>

      {/* my camera, small */}
      {showLocal && s.phase === 'connected' ? (
        <View style={[st.pip, { top: insets.top + 16 }]}>
          <RTCView streamURL={s.local!.toURL()} style={{ flex: 1 }} objectFit="cover" mirror={s.front} zOrder={1} />
        </View>
      ) : null}

      {/* buttons */}
      {!ended ? (
        <View style={[st.bar, { marginBottom: insets.bottom + 18 }]}>
          <Btn icon={s.camOn ? 'videocam' : 'videocam-off'} label={t('camera_word')} on={s.camOn} onPress={s.toggleCam} />
          <Btn icon="camera-reverse" label={t('flip_camera')} disabled={!s.camOn} onPress={s.flipCam} />
          <Btn icon={s.micOn ? 'mic' : 'mic-off'} label={t('mute_word')} on={!s.micOn} invert onPress={s.toggleMic} />
          <Btn icon={s.speaker ? 'volume-high' : 'volume-medium'} label={t('speaker_word')} on={s.speaker} onPress={s.toggleSpeaker} />
          <Btn icon="share-outline" label={t('share_screen')} onPress={() => Alert.alert(t('share_screen'), t('screen_share_soon'))} />
          <Pressable onPress={s.hangUp} style={st.endWrap} hitSlop={6}>
            <View style={st.end}>
              <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </View>
            <Text style={st.label}>{t('end_call')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Btn({
  icon,
  label,
  onPress,
  on,
  invert,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  on?: boolean;
  /** white circle means "this is switched on" — for mute it means "muted" */
  invert?: boolean;
  disabled?: boolean;
}) {
  const lit = !!on;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[st.btnWrap, disabled && { opacity: 0.35 }]} hitSlop={4}>
      <View style={[st.btn, lit && { backgroundColor: '#fff' }]}>
        <Ionicons name={icon} size={24} color={lit ? '#111' : '#fff'} />
      </View>
      <Text style={st.label} numberOfLines={1}>
        {invert && lit ? '✓ ' : ''}
        {label}
      </Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#14141a' },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
  top: { alignItems: 'center', gap: 6, paddingHorizontal: 20 },
  name: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 10, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  status: { color: 'rgba(255,255,255,0.85)', fontSize: 15, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  pip: { position: 'absolute', right: 14, width: 110, height: 160, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(30,30,36,0.92)',
    borderRadius: 26,
    paddingHorizontal: 8,
    paddingVertical: 14,
  },
  btnWrap: { alignItems: 'center', gap: 6, width: 54 },
  btn: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  label: { color: '#ddd', fontSize: 10.5, textAlign: 'center' },
  endWrap: { alignItems: 'center', gap: 6, width: 54 },
  end: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#E5383B', alignItems: 'center', justifyContent: 'center' },
});
