import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { chat, chatTitle, Conversation } from '@/lib/chat';
import { useUnread } from '@/lib/notifications';
import { isOnline, usePresence } from '@/lib/presence';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { timeAgo } from '@/lib/social';
import { avatarUrl, supabase } from '@/lib/supabase';
import { colors, radius } from '@/theme';

export default function Chats() {
  const router = useRouter();
  const { t, d } = useI18n();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const { refreshChats } = useUnread();
  const bottom = useBottomSpace();
  const [archived, setArchived] = useState(false);
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presence = usePresence(items.filter((c) => !c.is_group && c.members?.[0]).map((c) => c.members![0].id));

  const load = useCallback(async () => {
    try {
      setItems(await chat.list(archived));
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [archived]);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshChats();
    }, [load, refreshChats]),
  );

  // Live: any new message in my chats → reload the list (debounced).
  useEffect(() => {
    const ch = supabase
      .channel(`chatlist:${me}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(load, 400);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [me, load]);

  function options(c: Conversation) {
    Alert.alert(chatTitle(c, t('chats')), '', [
      {
        text: c.archived ? t('unarchive') : t('archive'),
        onPress: async () => {
          try {
            await chat.archive(c.id, !c.archived);
            load();
            refreshChats();
          } catch (e) {
            Alert.alert('', errorMessage(e));
          }
        },
      },
      ...(c.is_group
        ? [
            {
              text: t('leave_group'),
              style: 'destructive' as const,
              onPress: async () => {
                try {
                  await chat.leave(c.id);
                  load();
                } catch (e) {
                  Alert.alert('', errorMessage(e));
                }
              },
            },
          ]
        : []),
      { text: t('close'), style: 'cancel' as const },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.card }}>
      <Stack.Screen options={{ title: t('chats') }} />
      <View style={[st.tabs, { flexDirection: d.row }]}>
        <Pressable style={[st.tab, !archived && st.tabOn]} onPress={() => setArchived(false)}>
          <Text style={[st.tabText, !archived && { color: colors.primary }]}>{t('chats')}</Text>
        </Pressable>
        <Pressable style={[st.tab, archived && st.tabOn]} onPress={() => setArchived(true)}>
          <Text style={[st.tabText, archived && { color: colors.primary }]}>{t('archived')}</Text>
        </Pressable>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingBottom: 100 + bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.primary]} />}
          ListEmptyComponent={<Text style={st.empty}>{archived ? t('archived_empty') : t('no_chats')}</Text>}
          renderItem={({ item }) => {
            const other = item.members?.[0];
            const unread = item.unread > 0;
            const preview = (item.last_sender_id === me ? `${t('you')}: ` : '') + item.last_message_preview;
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/chats/[id]', params: { id: item.id } })}
                onLongPress={() => options(item)}
                style={({ pressed }) => [st.row, { flexDirection: d.rowOpp }, pressed && { backgroundColor: colors.bg }]}
              >
                <View style={{ alignItems: 'center', gap: 6, minWidth: 44 }}>
                  <Text style={st.time}>{timeAgo(item.last_message_at)}</Text>
                  {unread && !item.muted ? (
                    <View style={st.dot}>
                      <Text style={st.dotText}>{item.unread > 99 ? '99+' : item.unread}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1, alignItems: d.items }}>
                  <View style={{ flexDirection: d.row, alignItems: 'center' }}>
                    <Text style={[st.name, unread && { fontWeight: '900' }]} numberOfLines={1}>
                      {chatTitle(item, t('chats'))}
                    </Text>
                    {!item.is_group && other?.is_fainet ? <VerifiedBadge /> : null}
                    {item.muted ? <Ionicons name="notifications-off" size={14} color={colors.muted} style={{ marginHorizontal: 4 }} /> : null}
                  </View>
                  <Text style={[st.preview, unread && { color: colors.text, fontWeight: '700' }, { textAlign: d.align }]} numberOfLines={1}>
                    {item.is_group && !item.last_message_preview ? t('members_n', { n: item.member_count }) : preview}
                  </Text>
                </View>
                {item.is_group ? (
                  <View style={st.groupAvatar}>
                    <Ionicons name="people" size={26} color="#fff" />
                  </View>
                ) : (
                  <View>
                    <Avatar uri={avatarUrl(other?.photo_path)} name={other?.first_name} size={54} />
                    {other && isOnline(presence[other.id]) ? <View style={st.online} /> : null}
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}
      <Pressable style={[st.fab, { bottom: 22 + bottom }, d.rtl ? { left: 18 } : { right: 18 }]} onPress={() => router.push('/chats/new')}>
        <Ionicons name="create" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  tabs: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 11, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 15, fontWeight: '700', color: colors.muted },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 50, lineHeight: 24, paddingHorizontal: 30 },
  row: { alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
  preview: { fontSize: 14, color: colors.muted, marginTop: 2 },
  time: { fontSize: 11, color: colors.muted },
  dot: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  dotText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  online: { position: 'absolute', right: 1, bottom: 1, width: 15, height: 15, borderRadius: 8, backgroundColor: '#31A24C', borderWidth: 2.5, borderColor: colors.card },
  groupAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute',
    bottom: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
