import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Card, ErrorBox, P, Page } from '@/components/ui';
import { StringKey, useI18n } from '@/i18n';
import { account, NOTIF_KINDS, NotifKind } from '@/lib/account';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { colors, radius } from '@/theme';

const ICON: Record<NotifKind, keyof typeof Ionicons.glyphMap> = {
  message: 'chatbubble-ellipses',
  call: 'call',
  like: 'heart',
  comment: 'chatbox',
  mention: 'at',
  follow: 'person-add',
  friends: 'people',
};

/** Which notifications come to the phone. Each switch saves at once. */
export default function NotificationSettings() {
  const { t, d } = useI18n();
  const { session } = useAuth();
  const uid = session?.user.id ?? '';
  const [off, setOff] = useState<NotifKind[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (uid)
      account
        .settings(uid)
        .then((s) => setOff(s.notif_off ?? []))
        .catch((e) => setError(errorMessage(e)));
  }, [uid]);

  async function toggle(k: NotifKind, on: boolean) {
    if (!off) return;
    const old = off;
    const next = on ? off.filter((x) => x !== k) : [...off.filter((x) => x !== k), k];
    setOff(next);
    try {
      await account.save(uid, { notif_off: next });
    } catch (e) {
      setOff(old);
      setError(errorMessage(e));
    }
  }

  return (
    <Page>
      <Stack.Screen options={{ title: t('notif_settings') }} />
      <ErrorBox message={error} />
      {!off ? (
        !error ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> : null
      ) : (
        <>
          <Card>
            <Text style={[st.h, { textAlign: d.align }]}>{t('notif_push_title')}</Text>
            <P muted>{t('notif_push_sub')}</P>
            {NOTIF_KINDS.map((k) => (
              <View key={k} style={[st.row, { flexDirection: d.row }]}>
                <View style={st.icon}>
                  <Ionicons name={ICON[k]} size={18} color={colors.text} />
                </View>
                <View style={{ flex: 1, alignItems: d.items }}>
                  <Text style={st.label}>{t(`notif_${k}` as StringKey)}</Text>
                  <Text style={[st.sub, { textAlign: d.align }]}>{t(`notif_${k}_sub` as StringKey)}</Text>
                </View>
                <Switch
                  value={!off.includes(k)}
                  onValueChange={(v) => toggle(k, v)}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </Card>
          <Card>
            <Pressable onPress={() => Linking.openSettings()} style={[st.row, { flexDirection: d.row }]}>
              <View style={st.icon}>
                <Ionicons name="phone-portrait-outline" size={18} color={colors.text} />
              </View>
              <View style={{ flex: 1, alignItems: d.items }}>
                <Text style={st.label}>{t('notif_phone')}</Text>
                <Text style={[st.sub, { textAlign: d.align }]}>{t('notif_phone_sub')}</Text>
              </View>
              <Ionicons name={d.rtl ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.muted} />
            </Pressable>
          </Card>
        </>
      )}
    </Page>
  );
}

const st = StyleSheet.create({
  h: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 2 },
  row: { alignItems: 'center', gap: 12, paddingVertical: 10 },
  icon: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, color: colors.muted, marginTop: 1 },
});
