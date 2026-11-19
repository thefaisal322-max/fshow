import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Coin } from '@/components/Coin';
import { Card, P, Page } from '@/components/ui';
import { StringKey, useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  BUY_MAX,
  BUY_MIN,
  BUY_QUICK,
  coins,
  fcToAfs,
  giftOf,
  HESABPAY_NUMBER,
  PAYOUT_MAX,
  PAYOUT_MIN,
  Wallet,
} from '@/lib/coins';
import { formatCount, timeAgo } from '@/lib/social';
import { colors, radius } from '@/theme';

const OUT_QUICK = [25, 50, 100, 250, 500, 1000, 5000, 10000];

/** Profile → Settings → FC: balance, buy coins (HesabPay + receipt), offers, cash out, history. */
export default function FcScreen() {
  const { t, d } = useI18n();
  const router = useRouter();
  const { session } = useAuth();
  const [w, setW] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [outAfs, setOutAfs] = useState('');
  const [phone, setPhone] = useState('');
  const [cashing, setCashing] = useState(false);

  const load = useCallback(() => {
    coins
      .wallet()
      .then(setW)
      .catch((e) => Alert.alert('', errorMessage(e)));
    coins
      .myHesabpay()
      .then((n) => n && setPhone((old) => old || n))
      .catch(() => {});
  }, []);
  useFocusEffect(load);

  if (!w) {
    return (
      <Page>
        <Stack.Screen options={{ title: t('fc_title') }} />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      </Page>
    );
  }

  const coinsWanted = custom ? Math.floor(Number(custom.replace(/[^0-9]/g, '')) || 0) : amount;
  const validBuy = coinsWanted >= BUY_MIN && coinsWanted <= BUY_MAX;
  const afs = fcToAfs(coinsWanted);

  async function pickReceipt() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!r.canceled && r.assets[0]) setReceipt(r.assets[0].uri);
  }

  async function sendBuy() {
    if (!session || !receipt || !validBuy) return;
    setSending(true);
    try {
      await coins.buy(session.user.id, coinsWanted, receipt);
      setReceipt(null);
      setCustom('');
      Alert.alert('', t('fc_buy_sent'));
      load();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function cashOut() {
    const a = Math.floor(Number(outAfs) || 0);
    if (a < PAYOUT_MIN || a > PAYOUT_MAX) {
      Alert.alert('', t('fc_out_range', { min: PAYOUT_MIN, max: PAYOUT_MAX }));
      return;
    }
    setCashing(true);
    try {
      await coins.cashOut(a, phone);
      setOutAfs('');
      Alert.alert('', t('fc_out_sent'));
      load();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setCashing(false);
    }
  }

  const daily = giftOf(w.daily_gift);
  const pendingBuys = w.purchases.filter((p) => p.status === 'pending');

  return (
    <Page>
      <Stack.Screen options={{ title: t('fc_title') }} />

      {/* balance */}
      <View style={st.wallet}>
        <Coin size={64} />
        <Text style={st.walletLabel}>{t('fc_balance')}</Text>
        <Text style={st.balance}>{w.unlimited ? '∞' : formatCount(w.balance)} FC</Text>
        {!w.unlimited ? <Text style={st.walletSub}>≈ {fcToAfs(w.balance)} AFS · 1000 FC = 100 AFS</Text> : <Text style={st.walletSub}>{t('fc_unlimited')}</Text>}
        <View style={{ flexDirection: d.row, gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {w.foru_left > 0 ? <Text style={st.pill}>🚀 4u: +{formatCount(w.foru_left)}</Text> : null}
          {w.fplus_until ? <Text style={st.pill}>✨ F+ · {new Date(w.fplus_until).toLocaleDateString()}</Text> : null}
          {w.earned > 0 ? <Text style={st.pill}>💰 {t('fc_earned', { n: formatCount(w.earned) })}</Text> : null}
        </View>
      </View>

      {/* buy */}
      <Card>
        <Text style={[st.h, { textAlign: d.align }]}>🛒 {t('fc_buy')}</Text>
        <View style={[st.chips, { flexDirection: d.row }]}>
          {BUY_QUICK.map((n) => {
            const on = !custom && amount === n;
            return (
              <Pressable
                key={n}
                onPress={() => {
                  setAmount(n);
                  setCustom('');
                }}
                style={[st.chip, on && st.chipOn]}
              >
                <Coin size={14} />
                <Text style={[st.chipText, on && { color: '#fff' }]}>{formatCount(n)}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={custom}
          onChangeText={(v) => setCustom(v.replace(/[^0-9]/g, '').slice(0, 5))}
          placeholder={t('fc_custom', { min: BUY_MIN, max: formatCount(BUY_MAX) })}
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          style={[st.input, { textAlign: d.align }]}
        />
        <View style={st.payBox}>
          <Text style={[st.payLine, { textAlign: d.align }]}>{t('fc_pay_step1', { afs, n: formatCount(coinsWanted) })}</Text>
          <Pressable
            onPress={() => {
              Clipboard.setStringAsync(HESABPAY_NUMBER);
              Alert.alert('', t('copied'));
            }}
            style={[st.number, { flexDirection: d.row }]}
          >
            <Ionicons name="wallet" size={18} color={colors.primary} />
            <Text selectable style={st.numberText}>
              HesabPay · {HESABPAY_NUMBER}
            </Text>
            <Ionicons name="copy-outline" size={16} color={colors.muted} />
          </Pressable>
          <Text style={[st.payLine, { textAlign: d.align }]}>{t('fc_pay_step2')}</Text>
          <Pressable onPress={pickReceipt} style={st.receipt}>
            {receipt ? (
              <Image source={{ uri: receipt }} style={{ width: '100%', height: 160, borderRadius: radius.sm }} resizeMode="contain" />
            ) : (
              <>
                <Ionicons name="receipt-outline" size={28} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('fc_pick_receipt')}</Text>
              </>
            )}
          </Pressable>
          <Pressable onPress={sendBuy} disabled={!receipt || !validBuy || sending} style={[st.btn, (!receipt || !validBuy) && { opacity: 0.5 }]}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>{t('fc_send_receipt')}</Text>}
          </Pressable>
          <P muted>{t('fc_buy_note')}</P>
        </View>
        {pendingBuys.map((p) => (
          <Text key={p.id} style={[st.small, { textAlign: d.align }]}>
            ⏳ {formatCount(p.coins)} FC · {p.afs} AFS · {timeAgo(p.created_at)}
          </Text>
        ))}
      </Card>

      {/* offers */}
      <Card>
        <Text style={[st.h, { textAlign: d.align }]}>🎉 {t('fc_offers')}</Text>
        <View style={[st.offer, { flexDirection: d.row }]}>
          <Text style={st.offerIcon}>{daily.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[st.offerTitle, { textAlign: d.align }]}>{t('fc_daily_gift', { gift: t(daily.label) })}</Text>
            <Text style={[st.small, { textAlign: d.align }]}>{t('fc_daily_gift_sub')}</Text>
          </View>
        </View>
        <View style={[st.offer, { flexDirection: d.row }]}>
          <Text style={st.offerIcon}>🏷️</Text>
          <View style={{ flex: 1 }}>
            <Text style={[st.offerTitle, { textAlign: d.align }]}>{t('fc_offer9')}</Text>
            {w.discount9 ? (
              <Text style={[st.small, { color: colors.success, textAlign: d.align }]}>✓ {t('fc_offer9_on')}</Text>
            ) : (
              <>
                <Text style={[st.small, { textAlign: d.align }]}>{t('fc_offer9_left', { n: formatCount(Math.max(0, 1000 - w.spent)) })}</Text>
                <View style={st.track}>
                  <View style={[st.fill, { width: `${Math.min(100, (w.spent / 1000) * 100)}%` as `${number}%` }]} />
                </View>
              </>
            )}
          </View>
        </View>
        <View style={[st.offer, { flexDirection: d.row }]}>
          <Text style={st.offerIcon}>🎂</Text>
          <View style={{ flex: 1 }}>
            <Text style={[st.offerTitle, { textAlign: d.align }]}>{t('fc_birthday')}</Text>
            <Text style={[st.small, { textAlign: d.align }]}>{t('fc_birthday_sub')}</Text>
          </View>
          {w.birthday_ready ? (
            <Pressable
              onPress={async () => {
                try {
                  await coins.claimBirthday();
                  Alert.alert('', '🎂 +50 FC');
                  load();
                } catch (e) {
                  Alert.alert('', errorMessage(e));
                }
              }}
              style={[st.smallBtn]}
            >
              <Text style={st.btnText}>+50</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={[st.offer, { flexDirection: d.row }]}>
          <Text style={st.offerIcon}>🚀</Text>
          <View style={{ flex: 1 }}>
            <Text style={[st.offerTitle, { textAlign: d.align }]}>4u</Text>
            <Text style={[st.small, { textAlign: d.align }]}>{t('fc_4u_sub')}</Text>
          </View>
        </View>
      </Card>

      {/* promote */}
      <Card>
        <Pressable onPress={() => router.push('/promote')} style={[st.offer, { flexDirection: d.row }]}>
          <Text style={st.offerIcon}>📣</Text>
          <View style={{ flex: 1 }}>
            <Text style={[st.offerTitle, { textAlign: d.align }]}>{t('promote')}</Text>
            <Text style={[st.small, { textAlign: d.align }]}>{t('promote_sub')}</Text>
          </View>
          <Ionicons name={d.rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
        </Pressable>
      </Card>

      {/* cash out */}
      <Card>
        <Text style={[st.h, { textAlign: d.align }]}>💵 {t('fc_cash_out')}</Text>
        <P muted>{t('fc_cash_sub', { n: formatCount(w.cashable), afs: fcToAfs(w.cashable), min: PAYOUT_MIN, max: formatCount(PAYOUT_MAX) })}</P>
        <View style={[st.chips, { flexDirection: d.row }]}>
          {OUT_QUICK.map((n) => {
            const on = Number(outAfs) === n;
            const can = n * 10 <= w.cashable;
            return (
              <Pressable key={n} disabled={!can} onPress={() => setOutAfs(String(n))} style={[st.chip, on && st.chipOn, !can && { opacity: 0.35 }]}>
                <Text style={[st.chipText, on && { color: '#fff' }]}>{formatCount(n)} AFS</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={outAfs}
          onChangeText={(v) => setOutAfs(v.replace(/[^0-9]/g, '').slice(0, 5))}
          placeholder={t('fc_out_afs')}
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          style={[st.input, { textAlign: d.align }]}
        />
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder={t('hesabpay_phone')}
          placeholderTextColor={colors.muted}
          keyboardType="phone-pad"
          style={[st.input, { textAlign: d.align }]}
        />
        {outAfs ? <Text style={[st.small, { textAlign: d.align }]}>= {formatCount((Number(outAfs) || 0) * 10)} FC</Text> : null}
        <Pressable onPress={cashOut} disabled={cashing || !outAfs || !phone} style={[st.btn, (!outAfs || !phone) && { opacity: 0.5 }]}>
          {cashing ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>{t('withdraw')}</Text>}
        </Pressable>
        <P muted>{t('fc_cash_note')}</P>
        {w.payouts.map((p) => (
          <Text key={p.id} style={[st.small, { textAlign: d.align }]}>
            {p.status === 'paid' ? '✅' : p.status === 'rejected' ? '✗' : '⏳'} {p.afs} AFS · {p.phone} · {timeAgo(p.created_at)}
          </Text>
        ))}
      </Card>

      {/* history */}
      {w.history.length ? (
        <Card>
          <Text style={[st.h, { textAlign: d.align }]}>🧾 {t('fc_history')}</Text>
          {w.history.map((h, i) => (
            <View key={i} style={[st.hist, { flexDirection: d.row }]}>
              <Text style={{ flex: 1, color: colors.text, textAlign: d.align }}>{t(`fck_${h.kind}` as StringKey)}</Text>
              <Text style={{ color: h.delta > 0 ? colors.success : colors.error, fontWeight: '800' }}>
                {h.delta > 0 ? '+' : ''}
                {formatCount(h.delta)}
              </Text>
              <Text style={[st.small, { width: 70, textAlign: 'right' }]}>{timeAgo(h.created_at)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </Page>
  );
}

const st = StyleSheet.create({
  wallet: { backgroundColor: '#2A1020', borderRadius: radius.lg, padding: 18, alignItems: 'center', marginBottom: 12 },
  walletLabel: { color: '#F8C9E3', fontSize: 13, marginTop: 6 },
  balance: { color: '#FFD54F', fontSize: 34, fontWeight: '900' },
  walletSub: { color: '#F8C9E3', fontSize: 12 },
  pill: { color: '#fff', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  h: { fontSize: 17, fontWeight: '900', color: colors.text, marginBottom: 8 },
  chips: { flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '800', color: colors.text },
  input: { backgroundColor: colors.input, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text, marginBottom: 8 },
  payBox: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 12, gap: 8 },
  payLine: { color: colors.text, fontSize: 14, lineHeight: 21 },
  number: { alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: radius.sm, padding: 10 },
  numberText: { flex: 1, fontSize: 16, fontWeight: '900', color: colors.text },
  receipt: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.md, minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 },
  btn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  smallBtn: { backgroundColor: colors.success, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 14 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  small: { fontSize: 12, color: colors.muted, marginTop: 2 },
  offer: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  offerIcon: { fontSize: 28, width: 40, textAlign: 'center' },
  offerTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginTop: 4 },
  fill: { height: 6, backgroundColor: colors.primary },
  hist: { alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
