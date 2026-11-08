import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useI18n } from '@/i18n';
import { account } from '@/lib/account';
import { errorMessage } from '@/lib/api';
import { Conversation } from '@/lib/chat';
import { authorName, timeAgo } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

/** Messages from people you do not follow. Accept → normal chat. Delete → gone (until they write again). */
export default function MessageRequests() {
  const router = useRouter();
  const { t, d } = useI18n();
  const bottom = useBottomSpace();
  const [items, setItems] = useState<Conversation[] | null>(null);

  const load = useCallback(() => {
    account
      .messageRequests()
      .then(setItems)
      .catch((e) => {
        setItems([]);
        Alert.alert('', errorMessage(e));
      });
  }, []);
  useFocusEffect(load);

  async function act(c: Conversation, accept: boolean) {
    setItems((old) => old?.filter((x) => x.id !== c.id) ?? null);
    try {
      if (accept) {
        await account.acceptMessage(c.id);
        router.push({ pathname: '/chats/[id]', params: { id: c.id } });
      } else await account.deleteMessageRequest(c.id);
    } catch (e) {
      Alert.alert('', errorMessage(e));
      load();
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('message_requests') }} />
      {!items ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 8, paddingBottom: 8 + bottom }}
          ListHeaderComponent={<Text style={[st.note, { textAlign: d.align }]}>{t('msg_requests_sub')}</Text>}
          ListEmptyComponent={<Text style={st.empty}>{t('no_message_requests')}</Text>}
          renderItem={({ item }) => {
            const o = item.members?.[0];
            return (
              <View style={st.card}>
                <Pressable
                  onPress={() => router.push({ pathname: '/chats/[id]', params: { id: item.id } })}
                  style={[st.row, { flexDirection: d.row }]}
                >
                  <Avatar uri={avatarUrl(o?.photo_path)} name={o?.first_name} size={52} />
                  <View style={{ flex: 1, alignItems: d.items }}>
                    <View style={{ flexDirection: d.row, alignItems: 'center' }}>
                      <Text style={st.name}>{o ? authorName(o) : ''}</Text>
                      {o?.is_fainet ? <VerifiedBadge size={14} /> : null}
                    </View>
                    <Text style={st.preview} numberOfLines={2}>
                      {item.last_message_preview}
                    </Text>
                    <Text style={st.time}>{timeAgo(item.last_message_at)}</Text>
                  </View>
                </Pressable>
                <View style={{ flexDirection: d.row, gap: 8 }}>
                  <Pressable onPress={() => act(item, true)} style={[st.btn, { backgroundColor: colors.primary }]}>
                    <Text style={[st.btnText, { color: '#fff' }]}>{t('accept')}</Text>
                  </Pressable>
                  <Pressable onPress={() => act(item, false)} style={[st.btn, { backgroundColor: colors.surface }]}>
                    <Text style={st.btnText}>{t('delete')}</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  note: { color: colors.muted, fontSize: 13, marginHorizontal: 6, marginBottom: 8, lineHeight: 19 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 8, gap: 10 },
  row: { alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  preview: { fontSize: 14, color: colors.text, marginTop: 2 },
  time: { fontSize: 12, color: colors.muted, marginTop: 2 },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  btnText: { fontWeight: '700', color: colors.text },
});
