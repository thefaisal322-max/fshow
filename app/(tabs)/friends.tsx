import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useI18n } from '@/i18n';
import { account, FriendRequest } from '@/lib/account';
import { errorMessage } from '@/lib/api';
import { Friend, FriendCounts, friends, SentRequest, shortAge } from '@/lib/friends';
import { useAuth } from '@/lib/auth-context';
import { useUnread } from '@/lib/notifications';
import { presenceText } from '@/lib/presence';
import { authorName, formatCount, social } from '@/lib/social';
import { stories, SuggestedPerson } from '@/lib/stories';
import { avatarUrl } from '@/lib/supabase';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

type View_ = 'home' | 'online' | 'friends' | 'suggestions' | 'sent';

/** Friends tab, like Facebook: requests, people you may know, your friends, who is online. */
export default function FriendsTab() {
  const router = useRouter();
  const { t, d } = useI18n();
  const bottom = useBottomSpace();
  const { refreshFriends } = useUnread();
  const [view, setView] = useState<View_>('home');
  const [counts, setCounts] = useState<FriendCounts>({ friends: 0, online: 0, requests: 0 });
  const [requests, setRequests] = useState<FriendRequest[] | null>(null);
  const [people, setPeople] = useState<SuggestedPerson[]>([]);
  const [list, setList] = useState<Friend[]>([]);
  const [sent, setSent] = useState<SentRequest[]>([]);
  const [asked, setAsked] = useState<Record<string, boolean>>({});
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, r, p, f, s] = await Promise.all([friends.counts(), account.friendRequests(), stories.suggestions(), friends.list(), friends.sent()]);
      setCounts(c);
      setRequests(r);
      setPeople(p);
      setList(f);
      setSent(s);
      setAsked(Object.fromEntries(s.map((x) => [x.id, true])));
    } catch (e) {
      setRequests((old) => old ?? []);
      Alert.alert('', errorMessage(e));
    } finally {
      setRefreshing(false);
      refreshFriends();
    }
  }, [refreshFriends]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function respond(u: FriendRequest, accept: boolean) {
    setRequests((old) => old?.filter((x) => x.id !== u.id) ?? null);
    setCounts((c) => ({ ...c, requests: Math.max(0, c.requests - 1), friends: c.friends + (accept ? 1 : 0) }));
    if (accept) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      await friends.respond(u.id, accept);
      refreshFriends();
    } catch (e) {
      Alert.alert('', errorMessage(e));
      load();
    }
  }

  async function addFriend(id: string) {
    const on = !asked[id];
    setAsked((a) => ({ ...a, [id]: on }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      if (on) await friends.send(id);
      else await friends.cancel(id);
    } catch (e) {
      setAsked((a) => ({ ...a, [id]: !on }));
      Alert.alert('', errorMessage(e));
    }
  }

  /** Suggestions use Follow (not "Add friend"). Friends = people who follow each other. */
  async function follow(id: string) {
    const on = !followed[id];
    setFollowed((f) => ({ ...f, [id]: on }));
    if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await social.follow(id, on, me);
    } catch (e) {
      setFollowed((f) => ({ ...f, [id]: !on }));
      Alert.alert('', errorMessage(e));
    }
  }

  const openUser = (id: string) => router.push({ pathname: '/user/[id]', params: { id } });

  const chips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[st.chips, { flexDirection: d.row }]}>
      {view !== 'home' ? (
        <Pressable onPress={() => setView('home')} style={st.chip}>
          <Ionicons name={d.rtl ? 'arrow-forward' : 'arrow-back'} size={16} color={colors.text} />
        </Pressable>
      ) : null}
      <Pressable onPress={() => setView('online')} style={[st.chip, view === 'online' && st.chipOn]}>
        <View style={st.greenDot} />
        <Text style={[st.chipText, view === 'online' && st.chipTextOn]}>{t('n_online', { n: counts.online })}</Text>
      </Pressable>
      <Pressable onPress={() => setView('suggestions')} style={[st.chip, view === 'suggestions' && st.chipOn]}>
        <Text style={[st.chipText, view === 'suggestions' && st.chipTextOn]}>{t('suggestions')}</Text>
      </Pressable>
      <Pressable onPress={() => setView('friends')} style={[st.chip, view === 'friends' && st.chipOn]}>
        <Text style={[st.chipText, view === 'friends' && st.chipTextOn]}>
          {t('your_friends')} {counts.friends ? `· ${counts.friends}` : ''}
        </Text>
      </Pressable>
      <Pressable onPress={() => setView('sent')} style={[st.chip, view === 'sent' && st.chipOn]}>
        <Text style={[st.chipText, view === 'sent' && st.chipTextOn]}>{t('sent_requests')}</Text>
      </Pressable>
    </ScrollView>
  );

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

  if (!requests) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;

  // ── lists for the chips ──
  if (view === 'online' || view === 'friends') {
    const data = view === 'online' ? list.filter((f) => f.online) : list;
    return (
      <FlatList
        style={{ backgroundColor: colors.bg }}
        data={data}
        keyExtractor={(f) => f.id}
        ListHeaderComponent={chips}
        refreshControl={refresh}
        contentContainerStyle={{ paddingBottom: 16 + bottom }}
        ListEmptyComponent={<Text style={st.empty}>{view === 'online' ? t('nobody_online') : t('no_friends_yet')}</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => openUser(item.id)} style={[st.row, { flexDirection: d.row }]}>
            <View>
              <Avatar uri={avatarUrl(item.photo_path)} name={item.first_name} size={56} />
              {item.online ? <View style={st.onlineDot} /> : null}
            </View>
            <View style={{ flex: 1, alignItems: d.items }}>
              <NameLine u={item} />
              <Text style={st.meta}>{presenceText(item.last_seen_at) || (item.username ? `@${item.username}` : '')}</Text>
            </View>
            <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })} hitSlop={8} style={st.iconBtn}>
              <Ionicons name="person" size={18} color={colors.text} />
            </Pressable>
          </Pressable>
        )}
      />
    );
  }

  if (view === 'suggestions' || view === 'sent') {
    const data = view === 'sent' ? sent.filter((s) => asked[s.id] !== false) : people;
    return (
      <FlatList
        style={{ backgroundColor: colors.bg }}
        data={data as (SuggestedPerson | SentRequest)[]}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={chips}
        refreshControl={refresh}
        contentContainerStyle={{ paddingBottom: 16 + bottom }}
        ListEmptyComponent={<Text style={st.empty}>{view === 'sent' ? t('no_sent_requests') : t('nobody_found')}</Text>}
        renderItem={({ item }) => (
          <PersonCard
            u={item}
            meta={'mutual' in item && item.mutual > 0 ? t('mutual_friends_n', { n: item.mutual }) : 'requested_at' in item ? shortAge(item.requested_at) : ''}
            label={view === 'sent' ? t('cancel_request') : followed[item.id] ? t('following_btn') : t('follow')}
            active={view === 'sent' ? true : !!followed[item.id]}
            onOpen={() => openUser(item.id)}
            onAdd={() => (view === 'sent' ? addFriend(item.id) : follow(item.id))}
            onRemove={view === 'suggestions' ? () => setPeople((old) => old.filter((x) => x.id !== item.id)) : undefined}
          />
        )}
      />
    );
  }

  // ── home: requests + people you may know ──
  const shown = requests.slice(0, 6);
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 16 + bottom }} refreshControl={refresh}>
      {chips}
      <View style={st.divider} />

      <View style={[st.head, { flexDirection: d.row }]}>
        <Text style={st.title}>
          {t('friend_requests')} {requests.length ? <Text style={{ color: colors.error }}>{requests.length}</Text> : null}
        </Text>
        {requests.length > shown.length ? (
          <Pressable onPress={() => router.push('/settings/friend-requests')}>
            <Text style={st.seeAll}>{t('see_all')}</Text>
          </Pressable>
        ) : null}
      </View>
      {shown.length === 0 ? <Text style={[st.empty, { marginTop: 4, marginBottom: 10 }]}>{t('no_friend_requests')}</Text> : null}
      {shown.map((u) => (
        <View key={u.id} style={[st.req, { flexDirection: d.row }]}>
          <Pressable onPress={() => openUser(u.id)}>
            <Avatar uri={avatarUrl(u.photo_path)} name={u.first_name} size={84} />
          </Pressable>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: d.row, justifyContent: 'space-between', alignItems: 'center' }}>
              <NameLine u={u} />
            </View>
            <Text style={[st.meta, { textAlign: d.align }]}>
              {u.mutual > 0
                ? `${t('mutual_friends_n', { n: u.mutual })} · ${shortAge(u.requested_at)}`
                : `${t('followed_by_n', { n: formatCount(u.followers_count ?? 0) })} · ${shortAge(u.requested_at)}`}
            </Text>
            <View style={{ flexDirection: d.row, gap: 8 }}>
              <Pressable onPress={() => respond(u, true)} style={[st.btn, st.btnBlue]}>
                <Text style={[st.btnText, { color: '#fff' }]}>{t('confirm')}</Text>
              </Pressable>
              <Pressable onPress={() => respond(u, false)} style={[st.btn, st.btnGrey]}>
                <Text style={st.btnText}>{t('delete')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ))}

      <View style={st.divider} />
      <View style={[st.head, { flexDirection: d.row }]}>
        <Text style={st.title}>{t('people_you_may_know')}</Text>
        {people.length > 5 ? (
          <Pressable onPress={() => setView('suggestions')}>
            <Text style={st.seeAll}>{t('see_all')}</Text>
          </Pressable>
        ) : null}
      </View>
      {people.slice(0, 5).map((u) => (
        <PersonCard
          key={u.id}
          u={u}
          meta={u.mutual > 0 ? t('mutual_friends_n', { n: u.mutual }) : u.follows_me ? t('follows_you') : u.is_new ? t('new_to_app') : ''}
          label={followed[u.id] ? t('following_btn') : t('follow')}
          active={!!followed[u.id]}
          onOpen={() => openUser(u.id)}
          onAdd={() => follow(u.id)}
          onRemove={() => setPeople((old) => old.filter((x) => x.id !== u.id))}
        />
      ))}
      <Text style={[st.hint, { textAlign: 'center' }]}>💡 {t('hold_follow_hint')}</Text>
    </ScrollView>
  );
}

