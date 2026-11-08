import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, P, Page } from '@/components/ui';
import { StringKey, useI18n } from '@/i18n';
import { account, CreatorStats } from '@/lib/account';
import { errorMessage } from '@/lib/api';
import { colors, radius } from '@/theme';

const PERKS: { icon: keyof typeof Ionicons.glyphMap; key: StringKey }[] = [
  { icon: 'checkmark-circle', key: 'perk_badge' },
  { icon: 'rocket', key: 'perk_reach' },
  { icon: 'shield-checkmark', key: 'perk_protect' },
  { icon: 'headset', key: 'perk_support' },
  { icon: 'sparkles', key: 'perk_stickers' },
];

/** "Faisal Show Verified": what you get, and a request button (no payment inside the app yet). */
export default function Verified() {
  const { t, d } = useI18n();
  const [s, setS] = useState<CreatorStats | null>(null);
  const [plan, setPlan] = useState<'month' | 'year'>('month');
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      account
        .creatorStats()
        .then(setS)
        .catch((e) => Alert.alert('', errorMessage(e)));
    }, []),
  );

  async function request() {
    setBusy(true);
    try {
      const status = await account.applyFor('verify');
      setS((old) => (old ? { ...old, verify: status as CreatorStats['verify'] } : old));
      Alert.alert('✓', t('verify_requested'));
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Stack.Screen options={{ title: t('verified_sub') }} />
      <View style={st.hero}>
        <View style={st.badge}>
          <Ionicons name="checkmark" size={40} color="#fff" />
        </View>
        <Text style={st.heroTitle}>Faisal Show Verified</Text>
        <Text style={st.heroSub}>{t('verified_hero')}</Text>
      </View>

      {!s ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : s.verified ? (
        <Card style={{ alignItems: 'center' }}>
          <Ionicons name="checkmark-circle" size={40} color="#1D9BF0" />
          <Text style={st.status}>{t('already_verified')}</Text>
        </Card>
      ) : (
        <>
          <Card>
            {PERKS.map((p) => (
              <View key={p.key} style={[st.perk, { flexDirection: d.row }]}>
                <View style={st.perkIcon}>
                  <Ionicons name={p.icon} size={18} color={colors.primary} />
                </View>
                <Text style={[st.perkText, { textAlign: d.align }]}>{t(p.key)}</Text>
              </View>
            ))}
          </Card>

          <View style={{ flexDirection: d.row, gap: 10, marginBottom: 12 }}>
            {(['month', 'year'] as const).map((p) => {
              const on = plan === p;
              return (
                <Pressable key={p} onPress={() => setPlan(p)} style={[st.plan, on && st.planOn]}>
                  {p === 'year' ? <Text style={st.save}>{t('save_17')}</Text> : null}
                  <Text style={[st.planName, on && { color: colors.primary }]}>{t(p === 'month' ? 'plan_month' : 'plan_year')}</Text>
                  <Text style={st.price}>{p === 'month' ? '$2.99' : '$29.99'}</Text>
                </Pressable>
              );
            })}
          </View>

          {s.verify ? (
            <Card style={{ alignItems: 'center' }}>
              <Ionicons name="time" size={30} color={colors.primary} />
              <Text style={st.status}>{t(`app_${s.verify}` as StringKey)}</Text>
            </Card>
          ) : (
            <Pressable onPress={request} disabled={busy} style={st.cta}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.ctaText}>{t('request_verify')}</Text>}
            </Pressable>
          )}
          <P muted style={{ textAlign: 'center' }}>{t('verified_note')}</P>
        </>
      )}
    </Page>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: '#0B1B3F', borderRadius: radius.lg, padding: 22, alignItems: 'center', gap: 8, marginBottom: 12 },
  badge: { width: 74, height: 74, borderRadius: 37, backgroundColor: '#1D9BF0', alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.25)' },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  heroSub: { color: '#cfe0ff', textAlign: 'center', lineHeight: 20 },
  perk: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  perkIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  perkText: { flex: 1, color: colors.text, fontSize: 15 },
  plan: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, padding: 14, alignItems: 'center', gap: 4 },
  planOn: { borderColor: colors.primary },
  planName: { fontWeight: '800', color: colors.text },
  price: { fontSize: 20, fontWeight: '900', color: colors.text },
  save: { position: 'absolute', top: -10, backgroundColor: colors.success, color: '#fff', fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  status: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 6, textAlign: 'center' },
  cta: { backgroundColor: '#1D9BF0', borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
