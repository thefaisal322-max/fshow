import { Ionicons } from '@expo/vector-icons';
import { PackGate } from '@/components/PackGate';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Coin } from '@/components/Coin';
import { Card, P, Page } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { live, Tier, TIERS } from '@/lib/live';
import { formatCount } from '@/lib/social';
import { colors, radius } from '@/theme';

/** Go LIVE (title) or start a MATCH (tier, name, opponent by @username or random). */
function LiveStartInner() {
  const { t, d } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<'live' | 'match'>(params.kind === 'match' ? 'match' : 'live');
  const [title, setTitle] = useState('');
  const [tier, setTier] = useState<Tier>('unranked');
  const [name, setName] = useState('');
  const [random, setRandom] = useState(false);
  const [opponent, setOpponent] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      let id: string | null;
      if (kind === 'live') id = await live.start(title.trim());
      else {
        // random: first join someone who is already waiting, else wait for one
        id = random ? await live.findRandom() : null;
        if (!id) id = await live.createMatch(tier, tier === 'special' ? name.trim() : null, random ? null : opponent.trim(), random);
      }
      router.replace({ pathname: '/live/[id]', params: { id: id! } });
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const price = TIERS.find((x) => x.tier === tier)!.price;
  const ok = kind === 'live' || ((random || opponent.trim().length > 1) && (tier !== 'special' || name.trim().length > 0));

  return (
    <Page>
      <Stack.Screen options={{ headerShown: true, title: kind === 'live' ? t('live_go') : t('live_match'), headerTitleAlign: 'center' }} />
      <View style={[st.switch, { flexDirection: d.row }]}>
        {(['live', 'match'] as const).map((k) => (
          <Pressable key={k} onPress={() => setKind(k)} style={[st.sw, kind === k && st.swOn]}>
            <Text style={[st.swText, kind === k && { color: '#fff' }]}>{k === 'live' ? `🔴 ${t('live_go')}` : `⚔️ ${t('live_match')}`}</Text>
          </Pressable>
        ))}
      </View>

      <Card>
        <P muted>{kind === 'live' ? t('live_rules') : t('match_rules')}</P>
      </Card>

      {kind === 'live' ? (
        <Card>
          <TextInput
            value={title}
            onChangeText={(v) => setTitle(v.slice(0, 60))}
            placeholder={t('live_title_ph')}
            placeholderTextColor={colors.muted}
            style={[st.input, { textAlign: d.align }]}
          />
        </Card>
      ) : (
        <>
          <Card>
            <Text style={[st.h, { textAlign: d.align }]}>{t('match_tier')}</Text>
            {TIERS.map((x) => {
              const on = x.tier === tier;
              return (
                <Pressable key={x.tier} onPress={() => setTier(x.tier)} style={[st.tier, { flexDirection: d.row }, on && st.tierOn]}>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.primary : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.tierName, { textAlign: d.align }]}>{x.tier === 'special' ? t('match_special') : x.label}</Text>
                    <Text style={[st.small, { textAlign: d.align }]}>🚀 For You: {x.reach}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Coin size={16} />
                    <Text style={st.price}>{formatCount(x.price)}</Text>
                  </View>
                </Pressable>
              );
            })}
            {tier === 'special' ? (
              <TextInput
                value={name}
                onChangeText={(v) => setName(v.slice(0, 30))}
                placeholder={t('match_name_ph')}
                placeholderTextColor={colors.muted}
                style={[st.input, { textAlign: d.align, marginTop: 8 }]}
              />
            ) : null}
          </Card>
          <Card>
            <Text style={[st.h, { textAlign: d.align }]}>{t('match_opponent')}</Text>
            <View style={[st.switch, { flexDirection: d.row, marginBottom: 8 }]}>
              <Pressable onPress={() => setRandom(false)} style={[st.sw, !random && st.swOn]}>
                <Text style={[st.swText, !random && { color: '#fff' }]}>@ {t('match_invite')}</Text>
              </Pressable>
              <Pressable onPress={() => setRandom(true)} style={[st.sw, random && st.swOn]}>
                <Text style={[st.swText, random && { color: '#fff' }]}>🎲 {t('match_random')}</Text>
              </Pressable>
            </View>
            {!random ? (
              <TextInput
                value={opponent}
                onChangeText={setOpponent}
                placeholder="@username"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                style={[st.input, { textAlign: 'left' }]}
              />
            ) : (
              <P muted>{t('match_random_sub')}</P>
            )}
          </Card>
        </>
      )}

      <Pressable onPress={go} disabled={busy || !ok} style={[st.go, !ok && { opacity: 0.5 }]}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={st.goText}>{kind === 'live' ? `🔴 ${t('live_go')}` : `⚔️ ${t('live_match')} · ${formatCount(price)} FC`}</Text>
        )}
      </Pressable>
    </Page>
  );
}

const st = StyleSheet.create({
  switch: { gap: 8, marginBottom: 10 },
  sw: { flex: 1, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.card },
  swOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  swText: { fontWeight: '800', color: colors.text },
  h: { fontSize: 16, fontWeight: '900', color: colors.text, marginBottom: 6 },
  input: { backgroundColor: colors.input, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.text },
  tier: { alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
  tierOn: { borderColor: colors.primary, backgroundColor: colors.soft },
  tierName: { fontSize: 15, fontWeight: '800', color: colors.text },
  small: { fontSize: 12, color: colors.muted },
  price: { fontWeight: '900', color: '#E6A100' },
  go: { backgroundColor: '#FE2C55', borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 4, marginBottom: 20 },
  goText: { color: '#fff', fontWeight: '900', fontSize: 16 },
});

/** needs the downloaded "FC & Live" pack */
export default function LiveStart() {
  const { t } = useI18n();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('live_go'), headerTitleAlign: 'center' }} />
      <PackGate need="live">
        <LiveStartInner />
      </PackGate>
    </>
  );
}
