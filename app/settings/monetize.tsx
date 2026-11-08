import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, P, Page } from '@/components/ui';
import { StringKey, useI18n } from '@/i18n';
import { account, CreatorStats } from '@/lib/account';
import { errorMessage } from '@/lib/api';
import { formatCount } from '@/lib/social';
import { colors, radius } from '@/theme';

/** Creator program: see your progress (1 000 followers + 10 000 views) and apply. */
export default function Monetize() {
  const { t, d } = useI18n();
  const [s, setS] = useState<CreatorStats | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      account
        .creatorStats()
        .then(setS)
        .catch((e) => Alert.alert('', errorMessage(e)));
    }, []),
  );

  async function apply() {
    setBusy(true);
    try {
      const status = await account.applyFor('monetize');
      setS((old) => (old ? { ...old, monetize: status as CreatorStats['monetize'] } : old));
      Alert.alert('🎉', t('monetize_applied'));
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!s) {
    return (
      <Page>
        <Stack.Screen options={{ title: t('monetize') }} />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      </Page>
    );
  }

  const fPct = Math.min(1, s.followers / s.need_followers);
  const vPct = Math.min(1, s.views / s.need_views);
  const eligible = fPct >= 1 && vPct >= 1;

  return (
    <Page>
      <Stack.Screen options={{ title: t('monetize') }} />
      <View style={st.hero}>
        <Ionicons name="cash" size={44} color="#fff" />
        <Text style={st.heroTitle}>{t('monetize_title')}</Text>
        <Text style={st.heroSub}>{t('monetize_sub')}</Text>
      </View>

      <Card>
        <Text style={[st.h, { textAlign: d.align }]}>{t('your_progress')}</Text>
        <Progress icon="people" label={t('followers_goal')} have={s.followers} need={s.need_followers} pct={fPct} />
        <Progress icon="eye" label={t('views_goal')} have={s.views} need={s.need_views} pct={vPct} />
        <View style={[st.stats, { flexDirection: d.row }]}>
          <Mini n={s.likes} label={t('likes_word')} />
          <Mini n={s.posts} label={t('posts')} />
          <Mini n={s.reels} label={t('tab_reels')} />
        </View>
      </Card>

      <Card>
        <Text style={[st.h, { textAlign: d.align }]}>{t('how_earn')}</Text>
        {(['earn_1', 'earn_2', 'earn_3'] as StringKey[]).map((k) => (
          <View key={k} style={[st.bullet, { flexDirection: d.row }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={[st.bulletText, { textAlign: d.align }]}>{t(k)}</Text>
          </View>
        ))}
      </Card>

      {s.monetize ? (
        <Card style={{ alignItems: 'center' }}>
          <Ionicons name={s.monetize === 'approved' ? 'checkmark-circle' : 'time'} size={34} color={colors.primary} />
          <Text style={st.status}>{t(`app_${s.monetize}` as StringKey)}</Text>
        </Card>
      ) : (
        <Pressable onPress={apply} disabled={!eligible || busy} style={[st.apply, !eligible && { opacity: 0.45 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.applyText}>{eligible ? t('apply_now') : t('not_yet_eligible')}</Text>}
        </Pressable>
      )}
      <P muted style={{ textAlign: 'center' }}>{t('monetize_note')}</P>
    </Page>
  );
}

function Progress({ icon, label, have, need, pct }: { icon: keyof typeof Ionicons.glyphMap; label: string; have: number; need: number; pct: number }) {
  const { d } = useI18n();
  return (
    <View style={{ marginVertical: 8 }}>
      <View style={{ flexDirection: d.row, alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Ionicons name={pct >= 1 ? 'checkmark-circle' : icon} size={18} color={pct >= 1 ? colors.success : colors.primary} />
        <Text style={{ flex: 1, color: colors.text, fontWeight: '700', textAlign: d.align }}>{label}</Text>
        <Text style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
          {formatCount(have)} / {formatCount(need)}
        </Text>
      </View>
      <View style={st.track}>
        <View style={[st.fill, { width: `${Math.round(pct * 100)}%` as `${number}%`, backgroundColor: pct >= 1 ? colors.success : colors.primary }]} />
      </View>
    </View>
  );
}

function Mini({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{formatCount(n)}</Text>
      <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: 22, alignItems: 'center', gap: 6, marginBottom: 12 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center' },
  heroSub: { color: '#fff', opacity: 0.9, textAlign: 'center', lineHeight: 20 },
  h: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 4 },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.surface, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  stats: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  bullet: { alignItems: 'flex-start', gap: 8, marginVertical: 5 },
  bulletText: { flex: 1, color: colors.text, lineHeight: 20 },
  status: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 6, textAlign: 'center' },
  apply: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  applyText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
