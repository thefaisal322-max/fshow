import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { VISIBILITY } from '@/components/PostMenuSheet';
import { Card, ErrorBox, P, Page } from '@/components/ui';
import { StringKey, useI18n } from '@/i18n';
import { account, AccountSettings } from '@/lib/account';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { colors, radius } from '@/theme';

const MSG: { v: AccountSettings['who_can_message']; icon: keyof typeof Ionicons.glyphMap; label: StringKey; sub: StringKey }[] = [
  { v: 'everyone', icon: 'earth', label: 'msg_everyone', sub: 'msg_everyone_sub' },
  { v: 'friends', icon: 'heart', label: 'msg_friends', sub: 'msg_friends_sub' },
  { v: 'followers', icon: 'people', label: 'msg_followers', sub: 'msg_followers_sub' },
  { v: 'nobody', icon: 'close-circle', label: 'msg_nobody', sub: 'msg_nobody_sub' },
];

/** How people find you, who can message you, who can see your posts. Every change saves at once. */
export default function Privacy() {
  const { t, d } = useI18n();
  const { session } = useAuth();
  const uid = session?.user.id ?? '';
  const [s, setS] = useState<AccountSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (uid) account.settings(uid).then(setS).catch((e) => setError(errorMessage(e)));
  }, [uid]);

  async function change(fields: Partial<AccountSettings>) {
    if (!s) return;
    const old = s;
    setS({ ...s, ...fields });
    try {
      await account.save(uid, fields);
    } catch (e) {
      setS(old);
      setError(errorMessage(e));
    }
  }

  function applyOld() {
    if (!s) return;
    Alert.alert(t('apply_old_q'), t(`vis_${s.default_visibility}` as StringKey), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('yes'),
        onPress: async () => {
          setApplying(true);
          try {
            const n = await account.allPostsVisibility(s.default_visibility);
            Alert.alert('', t('apply_old_done', { n }));
          } catch (e) {
            Alert.alert('', errorMessage(e));
          } finally {
            setApplying(false);
          }
        },
      },
    ]);
  }

  if (!s) {
    return (
      <Page>
        <Stack.Screen options={{ title: t('privacy') }} />
        <ErrorBox message={error} />
        {!error ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : null}
      </Page>
    );
  }

  const option = (on: boolean, icon: keyof typeof Ionicons.glyphMap, label: string, sub: string, onPress: () => void, key: string) => (
    <Pressable key={key} onPress={onPress} style={[st.opt, { flexDirection: d.row }]}>
      <View style={[st.optIcon, on && { backgroundColor: colors.primary }]}>
        <Ionicons name={icon} size={18} color={on ? '#fff' : colors.text} />
      </View>
      <View style={{ flex: 1, alignItems: d.items }}>
        <Text style={st.optText}>{label}</Text>
        <Text style={[st.optSub, { textAlign: d.align }]}>{sub}</Text>
      </View>
      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.primary : colors.muted} />
    </Pressable>
  );

  return (
    <Page>
      <Stack.Screen options={{ title: t('privacy') }} />
      <ErrorBox message={error} />

      <Card>
        <Text style={[st.h, { textAlign: d.align }]}>{t('find_contact')}</Text>
        <View style={[st.opt, { flexDirection: d.row }]}>
          <View style={st.optIcon}>
            <Ionicons name="search" size={18} color={colors.text} />
          </View>
          <View style={{ flex: 1, alignItems: d.items }}>
            <Text style={st.optText}>{t('searchable')}</Text>
            <Text style={[st.optSub, { textAlign: d.align }]}>{t('searchable_sub')}</Text>
          </View>
          <Switch
            value={s.searchable}
            onValueChange={(v) => change({ searchable: v })}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor="#fff"
          />
        </View>
      </Card>

      <Card>
        <Text style={[st.h, { textAlign: d.align }]}>{t('who_can_message')}</Text>
        {MSG.map((o) => option(s.who_can_message === o.v, o.icon, t(o.label), t(o.sub), () => change({ who_can_message: o.v }), o.v))}
        <P muted>{t('msg_requests_note')}</P>
      </Card>

      <Card>
        <Text style={[st.h, { textAlign: d.align }]}>{t('who_can_see_posts')}</Text>
        <P muted>{t('default_vis_sub')}</P>
        {VISIBILITY.map((o) => option(s.default_visibility === o.v, o.icon, t(o.label), t(o.sub), () => change({ default_visibility: o.v }), o.v))}
        <Pressable onPress={applyOld} disabled={applying} style={st.applyBtn}>
          {applying ? <ActivityIndicator color={colors.primary} /> : <Text style={st.applyText}>{t('apply_old')}</Text>}
        </Pressable>
      </Card>
    </Page>
  );
}

const st = StyleSheet.create({
  h: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 6 },
  opt: { alignItems: 'center', gap: 12, paddingVertical: 9 },
  optIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  optText: { fontSize: 15, fontWeight: '700', color: colors.text },
  optSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  applyBtn: { marginTop: 8, backgroundColor: colors.soft, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' },
  applyText: { color: colors.primary, fontWeight: '700' },
});
