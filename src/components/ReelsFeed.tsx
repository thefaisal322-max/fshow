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
  useWindowDimensions,
  View,
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { CommentsSheet } from '@/components/CommentsSheet';
import { DoubleTap, HeartBurst, HeartBurstHandle } from '@/components/Heart';
import { OfflineBanner } from '@/components/OfflineBanner';
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
const QUICK = ['🥰', '😂', '😏', '😁'];

/**
 * Full-screen vertical video feed (like TikTok), swipe up for the next reel.
 *  • Reels tab: Following / For You
 *  • One person's reels (from their profile): pass userId (+ startId of the tapped reel)
 */
export function ReelsFeed({ userId, query, startId, title }: { userId?: string; query?: string; startId?: string; title?: string }) {
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
        const page = userId
          ? await social.userPosts(userId, offset, 'reels', 10)
          : query
            ? await social.searchPosts(query, 'reels', offset, 10)
            : await social.reels(offset, m);
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
    [reels.length, userId, query],
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
      {userId || query ? (
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

      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 52 }}>
        <OfflineBanner dark />
      </View>

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
  const { width } = useWindowDimensions();
  const me = session?.user.id ?? '';
  const mine = post.author.id === me;
  const [paused, setPaused] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [quick, setQuick] = useState(false);
  const [quickUsed, setQuickUsed] = useState(false);
  const [commentEmoji, setCommentEmoji] = useState<string | null>(null);
  const [repostedId, setRepostedId] = useState<string | null>(null);
  const [savedBar, setSavedBar] = useState(0);
  const [sideY, setSideY] = useState(0);
  const [commentY, setCommentY] = useState(0);
  const dim = useRef(new Animated.Value(0)).current;
  const heart = useRef<HeartBurstHandle>(null);
  const uri = videoUrl(post.video_path)!;
  const feeling = feelingLabel(post.feeling);

  useEffect(() => {
    if (!active) {
      setPaused(false);
      setQuick(false);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    // after a few seconds the video dims for a moment and the emoji bar pops up at 💬 (like TikTok)
    if (!quickUsed && !commentEmoji) timers.push(setTimeout(() => setQuick(true), 4000));
    return () => timers.forEach(clearTimeout);
  }, [active, quickUsed, commentEmoji]);

  useEffect(() => {
    if (!quick) return;
    Animated.sequence([
      Animated.timing(dim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(dim, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
    // nobody tapped → it goes away on its own
    const timer = setTimeout(() => setQuick(false), 7000);
    return () => clearTimeout(timer);
  }, [quick, dim]);

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
    if (on) setSavedBar((n) => n + 1);
    else setSavedBar(0);
    try {
      await social.save(post.id, on, me);
    } catch (e) {
      setSavedBar(0);
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
    setCommentEmoji(emoji); // the 💬 icon becomes this emoji
    onChange({ ...post, comments_count: post.comments_count + 1 });
    Haptics.selectionAsync().catch(() => {});
    try {
      await social.comment(post.id, emoji);
    } catch (e) {
      setCommentEmoji(null);
      onChange(post);
      Alert.alert('', errorMessage(e));
    }
  }

  async function repost() {
    if (repostedId) return;
    setRepostedId('…');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onChange({ ...post, shares_count: post.shares_count + 1 });
    try {
      setRepostedId(await social.repost(post.id));
      toast(`🔁 ${t('reposted')}`);
    } catch (e) {
      setRepostedId(null);
      onChange(post);
      Alert.alert('', errorMessage(e));
    }
  }

  const side = d.rtl ? { left: 8 } : { right: 8 };
  // side column is ~54 wide, so its middle is 35 from the edge
  const sideCenterX = d.rtl ? 35 : width - 35;
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

      {/* the whole video dims for a moment when the emoji bar shows up */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: dim }]} />

      {/* right side buttons (left side in Pashto / Dari) */}
      <View style={[st.side, side]} onLayout={(e) => setSideY(e.nativeEvent.layout.y)}>
        <View style={{ marginBottom: 22, alignItems: 'center' }}>
          <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: post.author.id } })} style={st.avatarRing}>
            <Avatar uri={avatarUrl(post.author.photo_path)} name={post.author.first_name} size={48} />
          </Pressable>
          {!mine ? <FollowBadge following={!!post.following} onFollow={follow} /> : null}
        </View>
        <View>
          {/* tap = like · hold 5 s = repost */}
          <SideBtn
            icon="heart"
            color={post.liked ? '#FE2C55' : '#fff'}
            label={formatCount(post.likes_count)}
            onPress={() => like()}
            onHold={mine ? undefined : repost}
          />
        </View>
        <View onLayout={(e) => setCommentY(e.nativeEvent.layout.y)}>
          {commentEmoji ? (
            <CommentEmojiBtn emoji={commentEmoji} label={formatCount(post.comments_count)} onPress={() => setSheet(true)} />
          ) : (
            <SideBtn icon="chatbubble-ellipses" label={formatCount(post.comments_count)} onPress={() => setSheet(true)} />
          )}
        </View>
        <SideBtn icon="bookmark" color={post.saved ? '#FACE15' : '#fff'} pop={!!post.saved} label={formatCount(post.saves_count)} onPress={save} />
        <SideBtn icon="arrow-redo" label={formatCount(post.shares_count)} onPress={() => setShareOpen(true)} />
        <SideBtn icon="ellipsis-horizontal" label="" onPress={() => setMenu(true)} />
        <Disc uri={avatarUrl(post.author.photo_path)} name={post.author.first_name} spinning={active && !paused} />
      </View>

      {/* TikTok quick emoji comments: a pill in the middle at the 💬 height */}
      {quick && sideY > 0 ? (
        <QuickEmojiBar
          top={sideY + commentY + 17 - 30}
          width={width}
          targetX={sideCenterX}
          onPick={quickComment}
        />
      ) : null}

      <View style={[st.info, d.rtl ? { right: 12, left: 80 } : { left: 12, right: 80 }]}>
        {savedBar ? (
          <SavedBar
            key={savedBar}
            rtl={d.rtl}
            onView={() => {
              setSavedBar(0);
              router.navigate({ pathname: '/profile', params: { tab: 'saved', at: String(Date.now()) } });
            }}
            onDone={() => setSavedBar(0)}
          />
        ) : null}
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

