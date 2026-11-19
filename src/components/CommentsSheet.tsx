import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { authorName, Comment, formatCount, isEmojiOnly, Liker, social, timeAgo } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

import { Avatar } from './Avatar';
import { MentionSuggest } from './MentionSuggest';
import { TagText } from './TagText';
import { VerifiedBadge } from './VerifiedBadge';

const QUICK = ['😂', '😍', '🥰', '😮', '😢', '🔥', '👏', '❤️'];

/** Comments slide up from the bottom (like Facebook), over the feed or a reel. */
export function CommentsSheet({
  postId,
  ownerId,
  onClose,
  onCount,
}: {
  postId: string;
  /** the post's author: they also get a "Likes" list (who liked it) */
  ownerId?: string;
  onClose: () => void;
  onCount?: (n: number) => void;
}) {
  const router = useRouter();
  const { t, d } = useI18n();
  const { profile, session } = useAuth();
  const me = session?.user.id ?? '';
  const bottom = useBottomSpace();
  const [items, setItems] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const isOwner = !!ownerId && ownerId === me;
  const [tab, setTab] = useState<'comments' | 'likes'>('comments');
  const [likers, setLikers] = useState<Liker[] | null>(null);
  const [likeTotal, setLikeTotal] = useState(0);
  useEffect(() => {
    if (!isOwner) return;
    social
      .likers(postId)
      .then((r) => {
        setLikers(r.people);
        setLikeTotal(r.total);
      })
      .catch(() => setLikers([]));
  }, [isOwner, postId]);

  const load = useCallback(async () => {
    try {
      const c = await social.comments(postId);
      setItems(c);
      onCount?.(c.length);
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [postId, onCount]);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await social.comment(postId, body);
      setText('');
      await load();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function heart(c: Comment) {
    const on = !c.liked;
    setItems((list) => list.map((x) => (x.id === c.id ? { ...x, liked: on, likes_count: Math.max(0, x.likes_count + (on ? 1 : -1)) } : x)));
    try {
      await social.heartComment(c.id, on, me);
    } catch (e) {
      setItems((list) => list.map((x) => (x.id === c.id ? c : x)));
      Alert.alert('', errorMessage(e));
    }
  }

  function remove(c: Comment) {
    Alert.alert(t('delete_comment_q'), '', [
      { text: t('no'), style: 'cancel' },
      {
        text: t('yes'),
        style: 'destructive',
        onPress: async () => {
          try {
            await social.deleteComment(c.id);
            await load();
          } catch (e) {
            Alert.alert('', errorMessage(e));
          }
        },
      },
    ]);
  }

  const openUser = (id: string) => {
    onClose();
    router.push({ pathname: '/user/[id]', params: { id } });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={st.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.sheet}>
        <View style={st.handle} />
        <View style={[st.header, { flexDirection: d.row }]}>
          {isOwner ? (
            <View style={{ flexDirection: d.row, gap: 18, alignItems: 'center' }}>
              <Pressable onPress={() => setTab('comments')}>
                <Text style={[st.title, tab !== 'comments' && st.tabOff]}>{t('comment')}</Text>
              </Pressable>
              <Pressable onPress={() => setTab('likes')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="heart" size={17} color={tab === 'likes' ? colors.error : colors.muted} />
                <Text style={[st.title, tab !== 'likes' && st.tabOff]}>{formatCount(likeTotal)}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={st.title}>{t('comment')}</Text>
          )}
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.muted} />
          </Pressable>
        </View>
        {tab === 'likes' ? (
          likers === null ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
          ) : (
            <FlatList
              data={likers}
              keyExtractor={(x) => x.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 12, paddingBottom: 16 + bottom }}
              ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', marginTop: 30 }}>{t('likes_none')}</Text>}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onClose();
                    router.push({ pathname: '/user/[id]', params: { id: item.id } });
                  }}
                  style={{ flexDirection: d.row, alignItems: 'center', gap: 12, paddingVertical: 8 }}
                >
                  <Avatar uri={avatarUrl(item.photo_path)} name={item.first_name} size={44} />
                  <View style={{ flex: 1, alignItems: d.items }}>
                    <View style={{ flexDirection: d.row, alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontWeight: '800', color: colors.text }}>{authorName(item)}</Text>
                      {item.is_fainet ? <VerifiedBadge size={14} /> : null}
                    </View>
                    <Text style={{ color: colors.muted, fontSize: 13 }}>
                      {item.username ? `@${item.username} · ` : ''}
                      {timeAgo(item.liked_at)}
                    </Text>
                  </View>
                  <Ionicons name="heart" size={18} color={colors.error} />
                </Pressable>
              )}
            />
          )
        ) : loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: 10, paddingBottom: 20 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={st.empty}>{t('first_comment')}</Text>}
            renderItem={({ item }) => {
              const sticker = isEmojiOnly(item.body);
              return (
                <Pressable onLongPress={item.can_delete ? () => remove(item) : undefined} style={[st.row, { flexDirection: d.row }]}>
                  <Pressable onPress={() => openUser(item.author.id)}>
                    <Avatar uri={avatarUrl(item.author.photo_path)} name={item.author.first_name} size={36} />
                  </Pressable>
                  <View style={{ flex: 1, alignItems: d.items }}>
                    <View style={sticker ? { paddingHorizontal: 4 } : st.bubble}>
                      <Pressable onPress={() => openUser(item.author.id)} style={{ flexDirection: d.row, alignItems: 'center' }}>
                        <Text style={st.name}>{authorName(item.author)}</Text>
                        {item.author.is_fainet ? <VerifiedBadge size={12} /> : null}
                      </Pressable>
                      {sticker ? (
                        <Text style={[st.sticker, { textAlign: d.align }]}>{item.body}</Text>
                      ) : (
                        <TagText text={item.body} style={[st.body, { textAlign: d.align, writingDirection: d.writing }]} />
                      )}
                    </View>
                    <Text style={st.time}>{timeAgo(item.created_at)}</Text>
                  </View>
                  {/* comment heart */}
                  <Pressable onPress={() => heart(item)} hitSlop={8} style={st.heart}>
                    <Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={18} color={item.liked ? colors.error : colors.muted} />
                    {item.likes_count > 0 ? <Text style={st.heartCount}>{formatCount(item.likes_count)}</Text> : null}
                  </Pressable>
                </Pressable>
              );
            }}
          />
        )}
        {/* quick emoji (like TikTok): tap to add, long-press to send as a sticker */}
        <View style={[st.emojiBar, { flexDirection: d.row }]}>
          {QUICK.map((e) => (
            <Pressable
              key={e}
              onPress={() => setText((tx) => tx + e)}
              onLongPress={async () => {
                setSending(true);
                try {
                  await social.comment(postId, e);
                  await load();
                } catch (err) {
                  Alert.alert('', errorMessage(err));
                } finally {
                  setSending(false);
                }
              }}
              hitSlop={4}
            >
              <Text style={{ fontSize: 26 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
        <MentionSuggest text={text} onPick={setText} />
        <View style={[st.inputBar, { flexDirection: d.row, paddingBottom: 8 + bottom }]}>
          <Avatar uri={profile?.photoURL} name={profile?.firstName} size={32} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('write_comment')}
            placeholderTextColor={colors.muted}
            style={[st.input, { textAlign: d.align, writingDirection: d.writing }]}
            maxLength={500}
            multiline
          />
          <Pressable onPress={send} disabled={!text.trim() || sending} style={{ padding: 6, opacity: text.trim() ? 1 : 0.4 }}>
            {sending ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Ionicons name="send" size={22} color={colors.primary} style={d.rtl ? { transform: [{ scaleX: -1 }] } : undefined} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: Dimensions.get('window').height * 0.78,
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: 8 },
  tabOff: { color: colors.muted },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 30 },
  row: { gap: 8, marginBottom: 12, alignItems: 'flex-start' },
  bubble: { backgroundColor: colors.bg, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' },
  name: { fontWeight: '700', fontSize: 13, color: colors.text },
  body: { fontSize: 15, color: colors.text, marginTop: 2, lineHeight: 22 },
  time: { fontSize: 11, color: colors.muted, marginTop: 3, marginHorizontal: 10 },
  sticker: { fontSize: 44, lineHeight: 54, marginTop: 2 },
  heart: { alignItems: 'center', paddingTop: 8, minWidth: 28 },
  heartCount: { fontSize: 11, color: colors.muted, marginTop: 1 },
  emojiBar: { justifyContent: 'space-around', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  inputBar: { alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.card },
  input: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, maxHeight: 100, color: colors.text },
});
