import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { authorName, formatCount, Post, social, videoUrl } from '@/lib/social';
import { stories, StoryRing, storyStore, storyUrl, SuggestedPerson } from '@/lib/stories';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius } from '@/theme';

import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

/* ───────────────────────── "What's on your mind?" + stories ───────────────────────── */

export function HomeHeader({ refreshKey }: { refreshKey: number }) {
  const router = useRouter();
  const { t, d } = useI18n();
  const { profile } = useAuth();
  return (
    <View style={{ backgroundColor: colors.card, marginHorizontal: -8, marginTop: -8, marginBottom: 10 }}>
      <View style={[st.composer, { flexDirection: d.row }]}>
        <Pressable onPress={() => router.push('/profile')}>
          <Avatar uri={profile?.photoURL} name={profile?.firstName} size={42} />
        </Pressable>
        <Pressable style={st.mind} onPress={() => router.push('/create')}>
          <Text style={[st.mindText, { textAlign: d.align }]}>{t('whats_on_mind')}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/create')} hitSlop={8}>
          <Ionicons name="images" size={26} color={colors.success} />
        </Pressable>
      </View>
      <StoriesRow refreshKey={refreshKey} />
    </View>
  );
}

function StoriesRow({ refreshKey }: { refreshKey: number }) {
  const router = useRouter();
  const { t, d } = useI18n();
  const { session, profile } = useAuth();
  const me = session?.user.id ?? '';
  const [rings, setRings] = useState<StoryRing[]>([]);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await stories.rings();
      storyStore.rings = r;
      setRings(r);
    } catch {
      // stories are optional on the home screen
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function addStory() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('', t('photos_permission'));
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8, videoMaxDuration: 60 });
    const a = res.canceled ? null : res.assets[0];
    if (!a || !session) return;
    setPosting(true);
    try {
      await stories.create(session.user.id, { uri: a.uri, type: a.type === 'video' ? 'video' : 'image', mime: a.mimeType, duration: a.duration });
      await load();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setPosting(false);
    }
  }

  const mine = rings.find((r) => r.author.id === me);
  const others = rings.filter((r) => r.author.id !== me);
  const open = (ring: StoryRing) => router.push({ pathname: '/story/[id]', params: { id: ring.author.id } });

  return (
    <FlatList
      horizontal
      inverted={d.rtl}
      showsHorizontalScrollIndicator={false}
      data={others}
      keyExtractor={(r) => r.author.id}
      contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12, gap: 8 }}
      ListHeaderComponent={
        <View style={{ flexDirection: d.rtl ? 'row-reverse' : 'row', gap: 8, marginHorizontal: 4 }}>
          <Pressable style={st.story} onPress={addStory} disabled={posting}>
            <Image source={profile?.photoURL ? { uri: profile.photoURL } : require('../../assets/logo-mark.png')} style={st.createImg} />
            <View style={st.createBottom}>
              <View style={st.plus}>{posting ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="add" size={24} color="#fff" />}</View>
              <Text style={st.createText} numberOfLines={1}>
                {posting ? t('story_posting') : t('create_story')}
              </Text>
            </View>
          </Pressable>
          {mine ? <StoryCard ring={mine} label={t('your_story')} onPress={() => open(mine)} /> : null}
        </View>
      }
      renderItem={({ item }) => <StoryCard ring={item} label={authorName(item.author)} onPress={() => open(item)} />}
    />
  );
}

