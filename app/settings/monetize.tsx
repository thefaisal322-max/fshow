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
import { afs, Challenge, isDone, monetize, Monetization } from '@/lib/monetize';
import { formatCount } from '@/lib/social';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

const META: Record<string, { icon: IconName; key: StringKey }> = {
  fainet_account: { icon: 'globe', key: 'ch_fainet_account' },
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

/** Monetize: 5 challenges to unlock, then 100 challenges — every 5 finished = 5 AFS. */
export default function Monetize() {
  const router = useRouter();
  const { t, d } = useI18n();
  const [m, setM] = useState<Monetization | null>(null);
  const [proof, setProof] = useState<Challenge | null>(null);
  const [payout, setPayout] = useState(false);
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
  const shownEarn = showAll ? earn : openEarn.slice(0, 8);
  const towardNext = m.earn_done % m.reward_every;

  return (
    <Page>
      <Stack.Screen options={{ title: t('monetize') }} />

      {/* wallet */}
      <View style={st.wallet}>
        <Text style={st.walletLabel}>{t('your_balance')}</Text>
        <Text style={st.balance}>؋ {afs(m.balance_afs)}</Text>
        <Text style={st.walletSub}>
          {t('earned_total', { n: afs(m.earned_afs) })} · {t('reward_rule', { n: m.reward_every, afs: m.reward_afs })}
        </Text>
        <View style={{ flexDirection: d.row, gap: 10, marginTop: 12 }}>
          <Pressable
            onPress={() => (m.balance_afs >= m.min_payout ? setPayout(true) : Alert.alert('', t('min_payout', { n: m.min_payout })))}
            style={[st.walletBtn, m.balance_afs < m.min_payout && { opacity: 0.6 }]}
          >
            <Ionicons name="cash-outline" size={18} color="#B5136C" />
            <Text style={st.walletBtnText}>{t('withdraw')}</Text>
          </Pressable>
          {m.is_admin ? (
            <Pressable onPress={() => router.push('/settings/admin')} style={st.walletBtn}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#B5136C" />
              <Text style={st.walletBtnText}>{t('admin_panel')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* stage 1 */}
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
      </Card>

      {/* stage 2 */}
      <Card style={!m.qualified ? { opacity: 0.55 } : undefined}>
        <View style={[st.head, { flexDirection: d.row }]}>
          <Text style={st.h}>
            {m.qualified ? '2️⃣ ' : '🔒 '}
            {t('stage_earn')}
          </Text>
          <Text style={st.count}>
            {m.earn_done}/{m.earn_total}
          </Text>
        </View>
        <P muted>{m.qualified ? t('earn_text', { n: m.reward_every, afs: m.reward_afs }) : t('earn_locked')}</P>
        {m.qualified ? (
          <View style={{ marginVertical: 6 }}>
            <Text style={[st.small, { textAlign: d.align }]}>{t('next_reward', { n: m.reward_every - towardNext, afs: m.reward_afs })}</Text>
            <View style={st.track}>
              <View style={[st.fill, { width: `${(towardNext / m.reward_every) * 100}%` as `${number}%` }]} />
            </View>
          </View>
        ) : null}
        {shownEarn.map((c) => (
          <ChallengeRow key={c.id} c={c} value={m.metrics[c.metric]} locked={!m.qualified} />
        ))}
        <Pressable onPress={() => setShowAll((x) => !x)} style={st.more}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>{showAll ? t('less') : t('show_all_challenges', { n: earn.length })}</Text>
        </Pressable>
      </Card>

      {m.payouts.length ? (
        <Card>
          <Text style={[st.h, { textAlign: d.align }]}>{t('payouts')}</Text>
          {m.payouts.map((p) => (
            <View key={p.id} style={[st.payRow, { flexDirection: d.row }]}>
              <Text style={{ flex: 1, color: colors.text, textAlign: d.align }}>
                ؋ {afs(p.amount)} · {p.method}
              </Text>
              <Text style={{ color: p.status === 'paid' ? colors.success : p.status === 'rejected' ? colors.error : colors.muted, fontWeight: '700' }}>
                {t(`pay_${p.status}` as StringKey)}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {proof ? <ProofSheet c={proof} onClose={() => setProof(null)} onSent={load} /> : null}
      {payout ? <PayoutSheet max={m.balance_afs} min={m.min_payout} onClose={() => setPayout(false)} onSent={load} /> : null}
    </Page>
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

function ProofSheet({ c, onClose, onSent }: { c: Challenge; onClose: () => void; onSent: () => void }) {
  const { t, d } = useI18n();
  const { session } = useAuth();
  const bottom = useBottomSpace();
  const [text, setText] = useState('');
  const [img, setImg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isEmail = c.metric === 'fainet_account';

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
            <P muted>{isEmail ? t('proof_email_help') : t('proof_fb_help')}</P>
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

function PayoutSheet({ max, min, onClose, onSent }: { max: number; min: number; onClose: () => void; onSent: () => void }) {
  const { t, d } = useI18n();
  const bottom = useBottomSpace();
  const [amount, setAmount] = useState(String(max));
  const [method, setMethod] = useState(METHODS[0]);
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    const n = parseInt(amount, 10);
    if (!n || n < min || n > max) {
      Alert.alert('', t('payout_range', { min, max }));
      return;
    }
    setBusy(true);
    try {
      await monetize.requestPayout(n, method, account);
      onClose();
      onSent();
      Alert.alert('✓', t('payout_sent'));
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
            <Text style={st.sheetTitle}>{t('withdraw')}</Text>
            <Text style={[st.small, { textAlign: d.align }]}>{t('amount_afs')}</Text>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" style={[st.input, { textAlign: d.align }]} />
            <View style={{ flexDirection: d.row, flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
              {METHODS.map((x) => (
                <Pressable key={x} onPress={() => setMethod(x)} style={[st.method, method === x && st.methodOn]}>
                  <Text style={{ color: method === x ? colors.primary : colors.text, fontWeight: '700' }}>{x}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={account}
              onChangeText={setAccount}
              placeholder={t('payout_account_ph')}
              keyboardType="phone-pad"
              placeholderTextColor={colors.muted}
              style={[st.input, { textAlign: d.align }]}
              maxLength={80}
            />
            <Pressable onPress={send} disabled={busy || account.trim().length < 3} style={[st.cta, account.trim().length < 3 && { opacity: 0.5 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.ctaText}>{t('send_request')}</Text>}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

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
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, fontSize: 16, color: colors.text },
  pick: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: radius.md, minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8 },
  cta: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  method: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 7 },
  methodOn: { borderColor: colors.primary, backgroundColor: colors.soft },
});
