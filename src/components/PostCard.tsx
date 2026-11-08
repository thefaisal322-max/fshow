import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { memo, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { authorName, feelingLabel, formatCount, Post, PostPreview, postImageUrl, social, timeAgo, videoUrl } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius } from '@/theme';

import { Avatar } from './Avatar';
import { CommentsSheet } from './CommentsSheet';
import { DoubleTap, HeartBurst, HeartBurstHandle } from './Heart';
import { PostMenuSheet } from './PostMenuSheet';
import { ShareSheet } from './ShareSheet';
import { TagText } from './TagText';
import { VerifiedBadge } from './VerifiedBadge';
import { FeedVideo } from './Video';

type Props = {
  post: Post;
  onChange?: (p: Post) => void;
  onDeleted?: (id: string) => void;
  /** Hide the comment button (on the comments screen itself). */
  inComments?: boolean;
};

export { VerifiedBadge };

function PostCardInner({ post, onChange, onDeleted, inComments }: Props) {
  const router = useRouter();
  const { t, d } = useI18n();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [ratio, setRatio] = useState(1);
  const [sheet, setSheet] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const heart = useRef<HeartBurstHandle>(null);
  const img = postImageUrl(post.image_path);
  const vid = videoUrl(post.video_path);
  const feeling = feelingLabel(post.feeling);

  // Optimistic update: change the screen at once, undo if the server says no.
  async function toggle(kind: 'like' | 'save') {
    const on = kind === 'like' ? !post.liked : !post.saved;
    const next: Post =
      kind === 'like'
        ? { ...post, liked: on, likes_count: Math.max(0, post.likes_count + (on ? 1 : -1)) }
        : { ...post, saved: on, saves_count: Math.max(0, post.saves_count + (on ? 1 : -1)) };
    onChange?.(next);
    if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      if (kind === 'like') await social.like(post.id, on);
      else await social.save(post.id, on, me);
    } catch (e) {
      onChange?.(post);
      Alert.alert('', errorMessage(e));
    }
  }

  const share = () => setShareOpen(true);

  /** Double tap: like (never unlike) + big heart. */
  function doubleTapLike(x?: number, y?: number) {
    heart.current?.burst(x, y);
    if (!post.liked) toggle('like');
  }

  const openAuthor = () => router.push({ pathname: '/user/[id]', params: { id: post.author.id } });
  const openComments = () => setSheet(true);

  return (
    <View style={st.card}>
      {post.boosted ? (
        <View style={[st.boost, { flexDirection: d.row }]}>
          <Ionicons name="flash" size={12} color={colors.primary} />
          <Text style={st.boostText}>{t('featured')}</Text>
        </View>
      ) : null}

      <View style={[st.head, { flexDirection: d.rowOpp }]}>
        <Pressable onPress={() => setMenu(true)} hitSlop={12} style={{ padding: 4 }}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
        </Pressable>
        <Pressable onPress={openAuthor} style={[st.author, { flexDirection: d.rowOpp }]}>
          <View style={{ flex: 1, alignItems: d.items }}>
            <View style={{ flexDirection: d.row, alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={st.name} numberOfLines={1}>
                {authorName(post.author)}
              </Text>
              {post.author.is_fainet ? <VerifiedBadge /> : null}
            </View>
            <Text style={[st.meta, { textAlign: d.align }]}>
              {post.author.username ? `@${post.author.username} · ` : ''}
              {timeAgo(post.created_at)}
              {post.edited ? ` · ${t('edited')}` : ''}{' '}
              <Ionicons
                name={post.visibility === 'private' ? 'lock-closed' : post.visibility === 'friends' ? 'people' : 'earth'}
                size={11}
                color={colors.muted}
              />
            </Text>
            {feeling || post.location ? (
              <Text style={[st.meta, { textAlign: d.align, color: colors.text }]} numberOfLines={1}>
                {[feeling ? t('is_feeling', { f: feeling }) : null, post.location ? t('at_location', { l: post.location }) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
          </View>
          <Avatar uri={avatarUrl(post.author.photo_path)} name={post.author.first_name} size={42} />
        </Pressable>
      </View>

      {post.body ? <TagText text={post.body} style={[st.body, { textAlign: d.align, writingDirection: d.writing }]} /> : null}

      {post.shared ? <SharedPreview p={post.shared} /> : null}

      {img ? (
        <DoubleTap onDouble={doubleTapLike} onSingle={inComments ? undefined : openComments}>
          <Image
            source={{ uri: img }}
            style={[st.image, { aspectRatio: ratio }]}
            resizeMode="cover"
            onLoad={(e) => {
              const { width, height } = e.nativeEvent.source;
              if (width && height) setRatio(Math.max(0.6, Math.min(1.8, width / height)));
            }}
          />
          <HeartBurst ref={heart} />
        </DoubleTap>
      ) : null}
      {vid ? <FeedVideo uri={vid} style={st.video} /> : null}

      <View style={[st.stats, { flexDirection: d.rowOpp }]}>
        {/* views are not shown on videos */}
        {vid ? (
          <View />
        ) : (
          <Text style={st.statText}>
            <Ionicons name="eye-outline" size={13} /> {formatCount(post.views_count)}
          </Text>
        )}
        <Text style={st.statText}>
          {t('comments_n', { n: formatCount(post.comments_count) })} · {t('shares_n', { n: formatCount(post.shares_count) })}
        </Text>
      </View>

      <View style={[st.actions, { flexDirection: d.row }]}>
        <Action
          icon={post.liked ? 'heart' : 'heart-outline'}
          color={post.liked ? colors.error : colors.muted}
          label={formatCount(post.likes_count)}
          onPress={() => toggle('like')}
        />
        <Action icon="chatbubble-outline" label={t('comment')} onPress={inComments ? undefined : openComments} />
        <Action icon="arrow-redo-outline" label={t('share')} onPress={share} />
        <Action
          icon={post.saved ? 'bookmark' : 'bookmark-outline'}
          color={post.saved ? colors.primary : colors.muted}
          label={t('save_post')}
          onPress={() => toggle('save')}
        />
      </View>
      {sheet ? (
        <CommentsSheet
          postId={post.id}
          onClose={() => setSheet(false)}
          onCount={(n) => n !== post.comments_count && onChange?.({ ...post, comments_count: n })}
        />
      ) : null}
      {menu ? <PostMenuSheet post={post} onClose={() => setMenu(false)} onChange={onChange} onRemoved={onDeleted} /> : null}
      {shareOpen ? (
        <ShareSheet post={post} onClose={() => setShareOpen(false)} onShared={() => onChange?.({ ...post, shares_count: post.shares_count + 1 })} />
      ) : null}
    </View>
  );
}

/** The original post inside a repost. */
function SharedPreview({ p }: { p: PostPreview }) {
  const router = useRouter();
  const { d } = useI18n();
  const img = postImageUrl(p.image_path);
  return (
    <Pressable onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })} style={st.shared}>
      {img ? <Image source={{ uri: img }} style={st.sharedImg} resizeMode="cover" /> : null}
      {p.video_path ? (
        <View style={[st.sharedImg, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="play-circle" size={56} color="#fff" />
        </View>
      ) : null}
      <View style={{ padding: 10, alignItems: d.items }}>
        <View style={{ flexDirection: d.row, alignItems: 'center', gap: 8 }}>
          <Avatar uri={avatarUrl(p.author.photo_path)} name={p.author.first_name} size={26} />
          <Text style={st.name}>{authorName(p.author)}</Text>
          {p.author.is_fainet ? <VerifiedBadge size={12} /> : null}
        </View>
        {p.body ? (
          <Text style={[st.sharedBody, { textAlign: d.align }]} numberOfLines={4}>
            {p.body}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function Action({ icon, label, color = colors.muted, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color?: string; onPress?: () => void }) {
  const { d } = useI18n();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.action, { flexDirection: d.row }, pressed && { opacity: 0.6 }]} hitSlop={6}>
      <Ionicons name={icon} size={21} color={color} />
      <Text style={[st.actionText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export const PostCard = memo(PostCardInner);

const st = StyleSheet.create({
  card: { backgroundColor: colors.card, marginBottom: 10, paddingTop: 12, borderRadius: radius.md, overflow: 'hidden' },
  boost: { alignItems: 'center', gap: 4, paddingHorizontal: 14, marginBottom: 6 },
  boostText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  head: { alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  author: { flex: 1, alignItems: 'center', gap: 10 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  body: { fontSize: 16, color: colors.text, lineHeight: 26, paddingHorizontal: 14, marginTop: 10 },
  image: { width: '100%', marginTop: 10, backgroundColor: colors.bg },
  video: { width: '100%', aspectRatio: 9 / 12, marginTop: 10, backgroundColor: '#000' },
  shared: { marginHorizontal: 12, marginTop: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
  sharedImg: { width: '100%', aspectRatio: 1.4, backgroundColor: colors.bg },
  sharedBody: { fontSize: 14, color: colors.text, marginTop: 6, lineHeight: 21 },
  stats: { justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 },
  statText: { color: colors.muted, fontSize: 12 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11 },
  actionText: { fontSize: 13, fontWeight: '600' },
});
