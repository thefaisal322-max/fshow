import { Ionicons } from '@expo/vector-icons';
import { PackGate } from '@/components/PackGate';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { useI18n } from '@/i18n';
import { live, LiveListItem, tierLabel } from '@/lib/live';
import { authorName, formatCount } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

/** Who is live now (most viewers first) + Go LIVE / Start a MATCH. */
function LiveListInner() {
  const { t, d } = useI18n();
  const router = useRouter();
  const bottom = useBottomSpace();
  const [items, setItems] = useState<LiveListItem[] | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    live
      .now()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setRefreshing(false));
    live.mine().then(setMine).catch(() => {});
  }, []);
  useFocusEffect(load);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: true, title: 'LIVE', headerTitleAlign: 'center' }} />
      <FlatList
        data={items ?? []}
        keyExtractor={(x) => x.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 8 }}
        contentContainerStyle={{ padding: 8, gap: 8, paddingBottom: 20 + bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={[colors.primary]} />}
        ListHeaderComponent={
          <View style={{ gap: 8, marginBottom: 4 }}>
            {mine ? (
              <Pressable onPress={() => router.push({ pathname: '/live/[id]', params: { id: mine } })} style={[st.back, { flexDirection: d.row }]}>
                <Ionicons name="radio" size={20} color="#fff" />
                <Text style={st.btnText}>{t('live_back_to_mine')}</Text>
              </Pressable>
            ) : null}
            <View style={{ flexDirection: d.row, gap: 8 }}>
              <Pressable onPress={() => router.push({ pathname: '/live/start', params: { kind: 'live' } })} style={[st.btn, { backgroundColor: '#FE2C55' }]}>
                <Ionicons name="radio" size={22} color="#fff" />
                <Text style={st.btnText}>{t('live_go')}</Text>
                <Text style={st.btnSub}>{t('live_go_sub')}</Text>
              </Pressable>
              <Pressable onPress={() => router.push({ pathname: '/live/start', params: { kind: 'match' } })} style={[st.btn, { backgroundColor: '#2D9CDB' }]}>
                <Text style={{ fontSize: 20 }}>⚔️</Text>
                <Text style={st.btnText}>{t('live_match')}</Text>
                <Text style={st.btnSub}>{t('live_match_sub')}</Text>
              </Pressable>
            </View>
            <Text style={[st.h, { textAlign: d.align }]}>{t('live_now')}</Text>
          </View>
        }
        ListEmptyComponent={
          items === null ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
          ) : (
            <View style={{ alignItems: 'center', marginTop: 30, gap: 8 }}>
              <Ionicons name="radio-outline" size={42} color={colors.muted} />
              <Text style={{ color: colors.muted }}>{t('live_none')}</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: '/live/[id]', params: { id: item.id } })} style={st.card}>
            <View style={st.cardTop}>
              <Text style={st.badge}>{item.kind === 'match' ? `⚔️ ${tierLabel(item.tier, item.match_name)}` : '🔴 LIVE'}</Text>
              <Text style={st.viewers}>👀 {formatCount(item.viewers)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 14 }}>
              <Avatar uri={avatarUrl(item.host.photo_path)} name={item.host.first_name} size={item.opponent ? 52 : 70} />
              {item.opponent ? <Avatar uri={avatarUrl(item.opponent.photo_path)} name={item.opponent.first_name} size={52} /> : null}
            </View>
            <Text style={st.name} numberOfLines={1}>
              {authorName(item.host)}
              {item.opponent ? ` 🆚 ${authorName(item.opponent)}` : ''}
            </Text>
            {item.title ? (
              <Text style={st.title} numberOfLines={2}>
                {item.title}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  back: { alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FE2C55', borderRadius: radius.md, padding: 12 },
  btn: { flex: 1, borderRadius: radius.md, padding: 14, alignItems: 'center', gap: 3 },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  btnSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, textAlign: 'center' },
  h: { fontSize: 16, fontWeight: '900', color: colors.text, marginTop: 6 },
  card: { flex: 1, backgroundColor: '#1B1220', borderRadius: radius.md, padding: 10, maxWidth: '50%' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  badge: { color: '#fff', backgroundColor: '#FE2C55', fontWeight: '900', fontSize: 11, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  viewers: { color: '#fff', fontSize: 12, fontWeight: '700' },
  name: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  title: { color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'center', marginTop: 2 },
});

/** needs the downloaded "FC & Live" pack */
export default function LiveList() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'LIVE', headerTitleAlign: 'center' }} />
      <PackGate need="live">
        <LiveListInner />
      </PackGate>
    </>
  );
}
