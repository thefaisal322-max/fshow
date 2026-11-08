import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { forwardRef, ReactElement, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { formatCount, Post, postImageUrl, videoUrl } from '@/lib/social';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

export type ReelGridHandle = { reload: () => void };

/** 3-column grid of videos with the view count on each one (like the Reels tab on a Facebook / TikTok profile). */
export const ReelGrid = forwardRef<
  ReelGridHandle,
  { load: (offset: number) => Promise<Post[]>; header?: ReactElement | null; empty?: string; onOpen: (p: Post) => void }
>(function ReelGrid({ load, header, empty, onOpen }, ref) {
  const { t } = useI18n();
  const bottom = useBottomSpace();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (reset: boolean) => {
      try {
        setError(null);
        const page = await load(reset ? 0 : items.length);
        setItems((old) => (reset ? page : [...old, ...page.filter((p) => !old.some((o) => o.id === p.id))]));
        setMore(page.length >= 20);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [load, items.length],
  );

  useEffect(() => {
    setLoading(true);
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useImperativeHandle(ref, () => ({ reload: () => fetchPage(true) }));

  // page padding is 8 on each side, 2 px gaps between cells
  const cell = Math.floor((width - 16 - 4) / 3);

  return (
    <FlatList
      data={items}
      keyExtractor={(p) => p.id}
      numColumns={3}
      columnWrapperStyle={{ gap: 2 }}
      contentContainerStyle={{ padding: 8, paddingBottom: 90 + bottom, gap: 2 }}
      ListHeaderComponent={header}
      onEndReached={() => more && !loading && fetchPage(false)}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchPage(true);
          }}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
      renderItem={({ item }) => <ReelCell post={item} size={cell} onPress={() => onOpen(item)} />}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : (
          <View style={{ alignItems: 'center', marginTop: 30, gap: 8 }}>
            <Ionicons name="film-outline" size={40} color={colors.muted} />
            <Text style={{ color: colors.muted, textAlign: 'center' }}>{error ?? empty ?? t('no_reels')}</Text>
          </View>
        )
      }
    />
  );
});

export function ReelCell({ post, size, onPress }: { post: Post; size: number; onPress: () => void }) {
  const thumb = postImageUrl(post.thumb_path ?? null);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.cell, { width: size, height: Math.round(size * 1.6) }, pressed && { opacity: 0.8 }]}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : post.video_path ? (
        <FirstFrame uri={videoUrl(post.video_path)!} />
      ) : null}
      <View style={st.shade} />
      {post.visibility && post.visibility !== 'public' ? (
        <Ionicons name={post.visibility === 'private' ? 'lock-closed' : 'people'} size={14} color="#fff" style={st.lock} />
      ) : null}
      <View style={st.views}>
        <Ionicons name="play-outline" size={15} color="#fff" />
        <Text style={st.viewsText}>{formatCount(post.views_count)}</Text>
      </View>
    </Pressable>
  );
}

/** Old videos have no cover picture: show the first frame of the video instead. */
function FirstFrame({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      nativeControls={false}
      contentFit="cover"
      surfaceType="textureView"
      pointerEvents="none"
    />
  );
}

const st = StyleSheet.create({
  cell: { backgroundColor: '#111', borderRadius: radius.sm, overflow: 'hidden' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 36, backgroundColor: 'rgba(0,0,0,0.35)' },
  views: { position: 'absolute', left: 6, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 3 },
  viewsText: { color: '#fff', fontSize: 13, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  lock: { position: 'absolute', top: 6, right: 6 },
});
