import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { Call, calls, ring } from '@/lib/calls';
import { dismissCallNotification } from '@/lib/push';
import { authorName } from '@/lib/social';
import { avatarUrl, supabase } from '@/lib/supabase';

/**
 * Listens for calls to me while the app is open and shows the full-screen "incoming call" page:
 * ringtone, the caller's photo and name, Decline / Accept.
 */
export function IncomingCall({ me }: { me: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [call, setCall] = useState<Call | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useRef<string | null>(null);

  const show = useCallback((c: Call | null) => {
    if (!c || c.status !== 'ringing' || c.callee_id === undefined) return;
    if (current.current === c.id) return;
    current.current = c.id;
    setCall(c);
    ring.incoming();
  }, []);

  const hide = useCallback(() => {
    ring.stop();
    if (current.current) dismissCallNotification(current.current);
    current.current = null;
    setCall(null);
    setBusy(false);
  }, []);

  // a call that is already ringing when the app opens / comes back
  useEffect(() => {
    const check = () => calls.ringing().then(show).catch(() => {});
    check();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && check());
    return () => sub.remove();
  }, [show]);

  // new calls + the caller cancelling
  useEffect(() => {
    const ch = supabase
      .channel(`calls-in:${me}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `callee_id=eq.${me}` }, ({ new: row }) => {
        const r = row as { id: string; status: string };
        if (r.status === 'ringing') calls.get(r.id).then(show).catch(() => {});
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `callee_id=eq.${me}` }, ({ new: row }) => {
        const r = row as { id: string; status: string };
        if (r.id === current.current && r.status !== 'ringing') hide();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [me, show, hide]);

  // stops ringing after 50 s like the server does
  useEffect(() => {
    if (!call) return;
    const timer = setTimeout(hide, Math.max(1000, 50_000 - (Date.now() - new Date(call.created_at).getTime())));
    return () => clearTimeout(timer);
  }, [call, hide]);

  if (!call) return null;

  async function accept() {
    if (!call || busy) return;
    setBusy(true);
    ring.stop();
    try {
      await calls.answer(call.id);
      const id = call.id;
      hide();
      router.push({ pathname: '/call/[id]', params: { id, role: 'callee' } });
    } catch (e) {
      hide();
      Alert.alert('', errorMessage(e));
    }
  }

  async function decline() {
    if (!call) return;
    const id = call.id;
    hide();
    calls.end(id).catch(() => {});
  }

  return (
    <View style={[StyleSheet.absoluteFill, st.root, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 50 }]}>
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Avatar uri={avatarUrl(call.caller.photo_path)} name={call.caller.first_name} size={124} />
        <Text style={st.name} numberOfLines={1}>
          {authorName(call.caller)}
        </Text>
        <Text style={st.sub}>{call.video ? t('incoming_video') : t('incoming_audio')}</Text>
      </View>
      <View style={st.row}>
        <Pressable onPress={decline} style={st.col} hitSlop={8}>
          <View style={[st.circle, { backgroundColor: '#E5383B' }]}>
            <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </View>
          <Text style={st.label}>{t('decline_call')}</Text>
        </Pressable>
        <Pressable onPress={accept} style={st.col} hitSlop={8} disabled={busy}>
          <View style={[st.circle, { backgroundColor: '#2EB872' }]}>
            <Ionicons name={call.video ? 'videocam' : 'call'} size={32} color="#fff" />
          </View>
          <Text style={st.label}>{t('accept_call')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { backgroundColor: '#14141a', justifyContent: 'space-between', zIndex: 100, elevation: 100 },
  name: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 8, paddingHorizontal: 20 },
  sub: { color: 'rgba(255,255,255,0.75)', fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 30 },
  col: { alignItems: 'center', gap: 10 },
  circle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  label: { color: '#fff', fontSize: 14 },
});
