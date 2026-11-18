import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Coin } from '@/components/Coin';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { coins, GiftCode, GIFTS, giftOf, offerPrice, Wallet } from '@/lib/coins';
import { formatCount } from '@/lib/social';

/** F Shopping: pick a gift for a creator (40 % goes to them). */
export function GiftSheet({
  to,
  toName,
  postId,
  liveId,
  onClose,
  onSent,
}: {
  to: string;
  toName: string;
  postId?: string | null;
  liveId?: string | null;
  onClose: () => void;
  onSent?: (gift: GiftCode) => void;
}) {
  const { t, d } = useI18n();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const [w, setW] = useState<Wallet | null>(null);
  const [pick, setPick] = useState<GiftCode>('rose');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    coins.wallet().then(setW).catch(() => {});
  }, []);

  const g = giftOf(pick);
  const price = offerPrice(w, g.price, pick);
  const enough = !!w && (w.unlimited || w.balance >= price);

  async function send() {
    setBusy(true);
    try {
      const r = await coins.sendGift(to, pick, postId, liveId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setW((old) => (old ? { ...old, balance: r.balance ?? old.balance, spent: old.spent + r.price } : old));
      onSent?.(pick);
      onClose();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={st.backdrop} onPress={onClose}>
        <Pressable style={[st.sheet, { paddingBottom: 14 + bottom }]}>
          <View style={[st.head, { flexDirection: d.row }]}>
            <Text style={st.title}>🛍️ F Shopping</Text>
            <Pressable
              onPress={() => {
                onClose();
                router.push('/settings/fc');
              }}
              style={[st.balance, { flexDirection: d.row }]}
            >
              <Coin size={16} />
              <Text style={st.balanceText}>{w ? (w.unlimited ? '∞' : formatCount(w.balance)) : '…'}</Text>
              <Ionicons name="add-circle" size={18} color="#FFD54F" />
            </Pressable>
          </View>
          <Text style={[st.to, { textAlign: d.align }]}>{t('gift_to', { name: toName })}</Text>
          <View style={st.grid}>
            {GIFTS.map((x) => {
              const on = x.code === pick;
              const p = offerPrice(w, x.price, x.code);
              return (
                <Pressable key={x.code} onPress={() => setPick(x.code)} style={[st.cell, on && { borderColor: x.color, backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                  {w?.daily_gift === x.code ? <Text style={st.sale}>-20%</Text> : null}
                  {x.code === 'fplus' ? <FPlusMark size={34} /> : <Text style={st.emoji}>{x.emoji}</Text>}
                  <Text style={st.name} numberOfLines={1}>
                    {t(x.label)}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Coin size={12} />
                    <Text style={st.price}>{formatCount(p)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {pick === 'fplus' ? <Text style={[st.note, { textAlign: d.align }]}>✨ {t('fplus_info')}</Text> : null}
          {w?.discount9 ? <Text style={[st.note, { textAlign: d.align }]}>🏷️ {t('fc_offer9_on')}</Text> : null}
          {enough ? (
            <Pressable onPress={send} disabled={busy} style={[st.send, { backgroundColor: g.color }]}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={st.sendText}>
                  {t('gift_send')} · {formatCount(price)} FC
                </Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={() => {
                onClose();
                router.push('/settings/fc');
              }}
              style={[st.send, { backgroundColor: '#F2994A' }]}
            >
              <Text style={st.sendText}>{w ? t('fc_get_more') : '…'}</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** The F+ mark (Faisal Show logo with a "+"). */
export function FPlusMark({ size = 34 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Image source={require('../../assets/logo-mark.png')} style={{ width: size, height: size, borderRadius: size / 4 }} />
      <View style={[st.plus, { width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25, right: -size * 0.12, top: -size * 0.12 }]}>
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: size * 0.34, lineHeight: size * 0.42 }}>+</Text>
      </View>
    </View>
  );
}

/**
 * Full-screen gift animation: the gift pops in big, sparkles fly out, then it floats up and fades.
 * Tiger and F+ get a stronger show (shake + golden ring).
 */
export function GiftBurst({ gift, from, onDone }: { gift: GiftCode; from?: string; onDone: () => void }) {
  const g = giftOf(gift);
  const pop = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const sparks = useRef([...Array(12)].map(() => new Animated.Value(0))).current;
  const big = gift === 'tiger' || gift === 'fplus' || gift === 'smart_gift';
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    Haptics.impactAsync(big ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Animated.sequence([
      Animated.parallel([
        Animated.spring(pop, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true }),
        Animated.timing(ring, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.stagger(
          25,
          sparks.map((s) => Animated.timing(s, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true })),
        ),
      ]),
      Animated.delay(big ? 900 : 500),
      Animated.timing(rise, { toValue: 1, duration: 600, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => done.current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, big ? 1.5 : 1.2] });
  const rotate = pop.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-20deg', '12deg', '0deg'] });
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [0, -260] });
  const opacity = rise.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', zIndex: 50 }]}>
      <Animated.View style={{ alignItems: 'center', opacity, transform: [{ translateY }] }}>
        <Animated.View
          style={[
            st.ring,
            {
              borderColor: g.color,
              opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.6] }) }],
            },
          ]}
        />
        {sparks.map((s, i) => {
          const a = (i / sparks.length) * Math.PI * 2;
          const r = big ? 150 : 110;
          return (
            <Animated.Text
              key={i}
              style={[
                st.spark,
                {
                  opacity: s.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                  transform: [
                    { translateX: s.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * r] }) },
                    { translateY: s.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * r] }) },
                    { scale: s.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.1] }) },
                  ],
                },
              ]}
            >
              {i % 3 === 0 ? '✨' : i % 3 === 1 ? '💖' : '⭐'}
            </Animated.Text>
          );
        })}
        <Animated.View style={{ transform: [{ scale }, { rotate }] }}>
          {gift === 'fplus' ? <FPlusMark size={90} /> : <Text style={{ fontSize: 96 }}>{g.emoji}</Text>}
        </Animated.View>
        {from ? (
          <View style={st.label}>
            <Text style={st.labelText} numberOfLines={1}>
              {from}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1B1220', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 14, paddingTop: 12 },
  head: { alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontSize: 18, fontWeight: '900' },
  balance: { alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  balanceText: { color: '#FFD54F', fontWeight: '900' },
  to: { color: 'rgba(255,255,255,0.7)', marginTop: 6, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  cell: { width: '23%', alignItems: 'center', paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent', gap: 3 },
  sale: { position: 'absolute', top: 2, right: 2, backgroundColor: '#FE2C55', color: '#fff', fontSize: 9, fontWeight: '900', paddingHorizontal: 4, borderRadius: 6, overflow: 'hidden' },
  emoji: { fontSize: 32 },
  name: { color: '#fff', fontSize: 11, fontWeight: '700' },
  price: { color: '#FFD54F', fontSize: 12, fontWeight: '800' },
  note: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 8 },
  send: { borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  sendText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  plus: { position: 'absolute', backgroundColor: '#FE2C55', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 6 },
  spark: { position: 'absolute', fontSize: 22 },
  label: { marginTop: 18, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, maxWidth: 260 },
  labelText: { color: '#fff', fontWeight: '800' },
});

/** GiftBurst over the whole screen (for places that are not full-screen themselves). */
export function GiftBurstModal({ gift, from, onDone }: { gift: GiftCode; from?: string; onDone: () => void }) {
  return (
    <Modal visible transparent animationType="none" onRequestClose={onDone} statusBarTranslucent>
      <GiftBurst gift={gift} from={from} onDone={onDone} />
    </Modal>
  );
}
