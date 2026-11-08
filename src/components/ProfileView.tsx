import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { StringKey, useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { chat } from '@/lib/chat';
import { profileSignal } from '@/lib/signals';
import { authorName, formatCount, social, UserProfile } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius } from '@/theme';

import { Avatar } from './Avatar';
import { OfflineBanner } from './OfflineBanner';
import { VerifiedBadge } from './PostCard';
import { PostList, PostListHandle } from './PostList';
import { ReelGrid, ReelGridHandle } from './ReelGrid';

/** Profile header + posts (and "Saved" for your own profile). Used by the Profile tab and /user/[id]. */
export function ProfileView({ userId }: { userId: string }) {
  const router = useRouter();
  const { t, d } = useI18n();
  const { session, refreshProfile } = useAuth();
  const me = session?.user.id ?? '';
  const isMe = userId === me;
  const [user, setUser] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [busy, setBusy] = useState(false);
  const list = useRef<PostListHandle>(null);
  const grid = useRef<ReelGridHandle>(null);

  const loadUser = useCallback(async () => {
    try {
      setUser(await social.profile(userId));
    } catch (e) {
      Alert.alert('', errorMessage(e));
    }
  }, [userId]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useFocusEffect(
    useCallback(() => {
      if (isMe && profileSignal.dirty) {
        profileSignal.dirty = false;
        loadUser();
        refreshProfile();
        list.current?.reload();
        grid.current?.reload();
      }
    }, [isMe, loadUser, refreshProfile]),
  );

  const load = useCallback(
    (offset: number) =>
      tab === 'saved'
        ? social.savedPosts(offset)
        : social.userPosts(userId, offset, tab === 'reels' ? 'reels' : tab === 'posts' ? 'posts' : 'all', tab === 'reels' ? 21 : undefined),
    [tab, userId],
  );

  async function toggleFollow() {
    if (!user) return;
    const on = !user.followed_by_me;
    setUser({ ...user, followed_by_me: on, followers_count: Math.max(0, user.followers_count + (on ? 1 : -1)) });
    setBusy(true);
    try {
      await social.follow(user.id, on, me);
    } catch (e) {
      setUser(user);
      Alert.alert('', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function message() {
    setBusy(true);
    try {
      const id = await chat.startDirect(userId);
      router.push({ pathname: '/chats/[id]', params: { id } });
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function menu() {
    if (!user) return;
    Alert.alert('', '', [
      {
        text: user.blocked_by_me ? t('unblock') : t('block'),
        style: 'destructive',
        onPress: () => {
          const run = async (on: boolean) => {
            try {
              await social.block(userId, on);
              await loadUser();
            } catch (e) {
              Alert.alert('', errorMessage(e));
            }
          };
          if (user.blocked_by_me) run(false);
          else
            Alert.alert(t('block_q', { name: authorName(user) }), t('block_warn'), [
              { text: t('cancel'), style: 'cancel' },
              { text: t('block'), style: 'destructive', onPress: () => run(true) },
            ]);
        },
      },
      {
        text: t('report'),
        onPress: async () => {
          try {
            await social.report({ userId }, 'inappropriate');
            Alert.alert('', t('report_thanks'));
          } catch (e) {
            Alert.alert('', errorMessage(e));
          }
        },
      },
      { text: t('close'), style: 'cancel' },
    ]);
  }

  const header = user ? (
    <View>
      <OfflineBanner />
      <View style={st.cover}>
        {!isMe ? (
          <Pressable onPress={menu} style={[st.menuBtn, d.rtl ? { left: 12 } : { right: 12 }]} hitSlop={10}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>⋯</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={st.avatarWrap}>
        <View style={st.avatarRing}>
          <Avatar uri={avatarUrl(user.photo_path)} name={user.first_name} size={104} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
        <Text style={st.name}>{authorName(user)}</Text>
        {user.is_fainet ? <VerifiedBadge size={18} /> : null}
      </View>
      {user.username ? <Text style={st.username}>@{user.username}</Text> : null}
      {user.bio ? <Text style={st.bio}>{user.bio}</Text> : null}
      <Intro user={user} isMe={isMe} onEdit={() => router.push('/settings/details')} />

      <View style={[st.stats, { flexDirection: d.row }]}>
        <Stat n={user.following_count} label="Following" />
        <Stat n={user.followers_count} label="Followers" />
        <Stat n={user.likes_count} label="Likes" />
        <Stat n={user.posts_count} label="Posts" />
      </View>

      {!isMe && (user.blocked_by_me || user.blocked_me) ? (
        <View style={{ alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Text style={{ color: colors.muted }}>{user.blocked_by_me ? t('blocked_banner') : t('blocked_me_banner')}</Text>
          {user.blocked_by_me ? (
            <Pressable onPress={menu} style={[st.btn, st.btnLight, { paddingHorizontal: 24 }]}>
              <Text style={[st.btnText, { color: colors.primary }]}>{t('unblock')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : !isMe ? (
        <View style={{ flexDirection: d.row, gap: 8, marginBottom: 8 }}>
          <Pressable
            onPress={toggleFollow}
            disabled={busy}
            style={[st.btn, { flex: 2 }, user.followed_by_me ? st.btnLight : st.btnBlue]}
          >
            <Text style={[st.btnText, user.followed_by_me && { color: colors.primary }]}>
              {user.followed_by_me ? t('following_btn') : user.follows_me ? t('follow_back') : t('follow')}
            </Text>
          </Pressable>
          <Pressable onPress={message} disabled={busy} style={[st.btn, st.btnLight, { flex: 1 }]}>
            <Text style={[st.btnText, { color: colors.primary }]}>{t('message_btn')}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => router.push('/create')} style={[st.btn, st.btnBlue, { marginBottom: 8, flexDirection: 'row', justifyContent: 'center', gap: 6 }]}>
          <Text style={st.btnText}>＋ {t('new_post_btn')}</Text>
        </Pressable>
      )}

      {/* small tabs like Facebook: All · Posts · Reels · Saved (Saved only on your own profile) */}
      {!(user.blocked_by_me || user.blocked_me) || isMe ? (
        <View style={[st.chips, { flexDirection: d.row }]}>
          {TABS.filter((x) => isMe || x.key !== 'saved').map((x) => {
            const on = tab === x.key;
            return (
              <Pressable key={x.key} onPress={() => setTab(x.key)} style={[st.chip, on && st.chipOn]}>
                <Text style={[st.chipText, on && st.chipTextOn]}>{t(x.label)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  ) : null;

  if (tab === 'reels') {
    return (
      <ReelGrid
        ref={grid}
        load={load}
        header={header}
        empty={t('no_reels_profile')}
        onOpen={(p) =>
          router.push({ pathname: '/reels/[user]', params: { user: userId, start: p.id, name: user ? authorName(user) : '' } })
        }
      />
    );
  }

  return (
    <PostList
      key={tab}
      ref={list}
      load={load}
      header={header}
      empty={tab === 'saved' ? t('empty_saved') : isMe ? t('empty_my_posts') : t('no_posts')}
    />
  );
}

type Tab = 'all' | 'posts' | 'reels' | 'saved';
const TABS: { key: Tab; label: StringKey }[] = [
  { key: 'all', label: 'tab_all' },
  { key: 'posts', label: 'posts' },
  { key: 'reels', label: 'tab_reels' },
  { key: 'saved', label: 'saved' },
];

/** Facebook-style "Intro": lives in, from, works at, studied at, website. */
function Intro({ user, isMe, onEdit }: { user: UserProfile; isMe: boolean; onEdit: () => void }) {
  const { t, d } = useI18n();
  const rows: { icon: keyof typeof Ionicons.glyphMap; text: string; link?: string }[] = [];
  if (user.city) rows.push({ icon: 'home', text: t('lives_in', { x: user.city }) });
  if (user.hometown) rows.push({ icon: 'location', text: t('from_x', { x: user.hometown }) });
  if (user.work) rows.push({ icon: 'briefcase', text: t('works_at', { x: user.work }) });
  if (user.education) rows.push({ icon: 'school', text: t('studied_at', { x: user.education }) });
  if (user.website) rows.push({ icon: 'link', text: user.website.replace(/^https?:\/\//, ''), link: user.website });
  if (!rows.length && !isMe) return null;
  return (
    <View style={st.intro}>
      {rows.map((r) => (
        <Pressable
          key={r.icon}
          disabled={!r.link}
          onPress={() => r.link && Linking.openURL(r.link)}
          style={{ flexDirection: d.row, alignItems: 'center', gap: 10, paddingVertical: 5 }}
        >
          <Ionicons name={r.icon} size={18} color={colors.muted} />
          <Text style={[{ flex: 1, color: r.link ? colors.primary : colors.text, fontSize: 15, textAlign: d.align }]} numberOfLines={1}>
            {r.text}
          </Text>
        </Pressable>
      ))}
      {isMe ? (
        <Pressable onPress={onEdit} style={st.introBtn}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>{rows.length ? t('edit_details') : t('add_details')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{formatCount(n ?? 0)}</Text>
      <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  cover: { height: 130, borderRadius: radius.lg, backgroundColor: colors.primary },
  menuBtn: { position: 'absolute', top: 6, padding: 6 },
  avatarWrap: { alignItems: 'center', marginTop: -56 },
  avatarRing: { padding: 4, backgroundColor: colors.card, borderRadius: 999 },
  name: { fontSize: 21, fontWeight: '800', textAlign: 'center', color: colors.text },
  username: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 2 },
  bio: { fontSize: 15, color: colors.text, textAlign: 'center', marginTop: 8, lineHeight: 22, paddingHorizontal: 12 },
  stats: { backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 12, marginVertical: 12 },
  btn: { borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  btnBlue: { backgroundColor: colors.primary },
  btnLight: { backgroundColor: colors.soft },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  intro: { backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 8, marginTop: 12 },
  introBtn: { backgroundColor: colors.soft, borderRadius: radius.md, paddingVertical: 9, alignItems: 'center', marginTop: 6, marginBottom: 4 },
  chips: { gap: 8, marginBottom: 8, paddingVertical: 2 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.soft },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.text },
  chipTextOn: { color: colors.primary },
});
