import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { chat } from '@/lib/chat';
import { profileSignal } from '@/lib/signals';
import { authorName, formatCount, social, UserProfile } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius } from '@/theme';

import { Avatar } from './Avatar';
import { VerifiedBadge } from './PostCard';
import { PostList, PostListHandle } from './PostList';

/** Profile header + posts (and "Saved" for your own profile). Used by the Profile tab and /user/[id]. */
export function ProfileView({ userId }: { userId: string }) {
  const router = useRouter();
  const { t, d } = useI18n();
  const { session, refreshProfile } = useAuth();
  const me = session?.user.id ?? '';
  const isMe = userId === me;
  const [user, setUser] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<'posts' | 'saved'>('posts');
  const [busy, setBusy] = useState(false);
  const list = useRef<PostListHandle>(null);

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
      }
    }, [isMe, loadUser, refreshProfile]),
  );

  const load = useCallback(
    (offset: number) => (tab === 'saved' ? social.savedPosts(offset) : social.userPosts(userId, offset)),
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
        <>
          <View style={[st.tabs, { flexDirection: d.row }]}>
            <Pressable style={[st.tab, tab === 'posts' && st.tabOn]} onPress={() => setTab('posts')}>
              <Text style={[st.tabText, tab === 'posts' && { color: colors.primary }]}>{t('posts')}</Text>
            </Pressable>
            <Pressable style={[st.tab, tab === 'saved' && st.tabOn]} onPress={() => setTab('saved')}>
              <Text style={[st.tabText, tab === 'saved' && { color: colors.primary }]}>{t('saved')}</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => router.push('/create')} style={{ padding: 10 }}>
            <Text style={{ color: colors.primary, textAlign: 'center', fontWeight: '700' }}>{t('new_post_btn')}</Text>
          </Pressable>
        </>
      )}
    </View>
  ) : null;

  return (
    <PostList
      ref={list}
      load={load}
      header={header}
      empty={tab === 'saved' ? t('empty_saved') : isMe ? t('empty_my_posts') : t('no_posts')}
    />
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
  tabs: { backgroundColor: colors.card, borderRadius: radius.md, marginBottom: 2 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 11, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 15, fontWeight: '700', color: colors.muted },
});