const CELL = 52;

/**
 * Glass pill with 🥰😂😏😁 in the middle of the screen. The emojis pop in one by one and gently bob.
 * Tap one → a ring flashes, the others fade, and it flies into the 💬 button.
 */
function QuickEmojiBar({ top, width, targetX, onPick }: { top: number; width: number; targetX: number; onPick: (e: string) => void }) {
  const show = useRef(new Animated.Value(0)).current;
  const rest = useRef(new Animated.Value(1)).current;
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    Animated.spring(show, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }).start();
  }, [show]);

  function pick(i: number) {
    if (picked !== null) return;
    setPicked(i);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.timing(rest, { toValue: 0, duration: 180, useNativeDriver: true }).start();
  }

  const scale = show.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const translateY = show.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top, left: 0, right: 0, alignItems: 'center' }}>
      <Animated.View style={[st.quickBg, { opacity: Animated.multiply(show, rest), transform: [{ translateY }, { scaleX: scale }] }]} />
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateY }] }}>
        {QUICK.map((e, i) => (
          <QuickEmoji
            key={e}
            emoji={e}
            index={i}
            picked={picked}
            rest={rest}
            dx={targetX - (width / 2 + (i - 1.5) * CELL)}
            onPress={() => pick(i)}
            onLanded={() => onPick(e)}
          />
        ))}
      </Animated.View>
    </View>
  );
}

