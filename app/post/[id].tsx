import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { PostCard, VerifiedBadge } from '@/components/PostCard';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { authorName, Comment, Post, social, timeAgo } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius } from '@/theme';
import { useI18n } from '@/i18n';

/** One post + its comments + a box to write a comment. */
export default function PostScreen() {
  const { t, d } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([social.post(id), social.comments(id)]);
      setPost(p);
      setComments(c);
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await social.comment(id, body);
      setText('');
      await load();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setSending(false);
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

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ headerShown: true, title: t('post_title'), headerTitleAlign: 'center' }} />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : !post ? (
        <Text style={{ textAlign: 'center', marginTop: 40, color: colors.muted }}>{t('post_missing')}</Text>
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 8 }}
          ListHeaderComponent={<PostCard post={post} onChange={setPost} onDeleted={() => router.back()} inComments />}
          ListEmptyComponent={<Text style={{ textAlign: 'center', color: colors.muted, margin: 20 }}>{t('first_comment')}</Text>}
          renderItem={({ item }) => (
            <Pressable onLongPress={item.can_delete ? () => remove(item) : undefined} style={[st.comment, { flexDirection: d.rowOpp, justifyContent: 'flex-end' }]}>
              <View style={st.bubble}>
                <Pressable onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.author.id } })} style={{ flexDirection: d.row, alignItems: 'center' }}>
                  <Text style={[st.cName, { textAlign: d.align }]}>{authorName(item.author)}</Text>
                  {item.author.is_fainet ? <VerifiedBadge size={12} /> : null}
                </Pressable>
                <Text style={[st.cBody, { textAlign: d.align, writingDirection: d.writing }]}>{item.body}</Text>
              </View>
              <Avatar uri={avatarUrl(item.author.photo_path)} name={item.author.first_name} size={34} />
              <Text style={[st.cTime, d.rtl ? { left: 4 } : { right: 4 }]}>{timeAgo(item.created_at)}</Text>
            </Pressable>
          )}
        />
      )}
      {post ? (
        <View style={[st.inputBar, { flexDirection: d.rowOpp }]}>
          <Pressable onPress={send} disabled={!text.trim() || sending} style={{ padding: 8, opacity: text.trim() ? 1 : 0.4 }}>
            {sending ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="send" size={22} color={colors.primary} style={d.rtl ? { transform: [{ scaleX: -1 }] } : undefined} />}
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('write_comment')}
            placeholderTextColor={colors.muted}
            style={[st.input, { textAlign: d.align, writingDirection: d.writing }]}
            maxLength={500}
            multiline
          />
          <Avatar uri={profile?.photoURL} name={profile?.firstName} size={32} />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  comment: { alignItems: 'flex-start', gap: 8, marginVertical: 5, paddingHorizontal: 4 },
  bubble: { backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '75%' },
  cName: { fontWeight: '700', fontSize: 13, color: colors.text },
  cBody: { fontSize: 15, color: colors.text, marginTop: 2, lineHeight: 22 },
  cTime: { position: 'absolute', top: 4, fontSize: 11, color: colors.muted },
  inputBar: { alignItems: 'center', gap: 8, padding: 8, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  input: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, maxHeight: 100, color: colors.text },
});
