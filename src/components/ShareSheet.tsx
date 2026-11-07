import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { chat, chatTitle, Conversation } from '@/lib/chat';
import { feedSignal, profileSignal } from '@/lib/signals';
import { Post, postLink, social } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

import { Avatar } from './Avatar';

/** Facebook-style share: share now (to my feed), with text, send in chat, copy link, other apps. */
export function ShareSheet({ post, onClose, onShared }: { post: Post; onClose: () => void; onShared?: () => void }) {
  const { t, d } = useI18n();
  const { profile } = useAuth();
  const bottom = useBottomSpace();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [chats, setChats] = useState<Conversation[] | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const original = post.shared ? post.shared.id : post.id; // reshare the original, not the repost

  useEffect(() => {
    chat.list(false).then(setChats).catch(() => setChats([]));
  }, []);

  async function shareNow() {
    setBusy(true);
    try {
      await social.repost(original, text);
      feedSignal.dirty = true;
      profileSignal.dirty = true;
      onShared?.();
      Alert.alert('', t('shared_ok'));
      onClose();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function send(c: Conversation) {
    try {
      await social.sendToChat(c.id, original);
      setSent((s) => new Set(s).add(c.id));
    } catch (e) {
      Alert.alert('', errorMessage(e));
    }
  }

  async function copy() {
    await Clipboard.setStringAsync(postLink(original));
    Alert.alert('', t('link_copied'));
  }

  async function more() {
    try {
      await social.share(post);
      onShared?.();
    } catch {
      // closed
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={[st.sheet, { paddingBottom: 12 + bottom }]}>
        <View style={st.handle} />
        <View style={[st.composer, { flexDirection: d.row }]}>
          <Avatar uri={profile?.photoURL} name={profile?.firstName} size={40} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('say_something')}
            placeholderTextColor={colors.muted}
            style={[st.input, { textAlign: d.align, writingDirection: d.writing }]}
            multiline
            maxLength={2000}
          />
        </View>
        <Pressable style={st.shareNow} onPress={shareNow} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.shareNowText}>{t('share_now')}</Text>}
        </Pressable>

        <Text style={[st.label, { textAlign: d.align }]}>{t('send_in_chat')}</Text>
        {chats === null ? (
          <ActivityIndicator color={colors.primary} style={{ margin: 12 }} />
        ) : (
          <FlatList
            horizontal
            inverted={d.rtl}
            data={chats.slice(0, 20)}
            keyExtractor={(c) => c.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 14, paddingHorizontal: 4 }}
            renderItem={({ item }) => {
              const other = item.members?.[0];
              const done = sent.has(item.id);
              return (
                <View style={st.chat}>
                  {item.is_group ? (
                    <View style={st.group}>
                      <Ionicons name="people" size={24} color="#fff" />
                    </View>
                  ) : (
                    <Avatar uri={avatarUrl(other?.photo_path)} name={other?.first_name} size={52} />
                  )}
                  <Text style={st.chatName} numberOfLines={1}>
                    {chatTitle(item, t('chats'))}
                  </Text>
                  <Pressable onPress={() => !done && send(item)} style={[st.sendBtn, done && { backgroundColor: '#E7F0FD' }]}>
                    <Text style={[st.sendText, done && { color: colors.primary }]}>{done ? '✓' : t('send')}</Text>
                  </Pressable>
                </View>
              );
            }}
          />
        )}

        <View style={[st.actions, { flexDirection: d.row }]}>
          <Action icon="link" label={t('copy_link')} onPress={copy} />
          <Action icon="share-social" label={t('share_more')} onPress={more} />
        </View>
      </View>
    </Modal>
  );
}

function Action({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={st.action}>
      <View style={st.actionIcon}>
        <Ionicons name={icon} size={22} color={colors.text} />
      </View>
      <Text style={st.actionText}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 14 },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 10 },
  composer: { alignItems: 'flex-start', gap: 10 },
  input: { flex: 1, minHeight: 50, maxHeight: 120, fontSize: 16, color: colors.text, textAlignVertical: 'top' },
  shareNow: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  shareNowText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  label: { fontWeight: '800', fontSize: 15, color: colors.text, marginTop: 16, marginBottom: 10 },
  chat: { width: 72, alignItems: 'center', gap: 4 },
  group: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  chatName: { fontSize: 12, color: colors.text, maxWidth: 72 },
  sendBtn: { backgroundColor: colors.primary, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  actions: { justifyContent: 'space-around', marginTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 14 },
  action: { alignItems: 'center', gap: 6 },
  actionIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 12, color: colors.text },
});
