import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card, P, Page } from '@/components/ui';
import { useI18n } from '@/i18n';
import { accounts, SavedAccount } from '@/lib/accounts';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius } from '@/theme';

/** Switch account: tap another saved account, or add one (up to 5 on this phone). */
export default function SwitchAccount() {
  const router = useRouter();
  const { t, d } = useI18n();
  const { session, profile } = useAuth();
  const me = session?.user.id ?? '';
  const [list, setList] = useState<SavedAccount[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    (async () => {
      // the account in use is always in the list
      if (profile) await accounts.rememberCurrent({ id: profile.id, name: profile.displayName, username: profile.username, photo_path: profile.photoPath });
      setList(await accounts.list());
    })().catch(() => setList([]));
  }, [profile]);
  useFocusEffect(load);

  async function open(a: SavedAccount) {
    if (a.id === me || busy) return;
    setBusy(a.id);
    try {
      if (profile) await accounts.rememberCurrent({ id: profile.id, name: profile.displayName, username: profile.username, photo_path: profile.photoPath });
      await accounts.switchTo(a.id);
      router.replace('/');
    } catch (e) {
      Alert.alert('', errorMessage(e));
      load();
    } finally {
      setBusy(null);
    }
  }

  function remove(a: SavedAccount) {
    if (a.id === me) return;
    Alert.alert(a.name, t('acc_remove_q'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('acc_remove'),
        style: 'destructive',
        onPress: async () => {
          await accounts.forget(a.id);
          load();
        },
      },
    ]);
  }

  async function add() {
    if ((list?.length ?? 0) >= 5) return Alert.alert('', t('acc_max'));
    if (profile) await accounts.rememberCurrent({ id: profile.id, name: profile.displayName, username: profile.username, photo_path: profile.photoPath });
    await accounts.addAnother();
  }

  return (
    <Page>
      <Stack.Screen options={{ title: t('switch_account') }} />
      {!list ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <Card>
          {list.map((a) => {
            const current = a.id === me;
            return (
              <Pressable key={a.id} onPress={() => open(a)} onLongPress={() => remove(a)} style={[st.row, { flexDirection: d.row }]}>
                <Avatar uri={avatarUrl(a.photo_path)} name={a.name} size={46} />
                <View style={{ flex: 1, alignItems: d.items }}>
                  <Text style={st.name}>{a.name}</Text>
                  {a.username ? <Text style={st.user}>@{a.username}</Text> : null}
                </View>
                {busy === a.id ? (
                  <ActivityIndicator color={colors.primary} />
                ) : current ? (
                  <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                ) : (
                  <Ionicons name={d.rtl ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.muted} />
                )}
              </Pressable>
            );
          })}
          <Pressable onPress={add} style={[st.row, { flexDirection: d.row }]}>
            <View style={st.plus}>
              <Ionicons name="add" size={26} color={colors.primary} />
            </View>
            <Text style={[st.name, { color: colors.primary }]}>{t('acc_add')}</Text>
          </Pressable>
        </Card>
      )}
      <P muted>{t('acc_note')}</P>
    </Page>
  );
}

const st = StyleSheet.create({
  row: { alignItems: 'center', gap: 12, paddingVertical: 10 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  user: { fontSize: 13, color: colors.muted },
  plus: { width: 46, height: 46, borderRadius: radius.full, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
});