function NameLine({ u }: { u: { first_name: string; last_name: string; is_fainet: boolean } }) {
  const { d } = useI18n();
  return (
    <View style={{ flexDirection: d.row, alignItems: 'center', flexShrink: 1 }}>
      <Text style={st.name} numberOfLines={1}>
        {authorName(u)}
      </Text>
      {u.is_fainet ? <VerifiedBadge size={15} /> : null}
    </View>
  );
}

function PersonCard({
  u,
  meta,
  label,
  active,
  onOpen,
  onAdd,
  onRemove,
}: {
  u: { id: string; first_name: string; last_name: string; photo_path: string | null; is_fainet: boolean };
  meta: string;
  label: string;
  active: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onRemove?: () => void;
}) {
  const { t, d } = useI18n();
  return (
    <View style={[st.req, { flexDirection: d.row }]}>
      <Pressable onPress={onOpen}>
        <Avatar uri={avatarUrl(u.photo_path)} name={u.first_name} size={84} />
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <NameLine u={u} />
        {meta ? <Text style={[st.meta, { textAlign: d.align }]}>{meta}</Text> : null}
        <View style={{ flexDirection: d.row, gap: 8 }}>
          <Pressable onPress={onAdd} style={[st.btn, active ? st.btnGrey : st.btnBlue]}>
            <Text style={[st.btnText, !active && { color: '#fff' }]}>{label}</Text>
          </Pressable>
          {onRemove ? (
            <Pressable onPress={onRemove} style={[st.btn, st.btnGrey]}>
              <Text style={st.btnText}>{t('remove')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  chips: { gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 9 },
  chipOn: { backgroundColor: colors.soft },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.text },
  chipTextOn: { color: colors.primary },
  greenDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#31A24C' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 12, marginVertical: 4 },
  head: { justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  seeAll: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  req: { alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 9, alignItems: 'center' },
  btnBlue: { backgroundColor: colors.primary },
  btnGrey: { backgroundColor: colors.surface },
  btnSoft: { backgroundColor: colors.soft },
  btnText: { fontWeight: '700', fontSize: 15, color: colors.text },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 30, paddingHorizontal: 20 },
  row: { alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  onlineDot: { position: 'absolute', right: 1, bottom: 1, width: 15, height: 15, borderRadius: 8, backgroundColor: '#31A24C', borderWidth: 2.5, borderColor: colors.bg },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  hint: { color: colors.muted, fontSize: 13, marginTop: 14, paddingHorizontal: 20 },
});
