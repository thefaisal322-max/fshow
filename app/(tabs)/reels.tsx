import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, LayoutChangeEvent, Pressable, StyleSheet, Text, View, ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { CommentsSheet } from '@/components/CommentsSheet';
import { postMenu, VerifiedBadge } from '@/components/PostCard';
import { ReelVideo } from '@/components/Video';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { authorName, feelingLabel, formatCount, Post, social, videoUrl } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { colors } from '@/theme';

/** Full-screen vertical video feed (like TikTok). Swipe up for the next reel. */
export default function Reels() {
  const { t } = useI18n();
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const insets = useSafeAreaInsets();
  const { start } = useLocalSearchParams<{ start?: string }>();
  const list = useRef<FlatList<Post>>(null);
  const [reels, setReels] = useState<Post[]>([]);
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(true);
  const busy = useRef(false);
  const viewed = useRef(new Set<string>());

  const load = useCallback(async (reset: boolean) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const page = await social.reels(reset ? 0 : reels.length);
      setReels((old) => (reset ? page : [...old, ...page.filter((p) => !old.some((o) => o.id === p.id))]));
      setMore(page.length >= 10);
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [reels.length]);

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opened from the Home reels row: jump to that reel.
  useEffect(() => {
    if (!start || !reels.length || !height) return;
    const i = reels.findIndex((r) => r.id === start);
    if (i >= 0) {
      list.current?.scrollToIndex({ index: i, animated: false });
      setActive(i);
    } else {
      social.post(start).then((p) => {
        if (p?.video_path) {
          setReels((old) => [p, ...old.filter((o) => o.id !== p.id)]);
          list.current?.scrollToOffset({ offset: 0, animated: false });
          setActive(0);
        }
      }).catch(() => {});
    }
  }, [start, reels.length > 0, height]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const v = viewableItems.find((x) => x.isViewable);
    if (v?.index != null) setActive(v.index);
  }).current;

  // Count a view after 2 seconds on the same reel.
  useEffect(() => {
    const p = reels[active];
    if (!p || !focused || viewed.current.has(p.id)) return;
    const timer = setTimeout(() => {
      viewed.current.add(p.id);
      social.view(p.id).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [active, reels, focused]);

  const update = useCallback((p: Post) => setReels((old) => old.map((x) => (x.id === p.id ? p : x))), []);
  const remove = useCallback((id: string) => setReels((old) => old.filter((x) => x.id !== id)), []);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}>
      {loading || !height ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 80 }} />
      ) : reels.length === 0 ? (
        <Text style={st.empty}>{t('no_reels')}</Text>
      ) : (
        <FlatList
          ref={list}
          data={reels}
          keyExtractor={(p) => p.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
          onEndReached={() => more && load(false)}
          onEndReachedThreshold={2}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          renderItem={({ item, index }) => (
            <Reel post={item} height={height} active={focused && index === active} topInset={insets.top} onChange={update} onDeleted={remove} />
          )}
        />
      )}
    </View>
  );
}

function Reel({ post, height, active, topInset, onChange, onDeleted }: { post: Post; height: number; active: boolean; topInset: number; onChange: (p: Post) => void; onDeleted: (id: string) => void }) {
  const router = useRouter();
  const { t, d } = useI18n();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [paused, setPaused] = useState(false);
  const [sheet, setSheet] = useState(false);
  const uri = videoUrl(post.video_path)!;
  const feeling = feelingLabel(post.feeling);

  async function like() {
    const on = !post.liked;
    onChange({ ...post, liked: on, likes_count: Math.max(0, post.likes_count + (on ? 1 : -1)) });
    try {
      await social.like(post.id, on);
    } catch (e) {
      onChange(post);
      Alert.alert('', errorMessage(e));
    }
  }

  return (
    <View style={{ height, backgroundColor: '#000' }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setPaused((p) => !p)}>
        <ReelVideo uri={uri} active={active} paused={paused} style={StyleSheet.absoluteFill} />
        {paused ? (
          <View style={st.pause}>
            <Ionicons name="play" size={64} color="rgba(255,255,255,0.85)" />
          </View>
        ) : null}
      </Pressable>

      <Text style={[st.brand, { top: topInset + 8 }]}>Reels</Text>

      {/* right side buttons (left side in English) */}
      <View style={[st.side, d.rtl ? { left: 10 } : { right: 10 }]}>
        <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: post.author.id } })} style={{ marginBottom: 14 }}>
          <Avatar uri={avatarUrl(post.author.photo_path)} name={post.author.first_name} size={46} />
        </Pressable>
        <SideBtn icon={post.liked ? 'heart' : 'heart-outline'} color={post.liked ? colors.error : '#fff'} label={formatCount(post.likes_count)} onPress={like} />
        <SideBtn icon="chatbubble-ellipses" label={formatCount(post.comments_count)} onPress={() => setSheet(true)} />
        <SideBtn icon="arrow-redo" label={formatCount(post.shares_count)} onPress={() => social.share(post).catch(() => {})} />
        <SideBtn icon="eye" label={formatCount(post.views_count)} />
        <SideBtn icon="ellipsis-horizontal" label="" onPress={() => postMenu(post, me, t, onDeleted)} />
      </View>

      <View style={[st.info, d.rtl ? { right: 12, left: 76 } : { left: 12, right: 76 }]}>
        <View style={{ flexDirection: d.row, alignItems: 'center' }}>
          <Text style={st.name}>{authorName(post.author)}</Text>
          {post.author.is_fainet ? <VerifiedBadge size={15} /> : null}
          {post.author.username ? <Text style={st.user}> @{post.author.username}</Text> : null}
        </View>
        {post.body ? (
          <Text style={[st.caption, { textAlign: d.align }]} numberOfLines={3}>
            {post.body}
          </Text>
        ) : null}
        {feeling || post.location ? (
          <Text style={[st.user, { textAlign: d.align, marginTop: 4 }]}>
            {[feeling, post.location ? `📍 ${post.location}` : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      {sheet ? (
        <CommentsSheet
          postId={post.id}
          onClose={() => setSheet(false)}
          onCount={(n) => n !== post.comments_count && onChange({ ...post, comments_count: n })}
        />
      ) : null}
    </View>
  );
}

function SideBtn({ icon, label, onPress, color = '#fff' }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', marginBottom: 16 }} hitSlop={6}>
      <Ionicons name={icon} size={32} color={color} style={st.shadow} />
      {label ? <Text style={[st.sideText, st.shadow]}>{label}</Text> : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  empty: { color: '#fff', textAlign: 'center', marginTop: 120, paddingHorizontal: 30, lineHeight: 24 },
  pause: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  brand: { position: 'absolute', alignSelf: 'center', color: '#fff', fontSize: 20, fontWeight: '800' },
  side: { position: 'absolute', bottom: 90, alignItems: 'center' },
  sideText: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 2 },
  info: { position: 'absolute', bottom: 24 },
  name: { color: '#fff', fontSize: 16, fontWeight: '800' },
  user: { color: '#eee', fontSize: 13 },
  caption: { color: '#fff', fontSize: 15, marginTop: 6, lineHeight: 22 },
  shadow: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
});
