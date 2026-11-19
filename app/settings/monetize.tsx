import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Card, P, Page } from '@/components/ui';
import { StringKey, tr, useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PackCard } from '@/components/PackGate';
import { coins } from '@/lib/coins';
import { Challenge, isDone, monetize, Monetization } from '@/lib/monetize';
import { formatCount } from '@/lib/social';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const HESAB_LINK = 'https://application.hesab.com/I1651B8V';

const META: Record<string, { icon: IconName; key: StringKey }> = {
  fainet_account: { icon: 'globe', key: 'ch_fainet_account' },
  hesabpay_account: { icon: 'wallet', key: 'ch_hesabpay_account' },
  facebook_mention: { icon: 'logo-facebook', key: 'ch_facebook_mention' },
  profile_ready: { icon: 'person-circle', key: 'ch_profile_ready' },
  reels_count: { icon: 'film', key: 'ch_reels_count' },
  followers: { icon: 'people', key: 'ch_followers' },
  post_views: { icon: 'eye', key: 'ch_post_views' },
  reel_plays: { icon: 'play-circle', key: 'ch_reel_plays' },
  likes_total: { icon: 'heart', key: 'ch_likes_total' },
  posts_count: { icon: 'images', key: 'ch_posts_count' },
  comments_received: { icon: 'chatbubbles', key: 'ch_comments_received' },
  shares_total: { icon: 'arrow-redo', key: 'ch_shares_total' },
};

export function challengeTitle(c: { metric: string; target: number }): string {
  const m = META[c.metric];
  return m ? tr(m.key, { n: formatCount(c.target) }) : c.metric;
}

