import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { authorName, formatCount, Post, postImageUrl, social, timeAgo } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius } from '@/theme';

import { Avatar } from './Avatar';

type Props = {
  post: Post;
  onChange?: (p: Post) => void;
  onDeleted?: (id: string) => void;
  /** Hide the comment button (on the comments screen itself). */
  inComments?: boolean;
};

export function VerifiedBadge({ size = 14 }: { size?: number }) {
  return <Ionicons name="checkmark-circle" size={size} color={colors.primary} style={{ marginHorizontal: 3 }} />;
}

function PostCardInner({ post, onChange, onDeleted, inComments }: Props) {
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [ratio, setRatio] = useState(1);
  const img = postImageUrl(post.image_path);

  // Optimistic update: change the screen at once, undo if the server says no.
  async function toggle(kind: 'like' | 'save') {
    const on = kind === 'like' ? !post.liked : !post.saved;
    const next: Post =
      kind === 'like'
        ? { ...post, liked: on, likes_count: Math.max(0, post.likes_count + (on ? 1 : -1)) }
        : { ...post, saved: on, saves_count: Math.max(0, post.saves_count + (on ? 1 : -1)) };
    onChange?.(next);
    try {
      if (kind === 'like') await social.like(post.id, on);
      else await social.save(post.id, on, me);
    } catch (e) {
      onChange?.(post);
      Alert.alert('', errorMessage(e));
    }
  }

  async function share() {
    try {
      await social.share(post);
    } catch {
      // user closed the share sheet
    }
  }

  function menu() {
    const mine = post.author.id === me;
    Alert.alert('', '', [
      mine
        ? {
            text: 'پوسټ ړنګول',
            style: 'destructive',
            onPress: () =>
              Alert.alert('ړنګول؟', 'دا پوسټ به د تل لپاره ړنګ شي', [
                { text: 'نه', style: 'cancel' },
                {
                  text: 'هو، ړنګ یې کړه',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await social.deletePost(post);
                      onDeleted?.(post.id);
                    } catch (e) {
                      Alert.alert('', errorMessage(e));
                    }
                  },
                },
              ]),
          }
        : {
            text: 'راپور ورکول (Report)',
            onPress: async () => {
              try {
                await social.report({ postId: post.id }, 'inappropriate');
                Alert.alert('', 'مننه. راپور مو ورسېد.');
              } catch (e) {
                Alert.alert('', errorMessage(e));
              }
            },
          },
      { text: 'بندول', style: 'cancel' },
    ]);
  }

  const openAuthor = () => router.push({ pathname: '/user/[id]', params: { id: post.author.id } });
  const openComments = () => router.push({ pathname: '/post/[id]', params: { id: post.id } });

  return (
    <View style={st.card}>
      {post.boosted ? (
        <View style={st.boost}>
          <Ionicons name="flash" size={12} color={colors.primary} />
          <Text style={st.boostText}>ځانګړی</Text>
        </View>
      ) : null}

      <View style={st.head}>
        <Pressable onPress={menu} hitSlop={12} style={{ padding: 4 }}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
        </Pressable>
        <Pressable onPress={openAuthor} style={st.author}>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
              <Text style={st.name} numberOfLines={1}>
                {authorName(post.author)}
              </Text>
              {post.author.is_fainet ? <VerifiedBadge /> : null}
            </View>
            <Text style={st.meta}>
              {post.author.username ? `@${post.author.username} · ` : ''}
              {timeAgo(post.created_at)}
            </Text>
          </View>
          <Avatar uri={avatarUrl(post.author.photo_path)} name={post.author.first_name} size={42} />
        </Pressable>
      </View>

      {post.body ? <Text style={st.body}>{post.body}</Text> : null}

      {img ? (
        <Pressable onPress={inComments ? undefined : openComments}>
          <Image
            source={{ uri: img }}
            style={[st.image, { aspectRatio: ratio }]}
            resizeMode="cover"
            onLoad={(e) => {
              const { width, height } = e.nativeEvent.source;
              if (width && height) setRatio(Math.max(0.6, Math.min(1.8, width / height)));
            }}
          />
        </Pressable>
      ) : null}

      <View style={st.stats}>
        <Text style={st.statText}>
          <Ionicons name="eye-outline" size={13} /> {formatCount(post.views_count)}
        </Text>
        <Text style={st.statText}>
          {formatCount(post.comments_count)} کمنټ · {formatCount(post.shares_count)} شریک
        </Text>
      </View>

      <View style={st.actions}>
        <Action icon={post.liked ? 'heart' : 'heart-outline'} color={post.liked ? colors.error : colors.muted} label={formatCount(post.likes_count)} onPress={() => toggle('like')} />
        <Action icon="chatbubble-outline" label="کمنټ" onPress={inComments ? undefined : openComments} />
        <Action icon="arrow-redo-outline" label="شریکول" onPress={share} />
        <Action icon={post.saved ? 'bookmark' : 'bookmark-outline'} color={post.saved ? colors.primary : colors.muted} label="سېو" onPress={() => toggle('save')} />
      </View>
    </View>
  );
}

function Action({ icon, label, color = colors.muted, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.action, pressed && { opacity: 0.6 }]} hitSlop={6}>
      <Ionicons name={icon} size={21} color={color} />
      <Text style={[st.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export const PostCard = memo(PostCardInner);

const st = StyleSheet.create({
  card: { backgroundColor: colors.card, marginBottom: 10, paddingTop: 12, borderRadius: radius.md, overflow: 'hidden' },
  boost: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4, paddingHorizontal: 14, marginBottom: 6 },
  boostText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  author: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'right' },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  body: { fontSize: 16, color: colors.text, lineHeight: 26, paddingHorizontal: 14, marginTop: 10, textAlign: 'right', writingDirection: 'rtl' },
  image: { width: '100%', marginTop: 10, backgroundColor: colors.bg },
  stats: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 },
  statText: { color: colors.muted, fontSize: 12 },
  actions: { flexDirection: 'row-reverse', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  action: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11 },
  actionText: { fontSize: 13, fontWeight: '600' },
});
