import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { chat, chatTitle, Conversation, Message } from '@/lib/chat';
import { avatarUrl } from '@/lib/supabase';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

/** Forward a message: pick chats and tap "Send" on each (like Messenger). */
export function ForwardSheet({ message, currentChat, onClose }: { message: Message; currentChat?: string; onClose: () => void }) {
  const { t, d } = useI18n();
  const bottom = useBottomSpace();
  const { height } = useWindowDimensions();
  const [chats, setChats] = useState<Conversation[] | null>(null);
  const [q, setQ] = useState('');
  const [state, setState] = useState<Record<string, 'sending' | 'sent'>>({});

  useEffect(() => {
    chat
      .list()
      .then((l) => setChats(l.filter((c) => c.id !== currentChat)))
      .catch((e) => {
        setChats([]);
        Alert.alert('', errorMessage(e));
      });
  }, [currentChat]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!chats) return [];
    if (!s) return chats;
    return chats.filter((c) => {
      const o = c.members?.[0];
      return chatTitle(c, '').toLowerCase().includes(s) || (o?.username ?? '').toLowerCase().includes(s);
    });
  }, [chats, q]);

  async function send(c: Conversation) {
    if (state[c.id]) return;
    setState((x) => ({ ...x, [c.id]: 'sending' }));
    try {
      await chat.forward(message, [c.id]);
      setState((x) => ({ ...x, [c.id]: 'sent' }));
    } catch (e) {
      setState((x) => {
        const n = { ...x };
        delete n[c.id];
        return n;
      });
      Alert.alert('', errorMessage(e));
    }
  }

  const preview = message.body || (message.media_type === 'video' ? `🎬 ${t('video')}` : message.media_type === 'audio' ? '🎤' : message.post ? '📰' : `📷 ${t('photo')}`);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={[st.sheet, { height: Math.round(height * 0.75), paddingBottom: bottom }]}>
        <View style={st.handle} />
        <View style={[st.top, { flexDirection: d.row }]}>
          <Text style={st.title}>{t('forward')}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={st.done}>{t('done')}</Text>
          </Pressable>
        </View>
        <Text style={[st.preview, { textAlign: d.align }]} numberOfLines={2}>
          {preview}
        </Text>
        <View style={[st.search, { flexDirection: d.row }]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder={t('emoji_search')} placeholderTextColor={colors.muted} style={[st.input, { textAlign: d.align }]} />
        </View>
        {!chats ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={st.empty}>{t('no_chats')}</Text>}
            renderItem={({ item }) => {
              const o = item.members?.[0];
              const s = state[item.id];
              return (
                <View style={[st.row, { flexDirection: d.row }]}>
                  {item.is_group ? (
                    <View style={st.group}>
                      <Ionicons name="people" size={20} color="#fff" />
                    </View>
                  ) : (
                    <Avatar uri={avatarUrl(o?.photo_path)} name={o?.first_name} size={44} />
                  )}
                  <Text style={[st.name, { textAlign: d.align }]} numberOfLines={1}>
                    {chatTitle(item, t('group_word'))}
                  </Text>
                  <Pressable onPress={() => send(item)} disabled={!!s} style={[st.btn, s === 'sent' && st.btnSent]}>
                    {s === 'sending' ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <Text style={[st.btnText, s === 'sent' && { color: colors.muted }]}>{s === 'sent' ? t('sent_word') : t('send')}</Text>
                    )}
                  </Pressable>
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 8 },
  top: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  done: { fontSize: 15, fontWeight: '700', color: colors.primary },
  preview: { marginHorizontal: 16, marginBottom: 8, color: colors.muted, backgroundColor: colors.surface, borderRadius: radius.md, padding: 10 },
  search: { alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.lg, marginHorizontal: 12, paddingHorizontal: 12, height: 40, marginBottom: 6 },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  row: { alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  group: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  btn: { backgroundColor: colors.surface, borderRadius: radius.full, paddingHorizontal: 18, paddingVertical: 7, minWidth: 74, alignItems: 'center' },
  btnSent: { backgroundColor: 'transparent' },
  btnText: { fontWeight: '700', color: colors.text },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 30 },
});