/** Monetize: the 5 rules (or 2,500 FC) + an admin's yes; then every finished challenge = 30 FC. */
export default function Monetize() {
  const router = useRouter();
  const { t, d } = useI18n();
  const [m, setM] = useState<Monetization | null>(null);
  const [proof, setProof] = useState<Challenge | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    monetize
      .get()
      .then(setM)
      .catch((e) => Alert.alert('', errorMessage(e)));
  }, []);
  useFocusEffect(load);

  if (!m) {
    return (
      <Page>
        <Stack.Screen options={{ title: t('monetize') }} />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      </Page>
    );
  }

  const qualify = m.challenges.filter((c) => c.stage === 'qualify');
  const earn = m.challenges.filter((c) => c.stage === 'earn');
  const qDone = qualify.filter(isDone).length;
  const openEarn = earn.filter((c) => !isDone(c));
  // the total number of challenges is not shown — only the next few
  const shownEarn = showAll ? openEarn.slice(0, 30) : openEarn.slice(0, 8);

  return (
    <Page>
      <Stack.Screen options={{ title: t('monetize') }} />

      {/* coins */}
      <Pressable onPress={() => router.push('/settings/fc')} style={st.wallet}>
        <Text style={st.walletLabel}>{t('fc_balance')}</Text>
        <Text style={st.balance}>🪙 {m.is_admin ? '∞' : formatCount(m.coins ?? 0)} FC</Text>
        <Text style={st.walletSub}>{t('fc_per_challenge', { n: m.fc_per_challenge })} · 1000 FC = 100 AFS</Text>
        <View style={{ flexDirection: d.row, gap: 10, marginTop: 12 }}>
          <View style={st.walletBtn}>
            <Ionicons name="wallet-outline" size={18} color="#B5136C" />
            <Text style={st.walletBtnText}>{t('fc_open_wallet')}</Text>
          </View>
          {m.is_admin ? (
            <Pressable onPress={() => router.push('/main')} style={st.walletBtn}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#B5136C" />
              <Text style={st.walletBtnText}>{t('admin_panel')}</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>

      {/* way 1: the 5 rules */}
      <Card>
        <View style={[st.head, { flexDirection: d.row }]}>
          <Text style={st.h}>
            {m.qualified ? '✅ ' : '1️⃣ '}
            {t('stage_qualify')}
          </Text>
          <Text style={st.count}>
            {qDone}/{qualify.length}
          </Text>
        </View>
        <P muted>{m.qualified ? t('qualified_text') : t('qualify_text')}</P>
        {qualify.map((c) => (
          <ChallengeRow key={c.id} c={c} value={m.metrics[c.metric]} onProof={() => setProof(c)} />
        ))}
        {m.all_done && m.application !== 'approved' ? <PhoneStep m={m} onSent={load} /> : null}
      </Card>

      {/* way 2: pay 2500 FC */}
      {!m.qualified && !m.all_done ? <PayStep m={m} onSent={load} /> : null}

      {/* challenges: 30 FC each */}
      <Card style={!m.qualified ? { opacity: 0.55 } : undefined}>
        <View style={[st.head, { flexDirection: d.row }]}>
          <Text style={st.h}>
            {m.qualified ? '2️⃣ ' : '🔒 '}
            {t('stage_earn')}
          </Text>
          <Text style={st.count}>✓ {m.earn_done}</Text>
        </View>
        <P muted>{m.qualified ? t('earn_text_fc', { n: m.fc_per_challenge }) : t('earn_locked')}</P>
        {shownEarn.map((c) => (
          <ChallengeRow key={c.id} c={c} value={m.metrics[c.metric]} locked={!m.qualified} />
        ))}
        {openEarn.length > 8 ? (
          <Pressable onPress={() => setShowAll((x) => !x)} style={st.more}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>{showAll ? t('less') : t('more')}</Text>
          </Pressable>
        ) : null}
      </Card>

      {/* the coins & live pack (not inside the APK) */}
      <View style={{ marginTop: 4, marginBottom: 12 }}>
        <PackCard need="live" />
      </View>

      {proof ? <ProofSheet c={proof} onClose={() => setProof(null)} onSent={load} /> : null}
    </Page>
  );
}

/** Monetize without the 5 rules: pay 2,500 FC; an admin still approves (a "no" gives the coins back). */
function PayStep({ m, onSent }: { m: Monetization; onSent: () => void }) {
  const { t, d } = useI18n();
  const router = useRouter();
  const [phone, setPhone] = useState(m.phone ?? '');
  const [busy, setBusy] = useState(false);
  const clean = phone.replace(/[\s-]/g, '');
  const valid = /^(\+93|0)7[0-9]{8}$/.test(clean);
  const paidPending = m.application === 'pending' && m.paid_fc > 0;

  async function pay() {
    Alert.alert(t('monetize_pay_q', { n: formatCount(m.monetize_price) }), t('monetize_pay_note'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('pay_word'),
        onPress: async () => {
          setBusy(true);
          try {
            await coins.monetizeWithCoins(clean);
            onSent();
            Alert.alert('✓', t('phone_sent'));
          } catch (e) {
            Alert.alert('', errorMessage(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <Card>
      <Text style={[st.h, { textAlign: d.align }]}>⚡ {t('monetize_pay_title', { n: formatCount(m.monetize_price) })}</Text>
      {paidPending ? (
        <Text style={[st.chTitle, { textAlign: d.align, marginTop: 6 }]}>⏳ {t('monetize_waiting')}</Text>
      ) : (
        <>
          <P muted>{t('monetize_pay_sub')}</P>
          {m.application === 'rejected' ? <Text style={[st.small, { color: colors.error, textAlign: d.align }]}>{t('monetize_rejected')}</Text> : null}
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="HesabPay 07xxxxxxxx"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            maxLength={16}
            style={[st.input, { textAlign: 'left' }]}
          />
          {(m.coins ?? 0) >= m.monetize_price || m.is_admin ? (
            <Pressable onPress={pay} disabled={!valid || busy} style={[st.cta, !valid && { opacity: 0.5 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.ctaText}>🪙 {formatCount(m.monetize_price)} FC</Text>}
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push('/settings/fc')} style={[st.cta, { backgroundColor: '#F2994A' }]}>
              <Text style={st.ctaText}>{t('fc_get_more')}</Text>
            </Pressable>
          )}
        </>
      )}
    </Card>
  );
}

function ChallengeRow({ c, value = 0, onProof, locked }: { c: Challenge; value?: number; onProof?: () => void; locked?: boolean }) {
  const { t, d } = useI18n();
  const meta = META[c.metric] ?? { icon: 'star' as IconName };
  const done = isDone(c);
  const pct = c.kind === 'auto' ? Math.min(1, value / c.target) : done ? 1 : 0;
  const status =
    c.status === 'pending' ? `⏳ ${t('ch_pending')}` : c.status === 'rejected' ? `✗ ${t('ch_rejected')}${c.note ? ` — ${c.note}` : ''}` : null;

  return (
    <View style={[st.ch, { flexDirection: d.row }]}>
      <View style={[st.chIcon, done && { backgroundColor: colors.success }]}>
        <Ionicons name={done ? 'checkmark' : meta.icon} size={18} color={done ? '#fff' : colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[st.chTitle, { textAlign: d.align }, done && { color: colors.muted, textDecorationLine: 'line-through' }]}>{challengeTitle(c)}</Text>
        {c.kind === 'auto' && !done ? (
          <>
            <View style={st.track}>
              <View style={[st.fill, { width: `${Math.round(pct * 100)}%` as `${number}%` }]} />
            </View>
            <Text style={[st.small, { textAlign: d.align }]}>
              {formatCount(Math.min(value, c.target))} / {formatCount(c.target)}
            </Text>
          </>
        ) : null}
        {c.metric === 'hesabpay_account' && !done ? (
          <Text style={[st.link, { textAlign: d.align }]} onPress={() => Linking.openURL(HESAB_LINK)}>
            {t('open_hesabpay')} ↗
          </Text>
        ) : null}
        {c.metric === 'fainet_account' && !done ? (
          <Text style={[st.link, { textAlign: d.align }]} onPress={() => Linking.openURL('https://fainet.org')}>
            fainet.org ↗
          </Text>
        ) : null}
        {status ? <Text style={[st.small, { textAlign: d.align, color: c.status === 'rejected' ? colors.error : colors.muted }]}>{status}</Text> : null}
      </View>
      {c.kind === 'proof' && !done && c.status !== 'pending' && !locked ? (
        <Pressable onPress={onProof} style={st.sendBtn}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{c.status === 'rejected' ? t('resend') : t('send_proof')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** After the 5 rules: the HesabPay number money will be sent to, then an admin approves. */
function PhoneStep({ m, onSent }: { m: Monetization; onSent: () => void }) {
  const { t, d } = useI18n();
  const [phone, setPhone] = useState(m.phone ?? '');
  const [busy, setBusy] = useState(false);
  const clean = phone.replace(/[\s-]/g, '');
  const valid = /^(\+93|0)7[0-9]{8}$/.test(clean);

  async function send() {
    setBusy(true);
    try {
      await monetize.requestMonetization(clean);
      onSent();
      Alert.alert('✓', t('phone_sent'));
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (m.application === 'pending') {
    return (
      <View style={st.phoneBox}>
        <Text style={[st.chTitle, { textAlign: d.align }]}>⏳ {t('monetize_waiting')}</Text>
        <Text style={[st.small, { textAlign: d.align }]}>HesabPay: {m.phone}</Text>
      </View>
    );
  }
  return (
    <View style={st.phoneBox}>
      <Text style={[st.chTitle, { textAlign: d.align }]}>🎉 {t('rules_done')}</Text>
      {m.application === 'rejected' ? <Text style={[st.small, { color: colors.error, textAlign: d.align }]}>{t('monetize_rejected')}</Text> : null}
      <Text style={[st.small, { textAlign: d.align }]}>{t('phone_needed')}</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="07xxxxxxxx"
        placeholderTextColor={colors.muted}
        keyboardType="phone-pad"
        maxLength={16}
        style={[st.input, { textAlign: 'left' }]}
      />
      <Pressable onPress={send} disabled={!valid || busy} style={[st.cta, !valid && { opacity: 0.5 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.ctaText}>{t('send_for_approval')}</Text>}
      </Pressable>
    </View>
  );
}

function ProofSheet({ c, onClose, onSent }: { c: Challenge; onClose: () => void; onSent: () => void }) {
  const { t, d } = useI18n();
  const { session } = useAuth();
  const bottom = useBottomSpace();
  const [text, setText] = useState('');
  const [img, setImg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isEmail = c.metric === 'fainet_account';
  const help = isEmail ? t('proof_email_help') : c.metric === 'hesabpay_account' ? t('proof_hesab_help') : t('proof_fb_help');

  async function pick() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!r.canceled && r.assets[0]) setImg(r.assets[0].uri);
  }

  async function send() {
    if (!text.trim() && !img) return;
    setBusy(true);
    try {
      await monetize.submitProof(session!.user.id, c.id, text, img);
      onClose();
      onSent();
      Alert.alert('✓', t('proof_sent'));
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={busy ? undefined : onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={[st.sheet, { paddingBottom: 20 + bottom }]}>
            <Text style={st.sheetTitle}>{challengeTitle(c)}</Text>
            <P muted>{help}</P>
            {c.metric === 'hesabpay_account' ? (
              <Pressable onPress={() => Linking.openURL(HESAB_LINK)} style={st.hesabBtn}>
                <Ionicons name="wallet" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800' }}>{t('open_hesabpay')}</Text>
              </Pressable>
            ) : null}
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={isEmail ? 'name@fainet.org' : t('proof_link_ph')}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType={isEmail ? 'email-address' : 'default'}
              style={[st.input, { textAlign: d.align }]}
              maxLength={500}
            />
            <Pressable onPress={pick} style={st.pick}>
              {img ? (
                <Image source={{ uri: img }} style={{ width: '100%', height: 220, borderRadius: radius.md }} resizeMode="contain" />
              ) : (
                <>
                  <Ionicons name="image-outline" size={30} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('add_screenshot')}</Text>
                </>
              )}
            </Pressable>
            <Pressable onPress={send} disabled={busy || (!text.trim() && !img)} style={[st.cta, !text.trim() && !img && { opacity: 0.5 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.ctaText}>{t('send_proof')}</Text>}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// Money is paid out through HesabPay only.
const METHODS = ['HesabPay'];

const st = StyleSheet.create({
  wallet: { backgroundColor: '#B5136C', borderRadius: radius.lg, padding: 20, marginBottom: 12 },
  walletLabel: { color: '#FFD6EC', fontWeight: '700' },
  balance: { color: '#fff', fontSize: 34, fontWeight: '900', marginTop: 4 },
  walletSub: { color: '#FFE4F2', marginTop: 4, fontSize: 13 },
  walletBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: radius.full, paddingHorizontal: 16, paddingVertical: 9 },
  walletBtnText: { color: '#B5136C', fontWeight: '800' },
  head: { justifyContent: 'space-between', alignItems: 'center' },
  h: { fontSize: 17, fontWeight: '800', color: colors.text },
  count: { fontSize: 15, fontWeight: '800', color: colors.primary },
  ch: { alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  chTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  small: { fontSize: 12, color: colors.muted },
  link: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  track: { height: 7, borderRadius: 4, backgroundColor: colors.surface, overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4, backgroundColor: colors.primary },
  sendBtn: { backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 7 },
  more: { alignItems: 'center', paddingTop: 12 },
  payRow: { paddingVertical: 8, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, gap: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  phoneBox: { marginTop: 12, gap: 8, backgroundColor: colors.soft, borderRadius: radius.md, padding: 12 },
  hesabBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2E7D32', borderRadius: radius.md, paddingVertical: 11 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: 16, color: colors.text },
  pick: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.md, minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 },
  cta: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  method: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7 },
  methodOn: { borderColor: colors.primary, backgroundColor: colors.soft },
});
