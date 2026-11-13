import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { StringKey, useI18n } from '@/i18n';
import { AdminUser, adminApi, CodeUse, MonetizeRequest, Overview, Report } from '@/lib/admin';
import { errorMessage } from '@/lib/api';
import { Author, authorName, formatCount, timeAgo } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

type Section = 'overview' | 'monetize' | 'codes' | 'reports' | 'users';
const SECTIONS: { key: Section; icon: keyof typeof Ionicons.glyphMap; label: StringKey }[] = [
  { key: 'overview', icon: 'speedometer', label: 'adm_overview' },
  { key: 'monetize', icon: 'cash', label: 'adm_monetize' },
  { key: 'codes', icon: 'key', label: 'adm_codes' },
  { key: 'reports', icon: 'flag', label: 'adm_reports' },
  { key: 'users', icon: 'people', label: 'adm_users' },
];

/** "Main" tab — only for the admin accounts. */
export default function Main() {
  const { t, d } = useI18n();
  const [section, setSection] = useState<Section>('overview');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={[st.chips, { flexDirection: d.row }]}>
        {SECTIONS.map((s) => {
          const on = section === s.key;
          return (
            <Pressable key={s.key} onPress={() => setSection(s.key)} style={[st.chip, on && st.chipOn]}>
              <Ionicons name={s.icon} size={15} color={on ? '#fff' : colors.text} />
              <Text style={[st.chipText, on && { color: '#fff' }]}>{t(s.label)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {section === 'overview' ? <OverviewView go={setSection} /> : null}
      {section === 'monetize' ? <MonetizeView /> : null}
      {section === 'codes' ? <CodesView /> : null}
      {section === 'reports' ? <ReportsView /> : null}
      {section === 'users' ? <UsersView /> : null}
    </View>
  );
}

function useLoad<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => {
    fn()
      .then(setData)
      .catch((e) => Alert.alert('', errorMessage(e)))
      .finally(() => setRefreshing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(load);
  const refresh = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
      colors={[colors.primary]}
      tintColor={colors.primary}
    />
  );
  return { data, setData, load, refresh };
}

function OverviewView({ go }: { go: (s: Section) => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const bottom = useBottomSpace();
  const { data, refresh } = useLoad<Overview>(adminApi.overview);
  if (!data) return <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />;
  const tiles: { n: number; label: StringKey; icon: keyof typeof Ionicons.glyphMap; onPress?: () => void; alert?: boolean }[] = [
    { n: data.users, label: 'adm_t_users', icon: 'people', onPress: () => go('users') },
    { n: data.users_today, label: 'adm_t_today', icon: 'person-add' },
    { n: data.online, label: 'adm_t_online', icon: 'radio-button-on' },
    { n: data.posts, label: 'adm_t_posts', icon: 'images' },
    { n: data.reels, label: 'adm_t_reels', icon: 'film' },
    { n: data.monetize, label: 'adm_t_monetize', icon: 'cash', onPress: () => go('monetize'), alert: data.monetize > 0 },
    { n: data.proofs, label: 'adm_t_proofs', icon: 'document-attach', onPress: () => router.push('/settings/admin'), alert: data.proofs > 0 },
    { n: data.payouts, label: 'adm_t_payouts', icon: 'wallet', onPress: () => router.push('/settings/admin'), alert: data.payouts > 0 },
    { n: data.reports, label: 'adm_t_reports', icon: 'flag', onPress: () => go('reports'), alert: data.reports > 0 },
    { n: data.codes_today, label: 'adm_t_codes', icon: 'key', onPress: () => go('codes') },
    { n: data.banned, label: 'adm_t_banned', icon: 'ban' },
  ];
  return (
    <ScrollView refreshControl={refresh} contentContainerStyle={[st.grid, { paddingBottom: 16 + bottom }]}>
      {tiles.map((x) => (
        <Pressable key={x.label} onPress={x.onPress} disabled={!x.onPress} style={[st.tile, x.alert && { borderColor: colors.error }]}>
          <Ionicons name={x.icon} size={22} color={x.alert ? colors.error : colors.primary} />
          <Text style={st.tileN}>{formatCount(x.n)}</Text>
          <Text style={st.tileLabel}>{t(x.label)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Who({ u, sub }: { u: Author | null; sub?: string }) {
  const { d } = useI18n();
  const router = useRouter();
  if (!u) return <Text style={st.small}>—</Text>;
  return (
    <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: u.id } })} style={{ flexDirection: d.row, alignItems: 'center', gap: 8, flexShrink: 1 }}>
      <Avatar uri={avatarUrl(u.photo_path)} name={u.first_name} size={34} />
      <View style={{ flexShrink: 1, alignItems: d.items }}>
        <View style={{ flexDirection: d.row, alignItems: 'center' }}>
          <Text style={st.name} numberOfLines={1}>
            {authorName(u)}
          </Text>
          {u.is_fainet ? <VerifiedBadge size={13} /> : null}
        </View>
        <Text style={st.small} numberOfLines={1}>
          {sub ?? (u.username ? `@${u.username}` : '')}
        </Text>
      </View>
    </Pressable>
  );
}

function MonetizeView() {
  const { t, d } = useI18n();
  const bottom = useBottomSpace();
  const { data, setData, load, refresh } = useLoad<MonetizeRequest[]>(adminApi.monetizeRequests);
  async function set(u: MonetizeRequest, approve: boolean) {
    setData((old) => old?.map((x) => (x.id === u.id ? { ...x, status: approve ? 'approved' : 'rejected' } : x)) ?? null);
    try {
      await adminApi.setMonetize(u.id, approve);
    } catch (e) {
      Alert.alert('', errorMessage(e));
      load();
    }
  }
  if (!data) return <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />;
  return (
    <FlatList
      data={data}
      keyExtractor={(x) => x.id}
      refreshControl={refresh}
      contentContainerStyle={{ padding: 10, paddingBottom: 16 + bottom }}
      ListEmptyComponent={<Text style={st.empty}>{t('nothing_pending')}</Text>}
      renderItem={({ item }) => (
        <View style={st.card}>
          <View style={{ flexDirection: d.row, justifyContent: 'space-between', alignItems: 'center' }}>
            <Who u={item} sub={item.email ?? undefined} />
            <Text style={[st.badge, item.status === 'approved' ? st.ok : item.status === 'rejected' ? st.bad : st.wait]}>{t(`app_${item.status}` as StringKey)}</Text>
          </View>
          <Text selectable style={[st.phone, { textAlign: d.align }]}>📱 HesabPay: {item.phone}</Text>
          <Text style={[st.small, { textAlign: d.align }]}>
            {t('followers')}: {item.followers} · {t('tab_reels')}: {item.reels} · {timeAgo(item.requested_at)}
          </Text>
          {item.status !== 'approved' ? (
            <View style={{ flexDirection: d.row, gap: 8, marginTop: 8 }}>
              <Pressable onPress={() => set(item, true)} style={[st.btn, { backgroundColor: colors.success }]}>
                <Text style={st.btnText}>{t('approve')}</Text>
              </Pressable>
              {item.status !== 'rejected' ? (
                <Pressable onPress={() => set(item, false)} style={[st.btn, { backgroundColor: colors.error }]}>
                  <Text style={st.btnText}>{t('reject')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      )}
    />
  );
}

const KIND: Record<string, string> = { followers: '👥 +', likes: '❤️ +', views: '👁️ +', remove: '🧹 ', verify: '✔️ ' };

function CodesView() {
  const { t, d } = useI18n();
  const bottom = useBottomSpace();
  const { data, refresh } = useLoad<CodeUse[]>(adminApi.codeUses);
  if (!data) return <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />;
  return (
    <FlatList
      data={data}
      keyExtractor={(x) => String(x.id)}
      refreshControl={refresh}
      contentContainerStyle={{ padding: 10, paddingBottom: 16 + bottom }}
      ListHeaderComponent={<Text style={[st.small, { textAlign: d.align, marginBottom: 8 }]}>{t('adm_codes_sub')}</Text>}
      ListEmptyComponent={<Text style={st.empty}>{t('nothing_pending')}</Text>}
      renderItem={({ item }) => (
        <View style={st.card}>
          <Text style={[st.kind, { textAlign: d.align }]}>
            {KIND[item.kind] ?? ''}
            {item.amount ? formatCount(item.amount) : ''} {t(`adm_kind_${item.kind}` as StringKey)} · {timeAgo(item.created_at)}
          </Text>
          <View style={{ flexDirection: d.row, alignItems: 'center', gap: 6, marginTop: 6 }}>
            <View style={{ flex: 1 }}>
              <Text style={st.small}>{t('adm_gave')}</Text>
              <Who u={item.actor} />
            </View>
            <Ionicons name={d.rtl ? 'arrow-back' : 'arrow-forward'} size={18} color={colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={st.small}>{t('adm_got')}</Text>
              <Who u={item.target} />
            </View>
          </View>
        </View>
      )}
    />
  );
}

function ReportsView() {
  const { t, d } = useI18n();
  const router = useRouter();
  const bottom = useBottomSpace();
  const { data, setData, load, refresh } = useLoad<Report[]>(adminApi.reports);
  async function resolve(r: Report, deletePost: boolean) {
    setData((old) => old?.filter((x) => x.id !== r.id) ?? null);
    try {
      await adminApi.resolveReport(r.id, deletePost);
    } catch (e) {
      Alert.alert('', errorMessage(e));
      load();
    }
  }
  if (!data) return <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />;
  return (
    <FlatList
      data={data}
      keyExtractor={(x) => x.id}
      refreshControl={refresh}
      contentContainerStyle={{ padding: 10, paddingBottom: 16 + bottom }}
      ListEmptyComponent={<Text style={st.empty}>{t('nothing_pending')}</Text>}
      renderItem={({ item }) => (
        <View style={st.card}>
          <Text style={[st.kind, { textAlign: d.align }]}>
            🚩 {item.reason} · {timeAgo(item.created_at)}
          </Text>
          <Text style={[st.small, { textAlign: d.align, marginTop: 6 }]}>{t('adm_reported')}</Text>
          <Who u={item.user} />
          {item.post ? (
            <Pressable onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.post!.id } })} style={st.postBox}>
              <Text style={{ color: colors.text, textAlign: d.align }} numberOfLines={3}>
                {item.post.video_path ? '🎬 ' : item.post.image_path ? '📷 ' : ''}
                {item.post.body || '—'}
              </Text>
            </Pressable>
          ) : null}
          <Text style={[st.small, { textAlign: d.align, marginTop: 6 }]}>
            {t('adm_by')} {item.reporter ? authorName(item.reporter) : '—'}
          </Text>
          <View style={{ flexDirection: d.row, gap: 8, marginTop: 8 }}>
            {item.post ? (
              <Pressable onPress={() => resolve(item, true)} style={[st.btn, { backgroundColor: colors.error }]}>
                <Text style={st.btnText}>{t('delete_post')}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => resolve(item, false)} style={[st.btn, { backgroundColor: colors.surface }]}>
              <Text style={[st.btnText, { color: colors.text }]}>{t('adm_dismiss')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    />
  );
}

function UsersView() {
  const { t, d } = useI18n();
  const router = useRouter();
  const bottom = useBottomSpace();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<AdminUser[] | null>(null);

  const load = useCallback((query: string) => {
    adminApi
      .users(query)
      .then(setItems)
      .catch((e) => Alert.alert('', errorMessage(e)));
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => load(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q, load]);

  const patch = (id: string, p: Partial<AdminUser>) => setItems((old) => old?.map((x) => (x.id === id ? { ...x, ...p } : x)) ?? null);

  function act(u: AdminUser) {
    const run = async (fn: () => Promise<void>, after?: () => void) => {
      try {
        await fn();
        after?.();
      } catch (e) {
        Alert.alert('', errorMessage(e));
      }
    };
    Alert.alert(authorName(u), u.email ?? '', [
      { text: t('adm_view'), onPress: () => router.push({ pathname: '/user/[id]', params: { id: u.id } }) },
      {
        text: u.verified ? t('adm_unverify') : t('adm_verify'),
        onPress: () => run(() => adminApi.setVerified(u.id, !u.verified), () => patch(u.id, { verified: !u.verified, is_fainet: !u.verified })),
      },
      { text: t('adm_reset_fakes'), onPress: () => run(() => adminApi.resetFakes(u.id), () => patch(u.id, { bonus_followers: 0 })) },
      {
        text: u.banned ? t('adm_unban') : t('adm_ban'),
        style: 'destructive',
        onPress: () => run(() => adminApi.userAction(u.id, u.banned ? 'unban' : 'ban'), () => patch(u.id, { banned: !u.banned })),
      },
      {
        text: t('adm_delete'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('adm_delete_q', { name: authorName(u) }), t('delete_forever'), [
            { text: t('cancel'), style: 'cancel' },
            {
              text: t('adm_delete'),
              style: 'destructive',
              onPress: () => run(() => adminApi.userAction(u.id, 'delete'), () => setItems((old) => old?.filter((x) => x.id !== u.id) ?? null)),
            },
          ]),
      },
      { text: t('close'), style: 'cancel' },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={t('adm_search_users')}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        style={[st.search, { textAlign: d.align }]}
      />
      {!items ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: 10, paddingBottom: 16 + bottom }}
          ListEmptyComponent={<Text style={st.empty}>{t('nobody_found')}</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => act(item)} style={[st.card, item.banned && { borderColor: colors.error, borderWidth: 1 }]}>
              <View style={{ flexDirection: d.row, justifyContent: 'space-between', alignItems: 'center' }}>
                <Who u={item} sub={item.username ? `@${item.username}` : ''} />
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
              </View>
              <Text selectable style={[st.email, { textAlign: d.align }]}>✉️ {item.email ?? '—'}</Text>
              <Text style={[st.small, { textAlign: d.align }]}>
                {t('followers')}: {formatCount(item.followers)}
                {item.bonus_followers ? ` (+${formatCount(item.bonus_followers)} ${t('adm_fake')})` : ''} · {t('posts')}: {item.posts} ·{' '}
                {timeAgo(item.created_at)}
              </Text>
              <View style={{ flexDirection: d.row, gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {item.banned ? <Text style={[st.badge, st.bad]}>⛔ {t('adm_banned')}</Text> : null}
                {item.verified ? <Text style={[st.badge, st.ok]}>✔ {t('adm_verified')}</Text> : null}
                {item.monetize ? <Text style={[st.badge, item.monetize === 'approved' ? st.ok : st.wait]}>💰 {t(`app_${item.monetize}` as StringKey)}</Text> : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  chips: { gap: 8, padding: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '700', color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 10 },
  tile: { width: '31%', minWidth: 100, flexGrow: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border },
  tileN: { fontSize: 22, fontWeight: '900', color: colors.text },
  tileLabel: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 10 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  small: { fontSize: 12, color: colors.muted },
  phone: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 8 },
  email: { fontSize: 14, color: colors.text, marginTop: 8 },
  kind: { fontSize: 15, fontWeight: '800', color: colors.text },
  badge: { fontSize: 12, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  ok: { backgroundColor: colors.successBg, color: colors.success },
  bad: { backgroundColor: colors.errorBg, color: colors.error },
  wait: { backgroundColor: colors.soft, color: colors.primary },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800' },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 30 },
  postBox: { marginTop: 8, backgroundColor: colors.surface, borderRadius: radius.sm, padding: 10 },
  search: { margin: 10, marginBottom: 0, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
});