function QuickEmoji({
  emoji,
  index,
  picked,
  rest,
  dx,
  onPress,
  onLanded,
}: {
  emoji: string;
  index: number;
  picked: number | null;
  rest: Animated.Value;
  dx: number;
  onPress: () => void;
  onLanded: () => void;
}) {
  const enter = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const fly = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const one = useRef(new Animated.Value(1)).current;
  const isPicked = picked === index;

  useEffect(() => {
    // pop in one after another, then a soft wave
    Animated.sequence([
      Animated.delay(80 + index * 70),
      Animated.spring(enter, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
    ]).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(index * 140),
        Animated.timing(bob, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.delay((3 - index) * 140 + 900),
      ]),
    );
    const t = setTimeout(() => loop.start(), 700);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [enter, bob, index]);

  useEffect(() => {
    if (!isPicked) return;
    bob.stopAnimation();
    Animated.sequence([
      Animated.parallel([
        Animated.spring(pop, { toValue: 1.7, friction: 4, tension: 170, useNativeDriver: true }),
        Animated.timing(ring, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.timing(fly, { toValue: 1, duration: 430, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => onLanded());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPicked]);

  const enterScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const bobY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(press, { toValue: 1.3, friction: 5, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, friction: 5, useNativeDriver: true }).start()}
      hitSlop={4}
      style={{ width: CELL, height: 60, alignItems: 'center', justifyContent: 'center' }}
    >
      {isPicked ? (
        <Animated.View
          pointerEvents="none"
          style={[
            st.quickRing,
            {
              opacity: ring.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }),
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.8] }) }],
            },
          ]}
        />
      ) : null}
      <Animated.Text
        style={{
          fontSize: 32,
          opacity: isPicked ? fly.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }) : picked === null ? enter : rest,
          transform: [
            { translateX: isPicked ? fly.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) : 0 },
            { translateY: isPicked ? fly.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -46, 0] }) : bobY },
            { scale: Animated.multiply(Animated.multiply(enterScale, press), isPicked ? Animated.multiply(pop, fly.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] })) : one) },
            { rotate: isPicked ? fly.interpolate({ inputRange: [0, 1], outputRange: ['0deg', dx > 0 ? '25deg' : '-25deg'] }) : '0deg' },
          ],
        }}
      >
        {emoji}
      </Animated.Text>
    </Pressable>
  );
}

/** 💬 replaced by the emoji you sent — it lands with a little bounce. */
function CommentEmojiBtn({ emoji, label, onPress }: { emoji: string; label: string; onPress: () => void }) {
  const s = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(s, { toValue: 1, friction: 3, tension: 140, useNativeDriver: true }).start();
  }, [s, emoji]);
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', marginBottom: 16 }} hitSlop={6}>
      <Animated.Text style={{ fontSize: 31, transform: [{ scale: s }] }}>{emoji}</Animated.Text>
      <Text style={[st.sideText, st.shadow]}>{label}</Text>
    </Pressable>
  );
}

/** Dark bar above the name: (✓) Saved ............ View > */
function SavedBar({ rtl, onView, onDone }: { rtl: boolean; onView: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const a = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.delay(2800),
      Animated.timing(a, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => finished && done.current());
    return () => anim.stop();
  }, [a]);
  return (
    <Animated.View
      style={[
        st.savedBar,
        rtl ? { left: -68, right: 0 } : { left: 0, right: -68 },
        { flexDirection: rtl ? 'row-reverse' : 'row', opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
      ]}
    >
      <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="checkmark-circle" size={22} color="#fff" />
        <Text style={st.savedText}>{t('saved_word')}</Text>
      </View>
      <Pressable onPress={onView} hitSlop={10} style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 2 }}>
        <Text style={st.savedView}>{t('view_word')}</Text>
        <Ionicons name={rtl ? 'chevron-back' : 'chevron-forward'} size={16} color="#4FA3FF" />
      </Pressable>
    </Animated.View>
  );
}

/**
 * TikTok-style follow shortcut on the avatar: red ➕ → tap → it spins into a white ✓,
 * stays a moment, then shrinks away.
 */
