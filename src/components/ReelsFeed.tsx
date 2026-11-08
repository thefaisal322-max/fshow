import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  LayoutChangeEvent,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { CommentsSheet } from '@/components/CommentsSheet';
import { DoubleTap, HeartBurst, HeartBurstHandle } from '@/components/Heart';
import { PostMenuSheet } from '@/components/PostMenuSheet';
import { ShareSheet } from '@/components/ShareSheet';
import { TagText } from '@/components/TagText';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { ReelVideo } from '@/components/Video';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { authorName, feelingLabel, formatCount, Post, social, videoUrl } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';

type Mode = 'foryou' | 'following';
const QUICK = ['🥰', '😁', '😂', '😳'];

/**
 * Full-screen vertical video feed (like TikTok), swipe up for the next reel.
 *  • Reels tab: Following / For You
 *  • One person's reels (from their profile): pass userId (+ startId of the tapped reel)
 */
export function ReelsFeed({ userId, startId, title }: { userId?: string; startId?: string; title?: string }) {
  const router = useRouter();
  const { t, d } = useI18n();
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const insets = useSafeAreaInsets();
  const start = startId;
  const list = useRef<FlatList<Post>>(null);
  const [mode, setMode] = useState<Mode>('foryou');
  const [reels, setReels] = useState<Post[]>([]);
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(true);
  const busy = useRef(false);
  const viewed = useRef(new Set<string>());
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(
    async (reset: boolean, m: Mode) => {
      if (busy.current && !reset) return;
      busy.current = true;
      try {
        const offset = reset ? 0 : reels.length;
        const page = userId ? await social.userPosts(userId, offset, 'reels', 10) : await social.reels(offset, m);
        setReels((old) => (reset ? page : [...old, ...page.filter((p) => !old.some((o) => o.id === p.id))]));
        setMore(page.length >= 10);
        if (reset) {
          setActive(0);
          list.current?.scrollToOffset({ offset: 0, animated: false });
        }
      } catch (e) {
        Alert.alert('', errorMessage(e));
      } finally {
        busy.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [reels.length, userId],
  );

  useEffect(() => {
    setLoading(true);
    load(true, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Opened from the Home reels row: jump to that reel.
  useEffect(() => {
    if (!start || !reels.length || !height) return;
    const i = reels.findIndex((r) => r.id === start);
    if (i >= 0) {
      list.current?.scrollToIndex({ index: i, animated: false });
      setActive(i);
    } else {
      social
        .post(start)
        .then((p) => {
          if (p?.video_path) {
            setReels((old) => [p, ...old.filter((o) => o.id !== p.id)]);
            list.current?.scrollToOffset({ offset: 0, animated: false });
            setActive(0);
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Small message in the middle of the screen ("Sent", "Saved" …)
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(timer);
  }, [toast]);

  const update = useCallback((p: Post) => setReels((old) => old.map((x) => (x.id === p.id ? p : x))), []);
  const remove = useCallback((id: string) => setReels((old) => old.filter((x) => x.id !== id)), []);
  const followAuthor = useCallback((authorId: string, on: boolean) => {
    setReels((old) => old.map((x) => (x.author.id === authorId ? { ...x, following: on } : x)));
  }, []);

  const tabs: { key: Mode; label: string }[] = [
    { key: 'following', label: t('following') },
    { key: 'foryou', label: t('for_you') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }} onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}>
      {loading || !height ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 120 }} />
      ) : reels.length === 0 ? (
        <View style={{ alignItems: 'center', marginTop: 140, gap: 16, paddingHorizontal: 30 }}>
          <Ionicons name={mode === 'following' ? 'people-outline' : 'film-outline'} size={56} color="#777" />
          <Text style={st.empty}>{mode === 'following' ? t('no_following_reels') : t('no_reels')}</Text>
          <Pressable onPress={() => router.push('/create')} style={st.emptyBtn}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{t('upload_reel')}</Text>
          </Pressable>
        </View>
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
          onEndReached={() => more && load(false, mode)}
          onEndReachedThreshold={2}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                viewed.current.clear();
                load(true, mode);
              }}
              tintColor="#fff"
              progressViewOffset={insets.top + 50}
            />
          }
          renderItem={({ item, index }) => (
            <Reel
              post={item}
              height={height}
              active={focused && index === active}
              topInset={insets.top}
              onChange={update}
              onRemoved={remove}
              onFollow={followAuthor}
              toast={setToast}
            />
          )}
        />
      )}

      {/* top bar: Following | For You, search, upload — or ← name for one person's reels */}
      {userId ? (
        <View style={[st.top, { top: insets.top + 4, flexDirection: d.row }]} pointerEvents="box-none">
          <Pressable onPress={() => router.back()} hitSlop={10} style={st.topIcon}>
            <Ionicons name={d.rtl ? 'arrow-forward' : 'arrow-back'} size={28} color="#fff" style={st.shadow} />
          </Pressable>
          <Text style={[st.tab, st.tabOn, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>
            {title ?? t('tab_reels')}
          </Text>
          <View style={st.topIcon} />
        </View>
      ) : (
      <View style={[st.top, { top: insets.top + 4, flexDirection: d.row }]} pointerEvents="box-none">
        <Pressable onPress={() => router.push('/create')} hitSlop={10} style={st.topIcon}>
          <Ionicons name="add-circle-outline" size={28} color="#fff" style={st.shadow} />
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 18 }}>
          {tabs.map((x) => (
            <Pressable key={x.key} onPress={() => setMode(x.key)} hitSlop={8} style={{ alignItems: 'center' }}>
              <Text style={[st.tab, mode === x.key && st.tabOn]}>{x.label}</Text>
              {mode === x.key ? <View style={st.tabLine} /> : null}
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => router.push('/search')} hitSlop={10} style={st.topIcon}>
          <Ionicons name="search" size={26} color="#fff" style={st.shadow} />
        </Pressable>
      </View>
      )}

      {toast ? (
        <View pointerEvents="none" style={st.toastWrap}>
          <Text style={st.toast}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Reel({
  post,
  height,
  active,
  topInset,
  onChange,
  onRemoved,
  onFollow,
  toast,
}: {
  post: Post;
  height: number;
  active: boolean;
  topInset: number;
  onChange: (p: Post) => void;
  onRemoved: (id: string) => void;
  onFollow: (authorId: string, on: boolean) => void;
  toast: (s: string) => void;
}) {
  const router = useRouter();
  const { t, d } = useI18n();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const mine = post.author.id === me;
  const [paused, setPaused] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [quick, setQuick] = useState(false);
  const [quickUsed, setQuickUsed] = useState(false);
  const heart = useRef<HeartBurstHandle>(null);
  const uri = videoUrl(post.video_path)!;
  const feeling = feelingLabel(post.feeling);

  useEffect(() => {
    if (!active) {
      setPaused(false);
      setQuick(false);
      return;
    }
    // the quick emoji bar shows up after a few seconds of watching (like TikTok)
    if (quickUsed) return;
    const timer = setTimeout(() => setQuick(true), 3500);
    return () => clearTimeout(timer);
  }, [active, quickUsed]);

  async function like(forceOn?: boolean) {
    const on = forceOn ?? !post.liked;
    if (on === post.liked) return;
    onChange({ ...post, liked: on, likes_count: Math.max(0, post.likes_count + (on ? 1 : -1)) });
    if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await social.like(post.id, on);
    } catch (e) {
      onChange(post);
      Alert.alert('', errorMessage(e));
    }
  }

  async function save() {
    const on = !post.saved;
    onChange({ ...post, saved: on, saves_count: Math.max(0, post.saves_count + (on ? 1 : -1)) });
    Haptics.selectionAsync().catch(() => {});
    try {
      await social.save(post.id, on, me);
      if (on) toast(t('saved_toast'));
    } catch (e) {
      onChange(post);
      Alert.alert('', errorMessage(e));
    }
  }

  async function follow() {
    onFollow(post.author.id, true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await social.follow(post.author.id, true, me);
    } catch (e) {
      onFollow(post.author.id, false);
      Alert.alert('', errorMessage(e));
    }
  }

  async function quickComment(emoji: string) {
    setQuick(false);
    setQuickUsed(true);
    onChange({ ...post, comments_count: post.comments_count + 1 });
    Haptics.selectionAsync().catch(() => {});
    try {
      await social.comment(post.id, emoji);
      toast(`${emoji}  ${t('comment_sent')}`);
    } catch (e) {
      onChange(post);
      Alert.alert('', errorMessage(e));
    }
  }

  const side = d.rtl ? { left: 8 } : { right: 8 };
  const longCaption = post.body.length > 90 || post.body.split('\n').length > 2;

  return (
    <View style={{ height, backgroundColor: '#000' }}>
      {/* one tap = pause / play, quick taps = ❤️ where you tapped, long press = menu */}
      <DoubleTap
        style={StyleSheet.absoluteFill}
        onSingle={() => setPaused((p) => !p)}
        onDouble={(x, y) => {
          heart.current?.burst(x, y);
          like(true);
        }}
        onLong={() => setMenu(true)}
      >
        <ReelVideo uri={uri} active={active} paused={paused} style={StyleSheet.absoluteFill} bottomBar={0} />
        {paused ? (
          <View style={st.pause} pointerEvents="none">
            <Ionicons name="play" size={70} color="rgba(255,255,255,0.8)" />
          </View>
        ) : null}
        <HeartBurst ref={heart} size={110} />
      </DoubleTap>

      {/* right side buttons (left side in Pashto / Dari) */}
      <View style={[st.side, side]}>
        <View style={{ marginBottom: 22, alignItems: 'center' }}>
          <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: post.author.id } })} style={st.avatarRing}>
            <Avatar uri={avatarUrl(post.author.photo_path)} name={post.author.first_name} size={48} />
          </Pressable>
          {!mine && !post.following ? (
            <Pressable onPress={follow} style={st.plus} hitSlop={8}>
              <Ionicons name="add" size={16} color="#fff" />
            </Pressable>
          ) : null}
        </View>
        <SideBtn icon="heart" color={post.liked ? '#FE2C55' : '#fff'} label={formatCount(post.likes_count)} onPress={() => like()} />
        <SideBtn icon="chatbubble-ellipses" label={formatCount(post.comments_count)} onPress={() => setSheet(true)} />
        <SideBtn icon="bookmark" color={post.saved ? '#FACE15' : '#fff'} label={formatCount(post.saves_count)} onPress={save} />
        <SideBtn icon="arrow-redo" label={formatCount(post.shares_count)} onPress={() => setShareOpen(true)} />
        <SideBtn icon="ellipsis-horizontal" label="" onPress={() => setMenu(true)} />
        <Disc uri={avatarUrl(post.author.photo_path)} name={post.author.first_name} spinning={active && !paused} />
      </View>

      {/* TikTok-style quick emoji comments */}
      {quick ? (
        <View style={[st.quick, { flexDirection: d.row }, d.rtl ? { right: 12 } : { left: 12 }]}>
          {QUICK.map((e) => (
            <Pressable key={e} onPress={() => quickComment(e)} hitSlop={4} style={({ pressed }) => [pressed && { transform: [{ scale: 1.25 }] }]}>
              <Text style={{ fontSize: 30 }}>{e}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => { setQuick(false); setQuickUsed(true); }} hitSlop={8}>
            <Ionicons name="close" size={16} color="#bbb" />
          </Pressable>
        </View>
      ) : null}

      <View style={[st.info, d.rtl ? { right: 12, left: 80 } : { left: 12, right: 80 }]}>
        <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: post.author.id } })} style={{ flexDirection: d.row, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text style={[st.name, st.shadow]}>{authorName(post.author)}</Text>
          {post.author.is_fainet ? <VerifiedBadge size={15} /> : null}
          {post.author.username ? <Text style={[st.user, st.shadow]}> @{post.author.username}</Text> : null}
        </Pressable>
        {post.body ? (
          <Pressable onPress={() => longCaption && setExpanded((x) => !x)}>
            <TagText
              text={post.body}
              tagColor="#fff"
              numberOfLines={expanded ? 12 : 2}
              style={[st.caption, st.shadow, { textAlign: d.align, writingDirection: d.writing }]}
            />
            {longCaption ? <Text style={[st.more, { textAlign: d.align }]}>{expanded ? t('less') : t('more')}</Text> : null}
          </Pressable>
        ) : null}
        {feeling || post.location || (post.visibility && post.visibility !== 'public') ? (
          <Text style={[st.user, st.shadow, { textAlign: d.align, marginTop: 4 }]}>
            {[
              post.visibility === 'private' ? `🔒 ${t('vis_private')}` : post.visibility === 'friends' ? `👥 ${t('vis_friends')}` : null,
              feeling,
              post.location ? `📍 ${post.location}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
        <View style={{ flexDirection: d.row, alignItems: 'center', gap: 6, marginTop: 6 }}>
          <Ionicons name="musical-notes" size={14} color="#fff" />
          <Text style={[st.user, st.shadow]} numberOfLines={1}>
            {t('original_sound')} · {authorName(post.author)}
          </Text>
        </View>
      </View>

      {menu ? <PostMenuSheet post={post} onClose={() => setMenu(false)} onChange={onChange} onRemoved={onRemoved} /> : null}
      {shareOpen ? (
        <ShareSheet post={post} onClose={() => setShareOpen(false)} onShared={() => onChange({ ...post, shares_count: post.shares_count + 1 })} />
      ) : null}
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

/** Spinning record with the author's photo (like TikTok's sound disc). */
function Disc({ uri, name, spinning }: { uri: string | null; name: string; spinning: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!spinning) {
      spin.stopAnimation();
      return;
    }
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }));
    spin.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [spinning, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={[st.disc, { transform: [{ rotate }] }]}>
      <Avatar uri={uri} name={name} size={26} />
    </Animated.View>
  );
}

function SideBtn({ icon, label, onPress, color = '#fff' }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ alignItems: 'center', marginBottom: 16 }, pressed && { transform: [{ scale: 0.9 }] }]} hitSlop={6}>
      <Ionicons name={icon} size={34} color={color} style={st.shadow} />
      {label ? <Text style={[st.sideText, st.shadow]}>{label}</Text> : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  empty: { color: '#ddd', textAlign: 'center', lineHeight: 24, fontSize: 15 },
  emptyBtn: { backgroundColor: '#FE2C55', borderRadius: 24, paddingHorizontal: 24, paddingVertical: 11 },
  pause: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 12 },
  topIcon: { width: 36, alignItems: 'center' },
  tab: { color: 'rgba(255,255,255,0.65)', fontSize: 17, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  tabOn: { color: '#fff', fontWeight: '900' },
  tabLine: { width: 26, height: 3, borderRadius: 2, backgroundColor: '#fff', marginTop: 4 },
  side: { position: 'absolute', bottom: 18, alignItems: 'center' },
  avatarRing: { borderWidth: 2, borderColor: '#fff', borderRadius: 30, padding: 1 },
  plus: { position: 'absolute', bottom: -10, width: 22, height: 22, borderRadius: 11, backgroundColor: '#FE2C55', alignItems: 'center', justifyContent: 'center' },
  sideText: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 2 },
  disc: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#222', borderWidth: 7, borderColor: '#333', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  quick: { position: 'absolute', bottom: 150, alignItems: 'center', gap: 14, backgroundColor: 'rgba(30,30,30,0.85)', borderRadius: 30, paddingHorizontal: 16, paddingVertical: 8 },
  info: { position: 'absolute', bottom: 18 },
  name: { color: '#fff', fontSize: 16, fontWeight: '800' },
  user: { color: '#eee', fontSize: 13 },
  caption: { color: '#fff', fontSize: 15, marginTop: 6, lineHeight: 22 },
  more: { color: '#fff', fontWeight: '800', fontSize: 14, marginTop: 2 },
  toastWrap: { position: 'absolute', top: '45%', left: 0, right: 0, alignItems: 'center' },
  toast: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, fontWeight: '700', overflow: 'hidden' },
  shadow: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
});