function StoryCard({ ring, label, onPress }: { ring: StoryRing; label: string; onPress: () => void }) {
  const first = ring.stories.find((s) => !s.seen) ?? ring.stories[ring.stories.length - 1];
  return (
    <Pressable style={st.story} onPress={onPress}>
      {first.media_type === 'image' ? (
        <Image source={{ uri: storyUrl(first.media_path) }} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="play" size={30} color="#fff" />
        </View>
      )}
      <View style={st.storyShade} />
      <View style={[st.ring, { borderColor: ring.all_seen ? '#bbb' : colors.primary }]}>
        <Avatar uri={avatarUrl(ring.author.photo_path)} name={ring.author.first_name} size={34} />
      </View>
      <Text style={st.storyName} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ───────────────────────── People you may know ───────────────────────── */

const HIDDEN_KEY = 'fshow.hiddenSuggestions';

export function PeopleYouMayKnow() {
  const router = useRouter();
  const { t, d } = useI18n();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [people, setPeople] = useState<SuggestedPerson[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(HIDDEN_KEY)
      .then((v) => v && setHidden(new Set(JSON.parse(v) as string[])))
      .catch(() => {});
    stories.suggestions().then(setPeople).catch(() => {});
  }, []);

  function hide(id: string) {
    const next = new Set(hidden).add(id);
    setHidden(next);
    AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify([...next].slice(-300))).catch(() => {});
  }

  async function follow(p: SuggestedPerson) {
    const on = !followed.has(p.id);
    setFollowed((f) => {
      const n = new Set(f);
      if (on) n.add(p.id);
      else n.delete(p.id);
      return n;
    });
    try {
      await social.follow(p.id, on, me);
    } catch (e) {
      Alert.alert('', errorMessage(e));
    }
  }

  const list = people.filter((p) => !hidden.has(p.id));
  if (closed || list.length === 0) return null;

  return (
    <View style={st.section}>
      <View style={[st.sectionHead, { flexDirection: d.row }]}>
        <Ionicons name="people-outline" size={20} color={colors.text} />
        <Text style={[st.sectionTitle, { textAlign: d.align }]}>{t('people_you_may_know')}</Text>
        <Pressable onPress={() => setClosed(true)} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.muted} />
        </Pressable>
      </View>
      <FlatList
        horizontal
        inverted={d.rtl}
        showsHorizontalScrollIndicator={false}
        data={list}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 10, gap: 10 }}
        renderItem={({ item }) => {
          const isFollowed = followed.has(item.id);
          const photo = avatarUrl(item.photo_path);
          return (
            <View style={st.person}>
              <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })}>
                {photo ? (
                  <Image source={{ uri: photo }} style={st.personImg} />
                ) : (
                  <View style={[st.personImg, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }]}>
                    <Text style={{ color: '#fff', fontSize: 54, fontWeight: '800' }}>{item.first_name.charAt(0)}</Text>
                  </View>
                )}
              </Pressable>
              <View style={{ padding: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={st.personName} numberOfLines={1}>
                    {authorName(item)}
                  </Text>
                  {item.is_fainet ? <VerifiedBadge /> : null}
                </View>
                <Text style={st.personMeta} numberOfLines={1}>
                  {item.mutual > 0
                    ? t('mutual_n', { n: item.mutual })
                    : item.follows_me
                      ? t('follows_you')
                      : item.is_new
                        ? `🌱 ${t('new_to_app')}`
                        : `${formatCount(item.followers_count)} ${t('followers')}`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                  <Pressable onPress={() => follow(item)} style={[st.pBtn, { flex: 2 }, isFollowed ? st.pBtnLight : st.pBtnBlue]}>
                    <Text style={[st.pBtnText, isFollowed && { color: colors.primary }]}>
                      {isFollowed ? t('following_btn') : item.follows_me ? t('follow_back') : t('follow')}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => hide(item.id)} style={[st.pBtn, st.pBtnGrey, { flex: 1 }]}>
                    <Text style={[st.pBtnText, { color: colors.text }]}>{t('remove')}</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

/* ───────────────────────── Reels row ───────────────────────── */

export function ReelsRow() {
  const router = useRouter();
  const { t, d } = useI18n();
  const [reels, setReels] = useState<Post[]>([]);

  useEffect(() => {
    social
      .reels(0)
      .then((r) => setReels(r.slice(0, 8)))
      .catch(() => {});
  }, []);

  if (reels.length === 0) return null;
  return (
    <View style={st.section}>
      <View style={[st.sectionHead, { flexDirection: d.row }]}>
        <Ionicons name="play-circle-outline" size={20} color={colors.text} />
        <Text style={[st.sectionTitle, { textAlign: d.align }]}>{t('reels_title')}</Text>
        <Pressable onPress={() => router.push('/reels')} hitSlop={10}>
          <Ionicons name={d.rtl ? 'chevron-back' : 'chevron-forward'} size={22} color={colors.muted} />
        </Pressable>
      </View>
      <FlatList
        horizontal
        inverted={d.rtl}
        showsHorizontalScrollIndicator={false}
        data={reels}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 10, gap: 8 }}
        renderItem={({ item }) => <ReelTile post={item} onPress={() => router.push({ pathname: '/reels', params: { start: item.id } })} />}
      />
    </View>
  );
}

/** Small reel preview: muted, not playing — shows the first frame of the video. */
function ReelTile({ post, onPress }: { post: Post; onPress: () => void }) {
  const uri = videoUrl(post.video_path)!;
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
  });
  return (
    <Pressable style={st.reel} onPress={onPress}>
      <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="cover" pointerEvents="none" />
      <View style={st.storyShade} />
      <View style={st.reelViews}>
        <Ionicons name="play" size={14} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{formatCount(post.views_count)}</Text>
      </View>
      <View style={st.reelAvatar}>
        <Avatar uri={avatarUrl(post.author.photo_path)} name={post.author.first_name} size={28} />
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  composer: { alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  mind: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 16, paddingVertical: 10 },
  mindText: { color: colors.muted, fontSize: 15 },
  story: { width: 104, height: 170, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.bg },
  createImg: { width: '100%', height: 110 },
  createBottom: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8, backgroundColor: colors.card },
  plus: { position: 'absolute', top: -18, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  createText: { fontSize: 12, fontWeight: '700', color: colors.text },
  storyShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
  ring: { position: 'absolute', top: 8, left: 8, borderWidth: 3, borderRadius: 24, padding: 1 },
  storyName: { position: 'absolute', bottom: 8, left: 8, right: 8, color: '#fff', fontWeight: '700', fontSize: 12, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4 },
  section: { backgroundColor: colors.card, marginHorizontal: -8, marginBottom: 10, paddingBottom: 14 },
  sectionHead: { alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
  person: { width: 180, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden', backgroundColor: colors.card },
  personImg: { width: 180, height: 170 },
  personName: { fontSize: 15, fontWeight: '800', color: colors.text, flexShrink: 1 },
  personMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  pBtn: { borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  pBtnBlue: { backgroundColor: colors.primary },
  pBtnLight: { backgroundColor: colors.soft },
  pBtnGrey: { backgroundColor: colors.bg },
  pBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  reel: { width: 130, height: 220, borderRadius: 14, overflow: 'hidden', backgroundColor: '#111' },
  reelViews: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3 },
  reelAvatar: { position: 'absolute', top: 8, left: 8, borderWidth: 2, borderColor: colors.primary, borderRadius: 18 },
});
