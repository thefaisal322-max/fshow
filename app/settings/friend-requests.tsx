import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useI18n } from '@/i18n';
import { account, FriendRequest } from '@/lib/account';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { authorName, social, timeAgo } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

/** Like Facebook: people who follow you. Confirm = follow back (you become friends), Delete = hide. */
export default function FriendRequests() {
  const router = useRouter();
  const { t, d } = useI18n();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const bottom = useBottomSpace();
  const [items, setItems] = useState<FriendRequest[] | null>(null);

  const load = useCallback(() => {
    account
      .friendRequests()
      .then(setItems)
      .catch((e) => {
        setItems([]);
        Alert.alert('', errorMessage(e));
      });
  }, []);
  useFocusEffect(load);

  async function act(u: FriendRequest, confirm: boolean) {
    setItems((old) => old?.filter((x) => x.id !== u.id) ?? null);
    try {
      if (confirm) await social.follow(u.id, true, me);
      else await account.dismissFriend(u.id);
    } catch (e) {
      Alert.alert('', errorMessage(e));
      load();
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('friend_requests') }} />
      {!items ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: 8, paddingBottom: 8 + bottom }}
          ListHeaderComponent={
            items.length ? <Text style={[st.count, { textAlign: d.align }]}>{t('friend_requests_n', { n: items.length })}</Text> : null
          }
          ListEmptyComponent={<Text style={st.empty}>{t('no_friend_requests')}</Text>}
          renderItem={({ item }) => (
            <View style={[st.card, { flexDirection: d.row }]}>
              <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })}>
                <Avatar uri={avatarUrl(item.photo_path)} name={item.first_name} size={72} />
              </Pressable>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ flexDirection: d.row, alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: d.row, alignItems: 'center', flexShrink: 1 }}>
                    <Text style={st.name} numberOfLines={1}>
                      {authorName(item)}
                    </Text>
                    {item.is_fainet ? <VerifiedBadge size={14} /> : null}
                  </View>
                  <Text style={st.time}>{timeAgo(item.requested_at)}</Text>
                </View>
                {item.mutual > 0 ? <Text style={[st.time, { textAlign: d.align }]}>{t('mutual_n', { n: item.mutual })}</Text> : null}
                <View style={{ flexDirection: d.row, gap: 8 }}>
                  <Pressable onPress={() => act(item, true)} style={[st.btn, { backgroundColor: colors.primary }]}>
                    <Text style={[st.btnText, { color: '#fff' }]}>{t('confirm')}</Text>
                  </Pressable>
                  <Pressable onPress={() => act(item, false)} style={[st.btn, { backgroundColor: colors.surface }]}>
                    <Text style={st.btnText}>{t('delete')}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  count: { fontSize: 17, fontWeight: '800', color: colors.text, marginHorizontal: 6, marginBottom: 8 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 8, gap: 12, alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  time: { fontSize: 12, color: colors.muted },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 9, alignItems: 'center' },
  btnText: { fontWeight: '700', color: colors.text },
});