function FollowBadge({ following, onFollow }: { following: boolean; onFollow: () => void }) {
  const [state, setState] = useState<'plus' | 'check' | 'gone'>(following ? 'gone' : 'plus');
  const spin = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // followed somewhere else (or the same person's other reel) → no ➕
    if (following && state === 'plus') setState('gone');
    if (!following && state === 'gone') {
      spin.setValue(0);
      scale.setValue(1);
      setState('plus');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following]);

  function tap() {
    if (state !== 'plus') return;
    setState('check');
    onFollow();
    Animated.sequence([
      Animated.parallel([
        Animated.timing(spin, { toValue: 1, duration: 350, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.35, duration: 170, useNativeDriver: true }),
          Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
        ]),
      ]),
      Animated.delay(900),
      Animated.timing(scale, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => setState('gone'));
  }

  if (state === 'gone') return null;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const check = state === 'check';
  return (
    <Pressable onPress={tap} hitSlop={10} style={st.plusWrap}>
      <Animated.View style={[st.plus, check && st.plusDone, { transform: [{ rotate }, { scale }] }]}>
        <Ionicons name={check ? 'checkmark' : 'add'} size={check ? 15 : 16} color={check ? '#FE2C55' : '#fff'} />
      </Animated.View>
    </Pressable>
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

/** Side button. With onHold: keep pressing 5 s → onHold (the icon grows while you hold, the phone ticks each second). */
function SideBtn({
  icon,
  label,
  onPress,
  onHold,
  pop,
  color = '#fff',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  onHold?: () => void;
  /** turns true → the icon bounces (like TikTok's yellow bookmark) */
  pop?: boolean;
  color?: string;
}) {
  const grow = useRef(new Animated.Value(1)).current;
  const bounce = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!pop) return;
    bounce.setValue(0.6);
    Animated.spring(bounce, { toValue: 1, friction: 3, tension: 160, useNativeDriver: true }).start();
  }, [pop, bounce]);
  const ticks = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stop = () => {
    ticks.current.forEach(clearTimeout);
    ticks.current = [];
    grow.stopAnimation();
    Animated.spring(grow, { toValue: 1, useNativeDriver: true }).start();
  };
  return (
    <Pressable
      onPress={onPress}
      onLongPress={
        onHold
          ? () => {
              stop();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              onHold();
            }
          : undefined
      }
      delayLongPress={onHold ? 5000 : undefined}
      onPressIn={() => {
        if (!onHold) return;
        ticks.current = [1, 2, 3, 4].map((n) => setTimeout(() => Haptics.selectionAsync().catch(() => {}), n * 1000));
        Animated.timing(grow, { toValue: 1.5, duration: 5000, easing: Easing.linear, useNativeDriver: true }).start();
      }}
      onPressOut={onHold ? stop : undefined}
      style={({ pressed }) => [{ alignItems: 'center', marginBottom: 16 }, pressed && !onHold && { transform: [{ scale: 0.9 }] }]}
      hitSlop={6}
    >
      <Animated.View style={{ transform: [{ scale: Animated.multiply(grow, bounce) }] }}>
        <Ionicons name={icon} size={34} color={color} style={st.shadow} />
      </Animated.View>
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
  plusWrap: { position: 'absolute', bottom: -10 },
  plus: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FE2C55', alignItems: 'center', justifyContent: 'center' },
  plusDone: { backgroundColor: '#fff' },
  sideText: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 2 },
  disc: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#222', borderWidth: 7, borderColor: '#333', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  quickBg: {
    position: 'absolute',
    top: 0,
    width: 4 * 52 + 22,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(28,28,30,0.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  quickRing: { position: 'absolute', width: 46, height: 46, borderRadius: 23, borderWidth: 2.5, borderColor: '#fff' },
  savedBar: { position: 'absolute', bottom: '100%', marginBottom: 12, alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(40,40,40,0.95)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11 },
  savedText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  savedView: { color: '#4FA3FF', fontSize: 15, fontWeight: '700' },
  info: { position: 'absolute', bottom: 18 },
  name: { color: '#fff', fontSize: 16, fontWeight: '800' },
  user: { color: '#eee', fontSize: 13 },
  caption: { color: '#fff', fontSize: 15, marginTop: 6, lineHeight: 22 },
  more: { color: '#fff', fontWeight: '800', fontSize: 14, marginTop: 2 },
  toastWrap: { position: 'absolute', top: '45%', left: 0, right: 0, alignItems: 'center' },
  toast: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, fontWeight: '700', overflow: 'hidden' },
  shadow: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
});
