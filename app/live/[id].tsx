import { Ionicons } from '@expo/vector-icons';
import { PackGate } from '@/components/PackGate';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Coin } from '@/components/Coin';
import { GiftBurst, GiftSheet } from '@/components/GiftSheet';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { GiftCode, giftOf } from '@/lib/coins';
import { Live, live, LiveEvent, LiveHost, mmss, ROUND_SECONDS, secondsLeft, TAPS_PACK, tierLabel, useLiveMedia } from '@/lib/live';
import { Author, authorName, formatCount } from '@/lib/social';
import { avatarUrl, supabase } from '@/lib/supabase';

const PINK = '#FE2C55';
const BLUE = '#2D9CDB';

/** names for the feed (cached) */
const people = new Map<string, Author>();
async function loadPeople(ids: string[]) {
  const need = [...new Set(ids)].filter((id) => id && !people.has(id));
  if (!need.length) return;
  const r = await supabase.from('profiles').select('id, first_name, last_name, username, photo_path, is_fainet').in('id', need.slice(0, 50));
  for (const p of (r.data as Author[] | null) ?? []) people.set(p.id, p);
}
const nameOf = (id: string | null) => (id && people.get(id) ? authorName(people.get(id)!) : '…');

/**
 * A LIVE or MATCH room.
 *  live:  up to 4 hosts in a grid, comments, gifts — 25 minutes
 *  match: side A | side B, the tap bar, 3 rounds × 3 minutes (best of 3)
 */
function LiveRoomInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const liveId = String(id);
  const router = useRouter();
  const { t, d } = useI18n();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [l, setL] = useState<Live | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [skew, setSkew] = useState(0);
  const [, tick] = useState(0);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [text, setText] = useState('');
  const [giftFor, setGiftFor] = useState<LiveHost | null>(null);
  const [bursts, setBursts] = useState<{ key: number; gift: GiftCode; from: string }[]>([]);
  const [invite, setInvite] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [buySide, setBuySide] = useState<'A' | 'B' | null>(null);
  const taps = useRef<{ A: number; B: number }>({ A: 0, B: 0 });
  const [localTaps, setLocalTaps] = useState({ A: 0, B: 0 });
  const left = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const x = await live.get(liveId);
      setL(x);
      setSkew(new Date(x.now).getTime() - Date.now());
      setErr(null);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [liveId]);

  // open + keep alive every 5 s
  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 5000);
    const clock = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      clearInterval(iv);
      clearInterval(clock);
    };
  }, [refresh]);

  // the feed
  useEffect(() => {
    let alive = true;
    live
      .recentEvents(liveId)
      .then(async (list) => {
        await loadPeople(list.map((e) => e.user_id ?? ''));
        if (alive) setEvents(list.filter((e) => e.kind !== 'system'));
      })
      .catch(() => {});
    const ch = supabase
      .channel(`live:${liveId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_events', filter: `live_id=eq.${liveId}` }, async (p) => {
        const e = p.new as LiveEvent;
        await loadPeople([e.user_id ?? '']);
        if (e.kind === 'system') {
          refresh();
          return;
        }
        setEvents((old) => [...old.slice(-60), e]);
        if (e.kind === 'gift' && e.gift) {
          setBursts((b) => [...b.slice(-8), { key: e.id, gift: e.gift as GiftCode, from: nameOf(e.user_id) }]);
        }
      })
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [liveId, refresh]);

  const status = l?.status;
  const iHost = !!l?.i_host;
  const hosts = useMemo(() => l?.hosts ?? [], [l?.hosts]);
  const hostsKey = hosts.map((h) => `${h.id}:${h.pub ?? ''}`).join('|');
  const media = useLiveMedia(liveId, iHost && status !== 'ended', hostsKey, !!l && status !== 'ended');

  // free taps: sent in small batches
  useEffect(() => {
    const iv = setInterval(() => {
      for (const side of ['A', 'B'] as const) {
        const n = Math.min(20, taps.current[side]);
        if (n > 0) {
          taps.current[side] -= n;
          live
            .tap(liveId, side, n)
            .then((r) => setL((x) => (x ? { ...x, taps_a: r.a, taps_b: r.b } : x)))
            .catch(() => {});
        }
      }
    }, 800);
    return () => clearInterval(iv);
  }, [liveId]);

  const leave = useCallback(async () => {
    if (left.current) return;
    left.current = true;
    await live.leave(liveId).catch(() => {});
  }, [liveId]);

  // leaving the screen = leaving the room. The main host's room keeps going: they can come back
  // (it ends by itself ~1 minute after their app stops answering).
  const mainRef = useRef(false);
  mainRef.current = !!l && (l.host.id === me || (l.kind === 'match' && l.opponent?.id === me));
  useEffect(
    () => () => {
      if (!left.current && !mainRef.current) live.leave(liveId).catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function close() {
    const mainHost = l && (l.host.id === me || (l.kind === 'match' && l.opponent?.id === me));
    if (mainHost && status !== 'ended') {
      Alert.alert(l?.kind === 'match' && status === 'live' ? t('live_quit_match_q') : t('live_end_q'), '', [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('live_end'),
          style: 'destructive',
          onPress: async () => {
            left.current = true;
            try {
              const x = l?.host.id === me ? await live.end(liveId) : await live.leave(liveId);
              if (x) setL(x);
            } catch (e) {
              Alert.alert('', errorMessage(e));
            }
          },
        },
      ]);
      return;
    }
    leave().finally(() => router.back());
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      await live.comment(liveId, body);
    } catch (e) {
      Alert.alert('', errorMessage(e));
    }
  }

  function tapSide(side: 'A' | 'B') {
    if (!l || l.kind !== 'match' || status !== 'live') return;
    taps.current[side] += 1;
    setLocalTaps((x) => ({ ...x, [side]: x[side] + 1 }));
    Haptics.selectionAsync().catch(() => {});
  }

  async function buyTaps(side: 'A' | 'B') {
    setBuySide(null);
    try {
      await live.buyTaps(liveId, side, 1);
      refresh();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    }
  }

  function hostMenu(h: LiveHost) {
    if (!l) return;
    const canKick = !h.main && (l.host.id === me || (l.opponent?.id === me && h.side === 'B'));
    Alert.alert(authorName(h), '', [
      { text: t('profile_title'), onPress: () => router.push({ pathname: '/user/[id]', params: { id: h.id } }) },
      ...(h.id !== me ? [{ text: `🎁 ${t('gift_send')}`, onPress: () => setGiftFor(h) }] : []),
      ...(canKick ? [{ text: t('live_kick'), style: 'destructive' as const, onPress: () => live.kick(liveId, h.id).then(refresh).catch((e) => Alert.alert('', errorMessage(e))) }] : []),
    ], { cancelable: true });
  }

  if (err && !l) {
    return (
      <View style={[st.root, st.center, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="radio-outline" size={48} color="#fff" />
        <Text style={st.white}>{err}</Text>
        <Pressable onPress={() => router.back()} style={st.pill}>
          <Text style={st.pillText}>{t('close')}</Text>
        </Pressable>
      </View>
    );
  }
  if (!l) {
    return (
      <View style={[st.root, st.center]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  const isMatch = l.kind === 'match';
  const remain = secondsLeft(l, skew);
  const elapsed = l.started_at ? Math.max(0, Math.round((Date.now() + skew - new Date(l.started_at).getTime()) / 1000)) : 0;
  const roundLeft = isMatch && l.started_at ? Math.max(0, ROUND_SECONDS * l.round - elapsed) : 0;
  // the server's count + my taps that are not sent yet
  const ta = l.taps_a + taps.current.A;
  const tb = l.taps_b + taps.current.B;
  const sideA = hosts.filter((h) => h.side === 'A');
  const sideB = hosts.filter((h) => h.side === 'B');
  const mainHost = l.host.id === me || (isMatch && l.opponent?.id === me);
  const streamOf = (h: LiveHost) => (h.id === me ? media.local : media.remote[h.id] ?? null);

  // ───── waiting for the opponent ─────
  if (status === 'waiting') {
    return (
      <View style={[st.root, st.center, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={st.tier}>⚔️ Match · {tierLabel(l.tier, l.match_name)}</Text>
        <Avatar uri={avatarUrl(l.host.photo_path)} name={l.host.first_name} size={84} />
        <Text style={st.vs}>VS</Text>
        {l.opponent ? <Avatar uri={avatarUrl(l.opponent.photo_path)} name={l.opponent.first_name} size={84} /> : <Text style={{ fontSize: 60 }}>❔</Text>}
        <ActivityIndicator color="#fff" style={{ marginTop: 18 }} />
        {l.my_invite ? (
          <>
            <Text style={st.white}>{t('live_match_invite', { name: authorName(l.host) })}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Pressable
                onPress={() => live.accept(liveId).then(refresh).catch((e) => Alert.alert('', errorMessage(e)))}
                style={[st.pill, { backgroundColor: PINK }]}
              >
                <Text style={st.pillText}>{t('accept_call')}</Text>
              </Pressable>
              <Pressable onPress={() => live.decline(liveId).then(() => router.back()).catch(() => router.back())} style={st.pill}>
                <Text style={st.pillText}>{t('decline_call')}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={st.white}>{l.opponent ? t('live_waiting_for', { name: authorName(l.opponent) }) : t('live_finding')}</Text>
            <Text style={[st.small, { marginTop: 4 }]}>{t('live_wait_refund')}</Text>
            <Pressable onPress={close} style={[st.pill, { marginTop: 16 }]}>
              <Text style={st.pillText}>{t('cancel')}</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  // ───── ended ─────
  if (status === 'ended') {
    const r = l.result ?? {};
    const win = l.winner_side === 'A' ? l.host : l.winner_side === 'B' ? l.opponent : null;
    return (
      <View style={[st.root, st.center, { paddingTop: insets.top, paddingHorizontal: 24 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ fontSize: 54 }}>{isMatch ? (win ? '🏆' : '🤝') : '🔴'}</Text>
        <Text style={st.endTitle}>{isMatch ? `Match · ${tierLabel(l.tier, l.match_name)}` : t('live_ended')}</Text>
        {isMatch ? (
          <Text style={st.white}>
            {authorName(l.host)} 🆚 {l.opponent ? authorName(l.opponent) : '?'}
          </Text>
        ) : null}
        {win ? <Text style={[st.endTitle, { color: '#FFD54F' }]}>👑 {authorName(win)}</Text> : isMatch ? <Text style={st.white}>{t('live_draw')}</Text> : null}
        <View style={st.endBox}>
          {isMatch ? <Text style={st.endLine}>👆 {formatCount(Number(r.taps_a ?? 0))} : {formatCount(Number(r.taps_b ?? 0))}</Text> : null}
          <Text style={st.endLine}>👀 {formatCount(Number(r.viewers ?? l.viewers_peak))}</Text>
          <Text style={st.endLine}>
            🪙 {formatCount(Number(r.gifts_a ?? 0))}
            {isMatch ? ` · ${formatCount(Number(r.gifts_b ?? 0))}` : ''}
          </Text>
          {r.commenter ? <Text style={st.endLine}>💬 {String(r.commenter)}</Text> : null}
          {r.gifter ? <Text style={st.endLine}>🎁 {String(r.gifter)}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          {l.card_post_id ? (
            <Pressable onPress={() => router.replace({ pathname: '/post/[id]', params: { id: l.card_post_id! } })} style={[st.pill, { backgroundColor: PINK }]}>
              <Text style={st.pillText}>{t('live_see_card')}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.back()} style={st.pill}>
            <Text style={st.pillText}>{t('close')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ───── in the room ─────
  const tile = (h: LiveHost, style: object, side?: 'A' | 'B') => {
    const s = streamOf(h);
    const mine = h.id === me;
    return (
      <Pressable
        key={h.id}
        onPress={() => side && !iHost && tapSide(side)}
        onLongPress={() => hostMenu(h)}
        delayLongPress={350}
        style={[st.tile, style]}
      >
        {s && !(mine ? !media.camOn : h.cam_off) ? (
          <RTCView streamURL={s.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" mirror={mine && media.front} zOrder={0} />
        ) : (
          <View style={[StyleSheet.absoluteFill, st.center, { backgroundColor: '#1a1a1a' }]}>
            <Avatar uri={avatarUrl(h.photo_path)} name={h.first_name} size={64} />
            {!s && !h.cam_off ? <ActivityIndicator color="#fff" style={{ marginTop: 8 }} /> : null}
          </View>
        )}
        <View style={st.tileName}>
          {h.mic_off || (mine && !media.micOn) ? <Ionicons name="mic-off" size={12} color="#fff" /> : null}
          <Text style={st.tileNameText} numberOfLines={1}>
            {authorName(h)}
          </Text>
        </View>
      </Pressable>
    );
  };

  const grid = () => {
    if (isMatch) {
      return (
        <View style={st.grid}>
          {(['A', 'B'] as const).map((side) => {
            const list = side === 'A' ? sideA : sideB;
            return (
              <Pressable key={side} onPress={() => !iHost && tapSide(side)} style={[st.half, { borderColor: side === 'A' ? PINK : BLUE }]}>
                {list.length ? (
                  list.map((h) => tile(h, { flex: 1 }, side))
                ) : (
                  <View style={[st.tile, st.center, { flex: 1 }]}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
                <TapFloat count={side === 'A' ? localTaps.A : localTaps.B} color={side === 'A' ? PINK : BLUE} />
              </Pressable>
            );
          })}
        </View>
      );
    }
    const n = hosts.length;
    if (n <= 1) return <View style={st.grid}>{hosts.map((h) => tile(h, { flex: 1 }))}</View>;
    return (
      <View style={[st.grid, { flexWrap: 'wrap' }]}>
        {hosts.map((h) => tile(h, { width: '50%', height: n <= 2 ? '100%' : '50%' }))}
      </View>
    );
  };

  const pct = ta + tb > 0 ? ta / (ta + tb) : 0.5;
  const wins = (side: 'A' | 'B') => l.rounds.filter((r) => r.done && r.winner === side).length;
  const giftTarget = (): LiveHost | null => hosts.find((h) => h.main && h.id !== me) ?? hosts.find((h) => h.id !== me) ?? null;

  return (
    <KeyboardAvoidingView style={st.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      <View style={{ flex: 1 }}>{grid()}</View>

      {/* top */}
      <View style={[st.top, { top: insets.top + 6, flexDirection: d.row }]} pointerEvents="box-none">
        <View style={[st.hostChip, { flexDirection: d.row }]}>
          <Avatar uri={avatarUrl(l.host.photo_path)} name={l.host.first_name} size={30} />
          <View style={{ maxWidth: 130 }}>
            <Text style={st.hostName} numberOfLines={1}>
              {authorName(l.host)}
              {isMatch && l.opponent ? ` 🆚 ${authorName(l.opponent)}` : ''}
            </Text>
            <Text style={st.small}>
              👀 {formatCount(l.viewers)} · ⏱ {mmss(remain)}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1 }} />
        <View style={st.liveBadge}>
          <Text style={st.liveBadgeText}>{isMatch ? `⚔️ ${tierLabel(l.tier, l.match_name)}` : 'LIVE'}</Text>
        </View>
        <Pressable onPress={close} hitSlop={10} style={st.x}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* the tap bar (match) */}
      {isMatch ? (
        <View style={[st.tapWrap, { top: insets.top + 52 }]} pointerEvents="box-none">
          <View style={st.tapBar}>
            <View style={[st.tapFill, { flex: Math.max(0.06, pct), backgroundColor: PINK }]}>
              <Text style={st.tapText}>{formatCount(ta)}</Text>
            </View>
            <View style={[st.tapFill, { flex: Math.max(0.06, 1 - pct), backgroundColor: BLUE, alignItems: 'flex-end' }]}>
              <Text style={st.tapText}>{formatCount(tb)}</Text>
            </View>
          </View>
          <View style={[st.roundRow, { flexDirection: 'row' }]}>
            <Text style={st.roundDots}>{'🔴'.repeat(wins('A'))}</Text>
            <Text style={st.roundText}>
              R{l.round} · {mmss(roundLeft)}
            </Text>
            <Text style={st.roundDots}>{'🔵'.repeat(wins('B'))}</Text>
          </View>
        </View>
      ) : null}

      {/* host controls */}
      {iHost ? (
        <View style={[st.controls, d.rtl ? { left: 10 } : { right: 10 }, { top: insets.top + (isMatch ? 120 : 64) }]}>
          <Ctl icon="camera-reverse" onPress={media.flip} />
          <Ctl icon={media.micOn ? 'mic' : 'mic-off'} onPress={media.toggleMic} off={!media.micOn} />
          <Ctl icon={media.camOn ? 'videocam' : 'videocam-off'} onPress={media.toggleCam} off={!media.camOn} />
          {mainHost && hosts.length < 4 ? <Ctl icon="person-add" onPress={() => setInvite(true)} /> : null}
        </View>
      ) : null}
      {media.error ? (
        <View style={[st.warn, { top: insets.top + (isMatch ? 100 : 56) }]}>
          <Text style={st.warnText}>⚠️ {media.error === 'live-off' ? t('live_off') : t('live_media_error')}</Text>
        </View>
      ) : null}

      {/* invited to join as a host */}
      {l.my_invite ? (
        <View style={[st.inviteBar, { top: insets.top + 110 }]}>
          <Text style={st.white}>{t('live_host_invite')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => live.accept(liveId).then(refresh).catch((e) => Alert.alert('', errorMessage(e)))} style={[st.pill, { backgroundColor: PINK }]}>
              <Text style={st.pillText}>{t('accept_call')}</Text>
            </Pressable>
            <Pressable onPress={() => live.decline(liveId).then(refresh).catch(() => {})} style={st.pill}>
              <Text style={st.pillText}>{t('decline_call')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* feed + most comments + input */}
      <View style={[st.bottom, { paddingBottom: insets.bottom + 8 }]} pointerEvents="box-none">
        <FlatList
          data={events.slice(-30).reverse()}
          keyExtractor={(e) => String(e.id)}
          style={st.feed}
          inverted
          renderItem={({ item }) => <FeedLine e={item} t={t} />}
          showsVerticalScrollIndicator={false}
        />
        {l.most_comment ? (
          <View style={st.most}>
            <Text style={st.mostText} numberOfLines={1}>
              🔥 {l.most_comment.body}
            </Text>
            <Text style={st.mostCount}>×{l.most_comment.count}</Text>
          </View>
        ) : null}
        <View style={[st.inputRow, { flexDirection: d.row }]}>
          <TextInput
            value={text}
            onChangeText={(v) => setText(v.slice(0, 150))}
            placeholder={t('live_type_comment')}
            placeholderTextColor="rgba(255,255,255,0.6)"
            style={[st.input, { textAlign: d.align }]}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable onPress={send} style={st.round}>
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
          {giftTarget() ? (
            <Pressable onPress={() => setGiftFor(giftTarget())} style={[st.round, { backgroundColor: '#F7B928' }]}>
              <Ionicons name="gift" size={18} color="#fff" />
            </Pressable>
          ) : null}
          {isMatch && !iHost ? (
            <Pressable onPress={() => setBuySide(buySide ? null : 'A')} style={[st.round, { backgroundColor: '#9B51E0' }]}>
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 11 }}>+100</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* buy taps: which side */}
      {buySide ? (
        <View style={[st.buy, { bottom: insets.bottom + 70 }]}>
          <Text style={[st.white, { marginBottom: 8 }]}>
            {TAPS_PACK.taps} {t('live_taps')} = {TAPS_PACK.price} FC
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => buyTaps('A')} style={[st.pill, { backgroundColor: PINK, flexDirection: 'row', gap: 4 }]}>
              <Coin size={14} />
              <Text style={st.pillText}>{authorName(l.host)}</Text>
            </Pressable>
            {l.opponent ? (
              <Pressable onPress={() => buyTaps('B')} style={[st.pill, { backgroundColor: BLUE, flexDirection: 'row', gap: 4 }]}>
                <Coin size={14} />
                <Text style={st.pillText}>{authorName(l.opponent)}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* one gift at a time */}
      {bursts[0] ? (
        <GiftBurst key={bursts[0].key} gift={bursts[0].gift} from={bursts[0].from} onDone={() => setBursts((x) => x.slice(1))} />
      ) : null}

      {giftFor ? (
        <GiftSheet to={giftFor.id} toName={authorName(giftFor)} liveId={liveId} onClose={() => setGiftFor(null)} />
      ) : null}

      <Modal visible={invite} transparent animationType="fade" onRequestClose={() => setInvite(false)}>
        <Pressable style={st.modalBack} onPress={() => setInvite(false)}>
          <Pressable style={st.modal}>
            <Text style={st.modalTitle}>{t('live_invite_title')}</Text>
            <TextInput
              value={inviteName}
              onChangeText={setInviteName}
              placeholder="@username"
              placeholderTextColor="#888"
              autoCapitalize="none"
              style={st.modalInput}
            />
            <Pressable
              onPress={async () => {
                try {
                  await live.invite(liveId, inviteName);
                  setInvite(false);
                  setInviteName('');
                  Alert.alert('✓', t('live_invited'));
                } catch (e) {
                  Alert.alert('', errorMessage(e));
                }
              }}
              style={[st.pill, { backgroundColor: PINK, marginTop: 12, alignSelf: 'stretch', alignItems: 'center' }]}
            >
              <Text style={st.pillText}>{t('send')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function FeedLine({ e, t }: { e: LiveEvent; t: (k: any, v?: any) => string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (e.kind === 'join') {
    return <Text style={st.feedJoin}>👋 {nameOf(e.user_id)} {t('live_joined')}</Text>;
  }
  if (e.kind === 'gift') {
    const g = giftOf(e.gift ?? '');
    return (
      <View style={st.feedLine}>
        <Text style={st.feedText}>
          <Text style={st.feedName}>{nameOf(e.user_id)} </Text>
          {g.emoji} {t(g.label)} · {formatCount(e.amount)} FC
        </Text>
      </View>
    );
  }
  if (e.kind === 'taps') {
    return (
      <View style={st.feedLine}>
        <Text style={st.feedText}>
          <Text style={st.feedName}>{nameOf(e.user_id)} </Text>👆 +{formatCount(e.amount)} {t('live_taps')}
        </Text>
      </View>
    );
  }
  return (
    <View style={st.feedLine}>
      <Text style={st.feedText}>
        <Text style={st.feedName}>{nameOf(e.user_id)} </Text>
        {e.body}
      </Text>
    </View>
  );
}

function Ctl({ icon, onPress, off }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; off?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[st.ctl, off && { backgroundColor: 'rgba(254,44,85,0.85)' }]}>
      <Ionicons name={icon} size={22} color="#fff" />
    </Pressable>
  );
}

/** "+1" hearts that float up where people tap */
function TapFloat({ count, color }: { count: number; color: string }) {
  const [items, setItems] = useState<{ key: number; x: number; v: Animated.Value }[]>([]);
  const last = useRef(count);
  useEffect(() => {
    if (count <= last.current) return;
    last.current = count;
    const v = new Animated.Value(0);
    const key = Date.now() + Math.random();
    setItems((old) => [...old.slice(-8), { key, x: Math.random() * 80 - 40, v }]);
    Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() =>
      setItems((old) => old.filter((i) => i.key !== key)),
    );
  }, [count]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {items.map((i) => (
        <Animated.Text
          key={i.key}
          style={{
            position: 'absolute',
            fontSize: 26,
            color,
            opacity: i.v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [{ translateX: i.x }, { translateY: i.v.interpolate({ inputRange: [0, 1], outputRange: [0, -140] }) }, { scale: i.v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.6, 1.3, 1] }) }],
          }}
        >
          ❤️
        </Animated.Text>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  white: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  small: { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  pill: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9, alignItems: 'center' },
  pillText: { color: '#fff', fontWeight: '800' },
  tier: { color: '#FFD54F', fontSize: 18, fontWeight: '900', marginBottom: 18 },
  vs: { color: PINK, fontSize: 30, fontWeight: '900', marginVertical: 10 },
  grid: { flex: 1, flexDirection: 'row' },
  half: { flex: 1, borderTopWidth: 3 },
  tile: { overflow: 'hidden', backgroundColor: '#111', borderWidth: StyleSheet.hairlineWidth, borderColor: '#000' },
  tileName: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, maxWidth: '90%' },
  tileNameText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  top: { position: 'absolute', left: 10, right: 10, alignItems: 'center', gap: 8 },
  hostChip: { alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 22, paddingRight: 12, paddingLeft: 3, paddingVertical: 3 },
  hostName: { color: '#fff', fontWeight: '800', fontSize: 13 },
  liveBadge: { backgroundColor: PINK, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  liveBadgeText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  x: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  tapWrap: { position: 'absolute', left: 10, right: 10 },
  tapBar: { flexDirection: 'row', height: 24, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)' },
  tapFill: { justifyContent: 'center', paddingHorizontal: 8 },
  tapText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  roundRow: { justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  roundDots: { fontSize: 10, minWidth: 40 },
  roundText: { color: '#fff', fontWeight: '900', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  controls: { position: 'absolute', gap: 10 },
  ctl: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  warn: { position: 'absolute', left: 10, right: 60, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 8 },
  warnText: { color: '#FFD54F', fontWeight: '700', fontSize: 12 },
  inviteBar: { position: 'absolute', left: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 14, padding: 12, alignItems: 'center', gap: 8 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 10 },
  feed: { maxHeight: 220, width: '78%' },
  feedLine: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, marginBottom: 4, maxWidth: '100%' },
  feedText: { color: '#fff', fontSize: 13 },
  feedName: { color: '#FFD54F', fontWeight: '800' },
  feedJoin: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 4 },
  most: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, backgroundColor: 'rgba(254,44,85,0.85)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 6, maxWidth: '85%' },
  mostText: { color: '#fff', fontWeight: '800', flexShrink: 1 },
  mostCount: { color: '#fff', fontWeight: '900' },
  inputRow: { alignItems: 'center', gap: 8 },
  input: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9, color: '#fff', fontSize: 14 },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  buy: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 16, padding: 14, alignItems: 'center' },
  endTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 10, textAlign: 'center' },
  endBox: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 14, marginTop: 14, alignSelf: 'stretch', gap: 6 },
  endLine: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#1B1220', borderRadius: 18, padding: 16, alignItems: 'center' },
  modalTitle: { color: '#fff', fontWeight: '900', fontSize: 16, marginBottom: 10 },
  modalInput: { alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});

/** needs the downloaded "FC & Live" pack (and 15+) */
export default function LiveRoom() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PackGate need="live" dark>
        <LiveRoomInner />
      </PackGate>
    </>
  );
}
