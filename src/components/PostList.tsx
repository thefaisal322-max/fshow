import { forwardRef, ReactElement, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View, ViewToken } from 'react-native';

import { errorMessage } from '@/lib/api';
import { PAGE, Post, social } from '@/lib/social';
import { colors } from '@/theme';

import { PostCard } from './PostCard';
import { useI18n } from '@/i18n';

type Props = {
  /** Loads one page starting at `offset`. */
  load: (offset: number) => Promise<Post[]>;
  header?: ReactElement | null;
  empty?: string;
  /** Extra block shown after the post at this index (People you may know, Reels...). */
  extraAfter?: (index: number) => ReactElement | null;
  /** Shown under a short feed (fewer than 2 posts) so sections still appear. */
  footerExtra?: ReactElement | null;
};

export type PostListHandle = { reload: () => void; prepend: (p: Post) => void };

// Views are recorded once per app session per post; the server also ignores repeats.
const viewed = new Set<string>();

export const PostList = forwardRef<PostListHandle, Props>(function PostList({ load, header, empty, extraAfter, footerExtra }, ref) {
  const { t } = useI18n();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const page = await load(reset ? 0 : posts.length);
        setPosts((old) => {
          if (reset) return page;
          const seen = new Set(old.map((p) => p.id));
          return [...old, ...page.filter((p) => !seen.has(p.id))];
        });
        setMore(page.length >= PAGE);
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        busy.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [load, posts.length],
  );

  useEffect(() => {
    setLoading(true);
    setPosts([]);
    setMore(true);
    busy.current = false;
    fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useImperativeHandle(ref, () => ({
    reload: () => {
      setRefreshing(true);
      fetchPage(true);
    },
    prepend: (p) => setPosts((old) => [p, ...old]),
  }));

  const update = useCallback((p: Post) => setPosts((old) => old.map((x) => (x.id === p.id ? p : x))), []);
  const remove = useCallback((id: string) => setPosts((old) => old.filter((x) => x.id !== id)), []);

  // A view counts when ≥ 60 % of the post is on screen for ≥ 2 seconds.
  const viewability = useRef({ itemVisiblePercentThreshold: 60, minimumViewTime: 2000 }).current;
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    for (const v of viewableItems) {
      const p = v.item as Post;
      if (v.isViewable && p && !viewed.has(p.id)) {
        viewed.add(p.id);
        social.view(p.id).catch(() => viewed.delete(p.id));
      }
    }
  }).current;

  return (
    <FlatList
      data={posts}
      keyExtractor={(p) => p.id}
      renderItem={({ item, index }) => (
        <>
          <PostCard post={item} onChange={update} onDeleted={remove} />
          {extraAfter ? extraAfter(index) : null}
        </>
      )}
      ListHeaderComponent={header}
      contentContainerStyle={{ padding: 8, paddingBottom: 90 }}
      style={{ backgroundColor: colors.bg }}
      onEndReached={() => more && !loading && fetchPage(false)}
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchPage(true);
          }}
          colors={[colors.primary]}
        />
      }
      viewabilityConfig={viewability}
      onViewableItemsChanged={onViewable}
      removeClippedSubviews
      windowSize={7}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <Text style={{ textAlign: 'center', color: error ? colors.error : colors.muted, marginTop: 40, paddingHorizontal: 20, lineHeight: 22 }}>
            {error ?? empty ?? t('no_posts')}
          </Text>
        )
      }
      ListFooterComponent={
        <>
          {posts.length && more ? <ActivityIndicator color={colors.primary} style={{ margin: 16 }} /> : <View style={{ height: 8 }} />}
          {!loading && posts.length < 2 ? footerExtra : null}
        </>
      }
    />
  );
});
