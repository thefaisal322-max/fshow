import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { ReactElement, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { PostList } from '@/components/PostList';
import { ReelCell, ReelGrid } from '@/components/ReelGrid';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { StringKey, useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { authorName, formatCount, Post, SearchResult, social, TrendingTag } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

type Tab = 'top' | 'reels' | 'posts' | 'people';
const TABS: { key: Tab; label: StringKey }[] = [
  { key: 'top', label: 'search_top' },
  { key: 'reels', label: 'tab_reels' },
  { key: 'posts', label: 'posts' },
  { key: 'people', label: 'search_people' },
];

/** Search with tabs: Top (people + reels + posts) · Reels · Posts · People. Empty box → trending #hashtags. */
export default function Search() {
  const router = useRouter();
  const { t, d } = useI18n();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [text, setText] = useState('');
  const [q, setQ] = useState(''); // debounced
  const [tab, setTab] = useState<Tab>('top');
  const [tags, setTags] = useState<TrendingTag[]>([]);

  useEffect(() => {
    social.trendingTags().then(setTags).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text]);

  const openTag = (tag: string) => router.push({ pathname: '/tag/[tag]', params: { tag } });
  const openReel = (p: Post) => router.push({ pathname: '/reels/search', params: { q, start: p.id } });
  const openUser = (id: string) => router.push({ pathname: '/user/[id]', params: { id } });

  const loadPosts = useCallback((offset: number) => social.searchPosts(q, tab === 'top' ? 'all' : 'posts', offset), [q, tab]);
  const loadReels = useCallback((offset: number) => social.searchPosts(q, 'reels', offset, 21), [q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: true, title: t('search_title'), headerTitleAlign: 'center' }} />

      <View style={st.top}>
        <View style={[st.box, { flexDirection: d.row }]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            placeholder={t('search_hint')}
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={[st.input, { textAlign: d.align }]}
          />
          {text ? (
            <Pressable onPress={() => setText('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        {q ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[st.tabs, { flexDirection: d.row }]}>
            {TABS.map((x) => {
              const on = tab === x.key;
              return (
                <Pressable key={x.key} onPress={() => setTab(x.key)} style={[st.tab, on && st.tabOn]}>
                  <Text style={[st.tabText, on && st.tabTextOn]}>{t(x.label)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {!q ? (
        <Trending tags={tags} onTag={openTag} />
      ) : tab === 'people' ? (
        <People key={`people-${q}`} q={q} me={me} onOpen={openUser} />
      ) : tab === 'reels' ? (
        <ReelGrid key={`reels-${q}`} load={loadReels} empty={t('nothing_found')} onOpen={openReel} />
      ) : (
        <PostList
          key={`${tab}-${q}`}
          load={loadPosts}
          empty={t('nothing_found')}
          header={tab === 'top' ? <TopHeader q={q} me={me} onUser={openUser} onReel={openReel} onMore={setTab} /> : null}
        />
      )}
    </View>
  );
}

function Trending({ tags, onTag }: { tags: TrendingTag[]; onTag: (tag: string) => void }) {
  const { t, d } = useI18n();
  if (!tags.length) return null;
  return (
    <ScrollView contentContainerStyle={{ padding: 8 }}>
      <View style={st.card}>
        <View style={[st.cardHead, { flexDirection: d.row }]}>
          <Ionicons name="trending-up" size={20} color={colors.primary} />
          <Text style={st.cardTitle}>{t('trending')}</Text>
        </View>
        <View style={[st.chips, { flexDirection: d.row }]}>
          {tags.map((x, i) => (
            <Pressable key={x.tag} onPress={() => onTag(x.tag)} style={st.chip}>
              <Text style={st.chipText}>
                {i < 3 ? '🔥 ' : ''}#{x.tag}
              </Text>
              <Text style={st.chipCount}>{formatCount(x.count)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

/** Top tab: a few people, a row of reels, then the posts list below. */
function TopHeader({ q, me, onUser, onReel, onMore }: { q: string; me: string; onUser: (id: string) => void; onReel: (p: Post) => void; onMore: (t: Tab) => void }) {
  const { t, d } = useI18n();
  const { width } = useWindowDimensions();
  const [people, setPeople] = useState<SearchResult[] | null>(null);
  const [reels, setReels] = useState<Post[] | null>(null);

  useEffect(() => {
    let alive = true;
    social
      .search(q)
      .then((r) => alive && setPeople(r.filter((u) => u.id !== me).slice(0, 3)))
      .catch(() => alive && setPeople([]));
    social
      .searchPosts(q, 'reels', 0, 9)
      .then((r) => alive && setReels(r))
      .catch(() => alive && setReels([]));
    return () => {
      alive = false;
    };
  }, [q, me]);

  const cell = Math.floor((width - 16 - 4) / 3);
  const section = (title: StringKey, tab: Tab, body: ReactElement) => (
    <View style={st.card}>
      <View style={[st.cardHead, { flexDirection: d.row, justifyContent: 'space-between' }]}>
        <Text style={st.cardTitle}>{t(title)}</Text>
        <Pressable onPress={() => onMore(tab)} hitSlop={8}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('see_all')}</Text>
        </Pressable>
      </View>
      {body}
    </View>
  );

  if (!people || !reels) return <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />;
  return (
    <View>
      {people.length
        ? section(
            'search_people',
            'people',
            <View>
              {people.map((u) => (
                <PersonRow key={u.id} u={u} onPress={() => onUser(u.id)} />
              ))}
            </View>,
          )
        : null}
      {reels.length
        ? section(
            'tab_reels',
            'reels',
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, flexDirection: d.row }}>
              {reels.map((p) => (
                <ReelCell key={p.id} post={p} size={cell} onPress={() => onReel(p)} />
              ))}
            </ScrollView>,
          )
        : null}
      <Text style={[st.cardTitle, { marginHorizontal: 6, marginVertical: 8, textAlign: d.align }]}>{t('posts')}</Text>
    </View>
  );
}

function People({ q, me, onOpen }: { q: string; me: string; onOpen: (id: string) => void }) {
  const { t } = useI18n();
  const bottom = useBottomSpace();
  const [items, setItems] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    social
      .search(q)
      .then((r) => alive && setItems(r.filter((u) => u.id !== me)))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [q, me]);

  async function follow(u: SearchResult) {
    const on = !u.followed_by_me;
    const set = (x: SearchResult) => setItems((old) => old?.map((o) => (o.id === x.id ? x : o)) ?? null);
    set({ ...u, followed_by_me: on, followers_count: Math.max(0, u.followers_count + (on ? 1 : -1)) });
    try {
      await social.follow(u.id, on, me);
    } catch {
      set(u);
    }
  }

  if (!items && !error) return <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />;
  return (
    <FlatList
      data={items ?? []}
      keyExtractor={(u) => u.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 8, paddingBottom: 8 + bottom }}
      renderItem={({ item }) => (
        <View style={st.card}>
          <PersonRow u={item} onPress={() => onOpen(item.id)} onFollow={() => follow(item)} />
        </View>
      )}
      ListEmptyComponent={<Text style={st.empty}>{error ?? t('nobody_found')}</Text>}
    />
  );
}

function PersonRow({ u, onPress, onFollow }: { u: SearchResult; onPress: () => void; onFollow?: () => void }) {
  const { t, d } = useI18n();
  return (
    <Pressable onPress={onPress} style={[st.person, { flexDirection: d.row }]}>
      <Avatar uri={avatarUrl(u.photo_path)} name={u.first_name} size={48} />
      <View style={{ flex: 1, alignItems: d.items }}>
        <View style={{ flexDirection: d.row, alignItems: 'center' }}>
          <Text style={st.name} numberOfLines={1}>
            {authorName(u)}
          </Text>
          {u.is_fainet ? <VerifiedBadge size={14} /> : null}
        </View>
        <Text style={st.meta} numberOfLines={1}>
          {u.username ? `@${u.username} · ` : ''}
          {formatCount(u.followers_count)} {t('followers_word')}
        </Text>
      </View>
      {onFollow ? (
        <Pressable onPress={onFollow} style={[st.follow, u.followed_by_me && st.following]}>
          <Text style={[st.followText, u.followed_by_me && { color: colors.primary }]}>
            {u.followed_by_me ? t('following') : t('follow')}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  top: { backgroundColor: colors.card, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  box: { alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.full, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 9 },
  tabs: { gap: 8, paddingTop: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.surface },
  tabOn: { backgroundColor: colors.soft },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.text },
  tabTextOn: { color: colors.primary },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  cardHead: { alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  chips: { flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.soft, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: colors.primary, fontWeight: '700' },
  chipCount: { color: colors.muted, fontSize: 12 },
  person: { alignItems: 'center', gap: 12, paddingVertical: 6 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  follow: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: radius.full },
  following: { backgroundColor: colors.soft },
  followText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 30 },
});
