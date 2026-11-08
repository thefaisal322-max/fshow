import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { authorName, timeAgo } from '@/lib/social';
import { stories, Story, storyStore, storyUrl } from '@/lib/stories';
import { avatarUrl } from '@/lib/supabase';
import { colors } from '@/theme';

const IMAGE_MS = 5000;
const VIDEO_MAX_MS = 60000;

/** Full-screen stories: tap sides to move, hold to pause, auto-advance; then the next person's stories. */
export default function StoryViewer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, d } = useI18n();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const me = session?.user.id ?? '';

  const [ringIndex, setRingIndex] = useState(() => Math.max(0, storyStore.rings.findIndex((r) => r.author.id === id)));
  const ring = storyStore.rings[ringIndex];
  const [index, setIndex] = useState(() => {
    const first = ring?.stories.findIndex((s) => !s.seen) ?? 0;
    return first < 0 ? 0 : first;
  });
  const [paused, setPaused] = useState(false);
  const [viewers, setViewers] = useState<{ id: string; first_name: string; last_name: string; photo_path: string | null; viewed_at: string }[] | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const story: Story | undefined = ring?.stories[index];
  const mine = ring?.author.id === me;

  function next() {
    if (!ring) return router.back();
    if (index < ring.stories.length - 1) setIndex(index + 1);
    else if (ringIndex < storyStore.rings.length - 1) {
      setRingIndex(ringIndex + 1);
      setIndex(0);
    } else router.back();
  }
  function prev() {
    if (index > 0) setIndex(index - 1);
    else if (ringIndex > 0) {
      const r = storyStore.rings[ringIndex - 1];
      setRingIndex(ringIndex - 1);
      setIndex(r.stories.length - 1);
    }
  }

  // record the view + mark seen locally
  useEffect(() => {
    if (!story || mine) return;
    if (!story.seen) {
      story.seen = true;
      if (ring.stories.every((s) => s.seen)) ring.all_seen = true;
      stories.view(story.id).catch(() => {});
    }
  }, [story?.id]);

  // progress bar + auto advance (images: 5 s; videos: until they end, max 60 s)
  useEffect(() => {
    if (!story) return;
    progress.setValue(0);
    if (paused) return;
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: story.media_type === 'image' ? IMAGE_MS : VIDEO_MAX_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => finished && next());
    return () => anim.stop();
  }, [story?.id, paused]);

  async function showViewers() {
    if (!story) return;
    setPaused(true);
    try {
      setViewers(await stories.viewers(story.id));
    } catch (e) {
      Alert.alert('', errorMessage(e));
      setPaused(false);
    }
  }

  function menu() {
    if (!story) return;
    setPaused(true);
    Alert.alert('', '', [
      {
        text: t('delete_story'),
        style: 'destructive',
        onPress: async () => {
          try {
            await stories.remove(story);
            ring.stories.splice(index, 1);
            if (!ring.stories.length) router.back();
            else setIndex(Math.min(index, ring.stories.length - 1));
          } catch (e) {
            Alert.alert('', errorMessage(e));
          } finally {
            setPaused(false);
          }
        },
      },
      { text: t('close'), style: 'cancel', onPress: () => setPaused(false) },
    ]);
  }

  if (!ring || !story) {
    return (
      <View style={st.screen}>
        <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      </View>
    );
  }

  return (
    <View style={st.screen}>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      {story.media_type === 'image' ? (
        <Image source={{ uri: storyUrl(story.media_path) }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      ) : (
        <StoryVideo key={story.id} uri={storyUrl(story.media_path)} paused={paused} onEnd={next} />
      )}

      {/* tap zones: start side = back, end side = forward; hold = pause */}
      <View style={[StyleSheet.absoluteFill, { flexDirection: d.row }]}>
        <Pressable style={{ flex: 1 }} onPress={prev} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} delayLongPress={200} />
        <Pressable style={{ flex: 2 }} onPress={next} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} delayLongPress={200} />
      </View>

      <View style={[st.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={[st.bars, { flexDirection: d.row }]}>
          {ring.stories.map((s, i) => (
            <View key={s.id} style={st.bar}>
              <Animated.View
                style={[
                  st.barFill,
                  {
                    width: i < index ? '100%' : i > index ? '0%' : progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={[st.head, { flexDirection: d.row }]}>
          <Pressable onPress={() => router.replace({ pathname: '/user/[id]', params: { id: ring.author.id } })}>
            <Avatar uri={avatarUrl(ring.author.photo_path)} name={ring.author.first_name} size={38} />
          </Pressable>
          <View style={{ flex: 1, alignItems: d.items }}>
            <View style={{ flexDirection: d.row, alignItems: 'center' }}>
              <Text style={st.name}>{authorName(ring.author)}</Text>
              {ring.author.is_fainet ? <VerifiedBadge /> : null}
            </View>
            <Text style={st.time}>{timeAgo(story.created_at)}</Text>
          </View>
          {mine ? (
            <Pressable onPress={menu} hitSlop={10} style={{ padding: 4 }}>
              <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
            </Pressable>
          ) : null}
          <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 4 }}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>
      </View>

      {story.caption ? <Text style={[st.caption, { bottom: insets.bottom + 70 }]}>{story.caption}</Text> : null}

      {mine ? (
        <Pressable style={[st.views, { bottom: insets.bottom + 20 }]} onPress={showViewers}>
          <Ionicons name="eye" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700' }}>{t('story_views_n', { n: story.views_count ?? 0 })}</Text>
        </Pressable>
      ) : null}

      <Modal visible={!!viewers} transparent animationType="slide" onRequestClose={() => { setViewers(null); setPaused(false); }}>
        <Pressable style={st.backdrop} onPress={() => { setViewers(null); setPaused(false); }} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 10 }]}>
          <Text style={st.sheetTitle}>{t('story_viewers')}</Text>
          <FlatList
            data={viewers ?? []}
            keyExtractor={(v) => v.id}
            ListEmptyComponent={<Text style={{ textAlign: 'center', color: colors.muted, margin: 20 }}>—</Text>}
            renderItem={({ item }) => (
              <View style={[st.viewer, { flexDirection: d.row }]}>
                <Avatar uri={avatarUrl(item.photo_path)} name={item.first_name} size={40} />
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text, textAlign: d.align }}>
                  {item.first_name} {item.last_name}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{timeAgo(item.viewed_at)}</Text>
              </View>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

function StoryVideo({ uri, paused, onEnd }: { uri: string; paused: boolean; onEnd: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  useEventListener(player, 'playToEnd', onEnd);
  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="contain" surfaceType="textureView" />;
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 10 },
  bars: { gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: '#fff' },
  head: { alignItems: 'center', gap: 10, marginTop: 10 },
  name: { color: '#fff', fontWeight: '800', fontSize: 15 },
  time: { color: '#ddd', fontSize: 12 },
  caption: { position: 'absolute', left: 20, right: 20, color: '#fff', fontSize: 18, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 },
  views: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { maxHeight: '60%', backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 8, color: colors.text },
  viewer: { alignItems: 'center', gap: 10, paddingVertical: 8 },
});
