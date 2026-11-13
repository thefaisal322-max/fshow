import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card, P, Page } from '@/components/ui';
import { tr, useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { afs, monetize, PendingPayout, PendingProof } from '@/lib/monetize';
import { authorName, timeAgo } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius } from '@/theme';

import { challengeTitle } from './monetize';

/** For @fainet.org admins: check challenge proofs and money requests. */
export default function Admin() {
  const { t, d } = useI18n();
  const [data, setData] = useState<{ proofs: PendingProof[]; payouts: PendingPayout[] } | null>(null);

  const load = useCallback(() => {
    monetize
      .pending()
      .then(setData)
      .catch((e) => {
        setData({ proofs: [], payouts: [] });
        Alert.alert('', errorMessage(e));
      });
  }, []);
  useFocusEffect(load);

  async function review(p: PendingProof, approve: boolean) {
    setData((old) => old && { ...old, proofs: old.proofs.filter((x) => !(x.user.id === p.user.id && x.challenge_id === p.challenge_id)) });
    try {
      await monetize.review(p.user.id, p.challenge_id, approve, approve ? '' : tr('ch_rejected_note'));
    } catch (e) {
      Alert.alert('', errorMessage(e));
      load();
    }
  }

  async function pay(p: PendingPayout, paid: boolean) {
    setData((old) => old && { ...old, payouts: old.payouts.filter((x) => x.id !== p.id) });
    try {
      await monetize.setPayout(p.id, paid);
    } catch (e) {
      Alert.alert('', errorMessage(e));
      load();
    }
  }

  return (
    <Page>
      <Stack.Screen options={{ title: t('admin_panel') }} />
      {!data ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <>
          <Text style={[st.h, { textAlign: d.align }]}>
            {t('proofs_to_check')} ({data.proofs.length})
          </Text>
          {data.proofs.length === 0 ? <P muted>{t('nothing_pending')}</P> : null}
          {data.proofs.map((p) => (
            <Card key={`${p.user.id}-${p.challenge_id}`}>
              <View style={[st.who, { flexDirection: d.row }]}>
                <Avatar uri={avatarUrl(p.user.photo_path)} name={p.user.first_name} size={40} />
                <View style={{ flex: 1, alignItems: d.items }}>
                  <Text style={st.name}>{authorName(p.user)}</Text>
                  <Text style={st.small}>
                    {p.user.username ? `@${p.user.username} · ` : ''}
                    {timeAgo(p.created_at)}
                  </Text>
                </View>
              </View>
              <Text style={[st.task, { textAlign: d.align }]}>{challengeTitle({ metric: p.metric, target: 1 })}</Text>
              {p.proof_text ? (
                <Text selectable style={[st.proofText, { textAlign: d.align }]} onPress={() => /^https?:\/\//.test(p.proof_text) && Linking.openURL(p.proof_text)}>
                  {p.proof_text}
                </Text>
              ) : null}
              {p.proof_path ? <ProofImage path={p.proof_path} /> : null}
              <View style={{ flexDirection: d.row, gap: 8, marginTop: 10 }}>
                <Pressable onPress={() => review(p, true)} style={[st.btn, { backgroundColor: colors.success }]}>
                  <Text style={st.btnText}>{t('approve')}</Text>
                </Pressable>
                <Pressable onPress={() => review(p, false)} style={[st.btn, { backgroundColor: colors.error }]}>
                  <Text style={st.btnText}>{t('reject')}</Text>
                </Pressable>
              </View>
            </Card>
          ))}

          <Text style={[st.h, { textAlign: d.align, marginTop: 10 }]}>
            {t('payouts')} ({data.payouts.length})
          </Text>
          {data.payouts.length === 0 ? <P muted>{t('nothing_pending')}</P> : null}
          {data.payouts.map((p) => (
            <Card key={p.id}>
              <Text style={[st.name, { textAlign: d.align }]}>
                {authorName(p.user)} — ؋ {afs(p.amount)}
              </Text>
              <Text selectable style={[st.proofText, { textAlign: d.align }]}>
                {p.method}: {p.account}
              </Text>
              <View style={{ flexDirection: d.row, gap: 8, marginTop: 10 }}>
                <Pressable onPress={() => pay(p, true)} style={[st.btn, { backgroundColor: colors.success }]}>
                  <Text style={st.btnText}>{t('mark_paid')}</Text>
                </Pressable>
                <Pressable onPress={() => pay(p, false)} style={[st.btn, { backgroundColor: colors.error }]}>
                  <Text style={st.btnText}>{t('reject')}</Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </>
      )}
    </Page>
  );
}

function ProofImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    monetize.proofUrl(path).then(setUrl).catch(() => {});
  }, [path]);
  if (!url) return <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} />;
  return (
    <Pressable onPress={() => Linking.openURL(url)}>
      <Image source={{ uri: url }} style={st.img} resizeMode="contain" />
    </Pressable>
  );
}

const st = StyleSheet.create({
  h: { fontSize: 18, fontWeight: '800', color: colors.text, marginVertical: 8, marginHorizontal: 4 },
  who: { alignItems: 'center', gap: 10 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  small: { fontSize: 12, color: colors.muted },
  task: { marginTop: 10, fontWeight: '700', color: colors.primary },
  proofText: { marginTop: 6, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.sm, padding: 8 },
  img: { width: '100%', height: 320, marginTop: 8, borderRadius: radius.md, backgroundColor: '#000' },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
});
