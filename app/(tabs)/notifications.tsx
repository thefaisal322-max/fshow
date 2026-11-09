import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { errorMessage } from '@/lib/api';
import { useUnread } from '@/lib/notifications';
import { authorName, Notification, social, timeAgo } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius } from '@/theme';
import { StringKey, useI18n } from '@/i18n';

const TEXT: Record<Notification['type'], StringKey> = {
  like: 'n_like',
  comment: 'n_comment',
  mention: 'n_mention',
  follow: 'n_follow',
  friend_request: 'n_friend_request',
  friend_accept: 'n_friend_accept',
};
const ICON: Record<Notification['type'], { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  like: { name: 'heart', color: colors.error },
  comment: { name: 'chatbubble', color: colors.primary },
  mention: { name: 'at', color: '#8E44AD' },
  follow: { name: 'person-add', color: colors.success },
  friend_request: { name: 'people', color: colors.primary },
  friend_accept: { name: 'people', color: colors.success },
};

export default function Notifications() {
  const { t, d } = useI18n();
  const router = useRouter();
  const { setUnread } = useUnread();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await social.notifications());
      setError(null);
      await social.markRead();
      setUnread(0);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setUnread]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function open(n: Notification) {
    if (n.type === 'friend_request') router.push('/friends');
    else if (n.post_id) router.push({ pathname: '/post/[id]', params: { id: n.post_id } });
    else router.push({ pathname: '/user/[id]', params: { id: n.actor.id } });
  }

  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;

  return (
    <FlatList
      data={items}
      keyExtractor={(n) => n.id}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 8 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.primary]} />}
      ListEmptyComponent={
        <Text style={{ textAlign: 'center', color: error ? colors.error : colors.muted, marginTop: 40 }}>
          {error ?? t('no_notifications')}
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable onPress={() => open(item)} style={[st.row, { flexDirection: d.rowOpp }, !item.read && st.unread]}>
          <View style={{ flex: 1, alignItems: d.items }}>
            <Text style={[st.text, { textAlign: d.align }]}>
              <Text style={{ fontWeight: '800' }}>{authorName(item.actor)}</Text> {t(TEXT[item.type])}
            </Text>
            {item.comment_body ? <Text style={[st.quote, { textAlign: d.align }]} numberOfLines={2}>«{item.comment_body}»</Text> : null}
            <Text style={st.time}>{timeAgo(item.created_at)}</Text>
          </View>
          <View>
            <Avatar uri={avatarUrl(item.actor.photo_path)} name={item.actor.first_name} size={50} />
            <View style={[st.badge, { backgroundColor: ICON[item.type].color }]}>
              <Ionicons name={ICON[item.type].name} size={12} color="#fff" />
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}

const st = StyleSheet.create({
  row: { alignItems: 'center', gap: 12, backgroundColor: colors.card, padding: 12, borderRadius: radius.md, marginBottom: 6 },
  unread: { backgroundColor: colors.soft },
  text: { fontSize: 14, color: colors.text, lineHeight: 22 },
  quote: { fontSize: 13, color: colors.muted, marginTop: 2 },
  time: { fontSize: 12, color: colors.primary, marginTop: 4 },
  badge: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.card },
});
