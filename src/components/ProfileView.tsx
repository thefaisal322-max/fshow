import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { profileSignal } from '@/lib/signals';
import { authorName, formatCount, social, UserProfile } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius } from '@/theme';

import { Avatar } from './Avatar';
import { VerifiedBadge } from './PostCard';
import { PostList, PostListHandle } from './PostList';
import { Button } from './ui';

/** Profile header + posts (and "Saved" for your own profile). Used by the Profile tab and /user/[id]. */
export function ProfileView({ userId }: { userId: string }) {
  const router = useRouter();
  const { session, signOut, refreshProfile } = useAuth();
  const me = session?.user.id ?? '';
  const isMe = userId === me;
  const [user, setUser] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<'posts' | 'saved'>('posts');
  const [followBusy, setFollowBusy] = useState(false);
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
    setFollowBusy(true);
    try {
      await social.follow(user.id, on, me);
    } catch (e) {
      setUser(user);
      Alert.alert('', errorMessage(e));
    } finally {
      setFollowBusy(false);
    }
  }

  function menu() {
    if (isMe) {
      Alert.alert('', '', [
        { text: 'وتل (Logout)', style: 'destructive', onPress: signOut },
        { text: 'بندول', style: 'cancel' },
      ]);
    } else {
      Alert.alert('', '', [
        {
          text: 'راپور ورکول (Report)',
          onPress: async () => {
            try {
              await social.report({ userId }, 'inappropriate');
              Alert.alert('', 'مننه. راپور مو ورسېد.');
            } catch (e) {
              Alert.alert('', errorMessage(e));
            }
          },
        },
        { text: 'بندول', style: 'cancel' },
      ]);
    }
  }

  const header = user ? (
    <View>
      <View style={st.cover}>
        <Pressable onPress={menu} style={st.menuBtn} hitSlop={10}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>⋯</Text>
        </Pressable>
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

      <View style={st.stats}>
        <Stat n={user.following_count} label="Following" />
        <Stat n={user.followers_count} label="Followers" />
        <Stat n={user.likes_count} label="Likes" />
        <Stat n={user.posts_count} label="Posts" />
      </View>

      {!isMe ? (
        <View style={{ paddingHorizontal: 4 }}>
          <Button
            title={user.followed_by_me ? 'Following ✓' : user.follows_me ? 'Follow Back' : 'Follow'}
            variant={user.followed_by_me ? 'secondary' : 'primary'}
            onPress={toggleFollow}
            disabled={followBusy}
          />
        </View>
      ) : (
        <View style={st.tabs}>
          <Pressable style={[st.tab, tab === 'posts' && st.tabOn]} onPress={() => setTab('posts')}>
            <Text style={[st.tabText, tab === 'posts' && { color: colors.primary }]}>پوسټونه</Text>
          </Pressable>
          <Pressable style={[st.tab, tab === 'saved' && st.tabOn]} onPress={() => setTab('saved')}>
            <Text style={[st.tabText, tab === 'saved' && { color: colors.primary }]}>سېو شوي</Text>
          </Pressable>
        </View>
      )}
      {isMe ? (
        <Button title="نوی پوسټ +" variant="link" onPress={() => router.push('/create')} />
      ) : null}
    </View>
  ) : null;

  return (
    <PostList
      ref={list}
      load={load}
      header={header}
      empty={tab === 'saved' ? 'تر اوسه مو هېڅ پوسټ نه دی سېو کړی' : isMe ? 'تر اوسه مو هېڅ پوسټ نه دی اچولی' : 'تر اوسه هېڅ پوسټ نشته'}
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
  menuBtn: { position: 'absolute', top: 6, left: 12, padding: 6 },
  avatarWrap: { alignItems: 'center', marginTop: -56 },
  avatarRing: { padding: 4, backgroundColor: '#fff', borderRadius: 999 },
  name: { fontSize: 21, fontWeight: '800', textAlign: 'center', color: colors.text },
  username: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 2 },
  bio: { fontSize: 15, color: colors.text, textAlign: 'center', marginTop: 8, lineHeight: 22, paddingHorizontal: 12 },
  stats: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: radius.md, paddingVertical: 12, marginVertical: 12 },
  tabs: { flexDirection: 'row-reverse', backgroundColor: colors.card, borderRadius: radius.md, marginBottom: 6 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 11, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 15, fontWeight: '700', color: colors.muted },
});
