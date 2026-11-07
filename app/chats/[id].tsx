import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Avatar } from '@/components/Avatar';
import { FeedVideo } from '@/components/Video';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Attachment, chat, chatFileUrl, chatInfo, ChatInfo, Message, REACTIONS, Reaction } from '@/lib/chat';
import { useUnread } from '@/lib/notifications';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { authorName } from '@/lib/social';
import { avatarUrl, supabase } from '@/lib/supabase';
import { colors, radius } from '@/theme';

type Viewer = { kind: 'image' | 'video'; url: string; body?: string; once?: boolean } | { kind: 'text'; body: string; once: true };

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, d } = useI18n();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const { refreshChats } = useUnread();
  const bottom = useBottomSpace();

  const [info, setInfo] = useState<ChatInfo | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [older, setOlder] = useState(true);
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [viewOnce, setViewOnce] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const [action, setAction] = useState<Message | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const loadingOlder = useRef(false);

  const others = info?.members.filter((m) => m.id !== me) ?? [];
  const title = info?.is_group ? info.title ?? t('chats') : others[0] ? authorName(others[0]) : t('chats');

  /** Reload the newest page and merge it with what we already have (keeps older pages). */
  const refreshLatest = useCallback(async () => {
    try {
      const page = await chat.messages(id);
      setMsgs((old) => {
        if (!page.length) return old;
        const oldestNew = page[page.length - 1].created_at;
        const keep = old.filter((m) => m.created_at < oldestNew && !page.some((p) => p.id === m.id));
        return [...page, ...keep];
      });
      chat.markRead(id).then(refreshChats).catch(() => {});
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, refreshChats]);

  useEffect(() => {
    chatInfo(id).then(setInfo).catch(() => {});
    refreshLatest();
    // Live updates for this chat (Row Level Security limits them to members).
    const ch = supabase
      .channel(`chat:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, () => refreshLatest())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => refreshLatest())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, refreshLatest]);

  async function loadOlder() {
    if (loadingOlder.current || !older || !msgs.length) return;
    loadingOlder.current = true;
    try {
      const page = await chat.messages(id, msgs[msgs.length - 1].created_at);
      setMsgs((old) => [...old, ...page.filter((p) => !old.some((o) => o.id === p.id))]);
      setOlder(page.length >= 40);
    } catch {
      // ignore
    } finally {
      loadingOlder.current = false;
    }
  }

  async function pick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('', t('photos_permission'));
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    if (a.type === 'video' && a.fileSize && a.fileSize > 25 * 1024 * 1024) return Alert.alert('', t('e_video_big'));
    setAttachment({ uri: a.uri, type: a.type === 'video' ? 'video' : 'image', mime: a.mimeType, size: a.fileSize });
  }

  async function send() {
    if (sending || (!text.trim() && !attachment)) return;
    setSending(true);
    try {
      await chat.send(id, { body: text, attachment, replyTo: replyTo?.id, viewOnce });
      setText('');
      setAttachment(null);
      setReplyTo(null);
      setViewOnce(false);
      await refreshLatest();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function react(m: Message, emoji: Reaction) {
    setAction(null);
    try {
      await chat.react(m.id, m.my_reaction === emoji ? null : emoji, me);
      await refreshLatest();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    }
  }

  function remove(m: Message) {
    setAction(null);
    Alert.alert(t('delete_for_everyone'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await chat.remove(m.id);
            await refreshLatest();
          } catch (e) {
            Alert.alert('', errorMessage(e));
          }
        },
      },
    ]);
  }

  async function openOnce(m: Message) {
    try {
      const r = await chat.openOnce(m.id);
      setMsgs((old) => old.map((x) => (x.id === m.id ? { ...x, opened: true } : x)));
      if (r.url && r.mediaType) setViewer({ kind: r.mediaType, url: r.url, body: r.body, once: true });
      else setViewer({ kind: 'text', body: r.body, once: true });
    } catch (e) {
      Alert.alert('', errorMessage(e));
      refreshLatest();
    }
  }

  const headerTitle = () => (
    <Pressable
      onPress={() => !info?.is_group && others[0] && router.push({ pathname: '/user/[id]', params: { id: others[0].id } })}
      style={{ flexDirection: d.row, alignItems: 'center', gap: 8 }}
    >
      {info?.is_group ? (
        <View style={st.groupAvatar}>
          <Ionicons name="people" size={18} color="#fff" />
        </View>
      ) : (
        <Avatar uri={avatarUrl(others[0]?.photo_path)} name={others[0]?.first_name} size={34} />
      )}
      <View style={{ alignItems: d.items }}>
        <Text style={{ fontWeight: '800', fontSize: 16, color: colors.text }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ fontSize: 11, color: colors.muted }}>
          {info?.is_group ? t('members_n', { n: info.members.length }) : others[0]?.username ? `@${others[0].username}` : ''}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.card }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ headerTitle }} />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={msgs}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 10 }}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.4}
          renderItem={({ item, index }) => (
            <Bubble
              m={item}
              mine={item.sender_id === me}
              showName={!!info?.is_group && item.sender_id !== me && msgs[index + 1]?.sender_id !== item.sender_id}
              onLongPress={() => !item.deleted && setAction(item)}
              onOpenOnce={() => openOnce(item)}
              onOpenMedia={(v) => setViewer(v)}
            />
          )}
        />
      )}

      {replyTo ? (
        <View style={[st.replyBar, { flexDirection: d.row }]}>
          <View style={{ flex: 1, alignItems: d.items }}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>
              {t('replying_to', { name: replyTo.sender_id === me ? t('you') : replyTo.sender.first_name })}
            </Text>
            <Text style={{ color: colors.muted }} numberOfLines={1}>
              {replyTo.view_once ? '🔒' : replyTo.body || (replyTo.media_type === 'video' ? '🎬' : '📷')}
            </Text>
          </View>
          <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      {attachment ? (
        <View style={[st.attach, { flexDirection: d.row }]}>
          {attachment.type === 'image' ? (
            <Image source={{ uri: attachment.uri }} style={st.attachThumb} />
          ) : (
            <View style={[st.attachThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }]}>
              <Ionicons name="videocam" size={22} color="#fff" />
            </View>
          )}
          <Text style={{ flex: 1, color: colors.muted, textAlign: d.align }}>{viewOnce ? t('view_once_on') : attachment.type === 'image' ? t('photo') : t('video')}</Text>
          <Pressable onPress={() => setAttachment(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color={colors.muted} />
          </Pressable>
        </View>
      ) : viewOnce ? (
        <Text style={{ color: colors.primary, textAlign: 'center', fontSize: 12, paddingTop: 4 }}>{t('view_once_on')}</Text>
      ) : null}

      <View style={[st.composer, { flexDirection: d.row, paddingBottom: 8 + bottom }]}>
        <Pressable onPress={pick} hitSlop={6} style={st.iconBtn}>
          <Ionicons name="image" size={24} color={colors.primary} />
        </Pressable>
        <Pressable onPress={() => setViewOnce((v) => !v)} hitSlop={6} style={st.iconBtn}>
          <Ionicons name={viewOnce ? 'lock-closed' : 'lock-open-outline'} size={22} color={viewOnce ? colors.primary : colors.muted} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('type_message')}
          placeholderTextColor={colors.muted}
          multiline
          maxLength={4000}
          style={[st.input, { textAlign: d.align, writingDirection: d.writing }]}
        />
        <Pressable onPress={send} disabled={sending || (!text.trim() && !attachment)} style={[st.iconBtn, { opacity: text.trim() || attachment ? 1 : 0.4 }]}>
          {sending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Ionicons name="send" size={22} color={colors.primary} style={d.rtl ? { transform: [{ scaleX: -1 }] } : undefined} />
          )}
        </Pressable>
      </View>

      {/* long-press menu */}
      <Modal visible={!!action} transparent animationType="fade" onRequestClose={() => setAction(null)}>
        <Pressable style={st.backdrop} onPress={() => setAction(null)}>
          {action ? (
            <View style={st.menu}>
              <View style={st.emojis}>
                {REACTIONS.map((e) => (
                  <Pressable key={e} onPress={() => react(action, e)} style={[st.emoji, action.my_reaction === e && { backgroundColor: '#E7F0FD' }]}>
                    <Text style={{ fontSize: 28 }}>{e}</Text>
                  </Pressable>
                ))}
              </View>
              <MenuItem icon="arrow-undo" label={t('reply')} onPress={() => { setReplyTo(action); setAction(null); }} />
              {action.body && !action.view_once ? (
                <MenuItem icon="copy-outline" label={t('copy')} onPress={() => { Clipboard.setStringAsync(action.body); setAction(null); }} />
              ) : null}
              {action.sender_id === me ? (
                <MenuItem icon="trash-outline" label={t('delete_for_everyone')} color={colors.error} onPress={() => remove(action)} />
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Modal>

      {/* photo / video / view-once viewer */}
      <Modal visible={!!viewer} transparent={false} animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={st.viewer}>
          {viewer?.kind === 'image' ? <Image source={{ uri: viewer.url }} style={{ flex: 1 }} resizeMode="contain" /> : null}
          {viewer?.kind === 'video' ? <FeedVideo uri={viewer.url} style={{ flex: 1 }} /> : null}
          {viewer && viewer.body ? <Text style={st.viewerText}>{viewer.body}</Text> : null}
          {viewer?.once ? <Text style={st.viewerNote}>🔒 {t('once_closes')}</Text> : null}
          <Pressable style={st.viewerClose} onPress={() => setViewer(null)} hitSlop={10}>
            <Ionicons name="close" size={30} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function MenuItem({ icon, label, onPress, color = colors.text }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }) {
  const { d } = useI18n();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.menuItem, { flexDirection: d.row }, pressed && { backgroundColor: colors.bg }]}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={{ fontSize: 16, color, flex: 1, textAlign: d.align }}>{label}</Text>
    </Pressable>
  );
}

function Bubble({
  m,
  mine,
  showName,
  onLongPress,
  onOpenOnce,
  onOpenMedia,
}: {
  m: Message;
  mine: boolean;
  showName: boolean;
  onLongPress: () => void;
  onOpenOnce: () => void;
  onOpenMedia: (v: Viewer) => void;
}) {
  const { t, d } = useI18n();
  // My messages sit on the reading-end side (right in English, left in Pashto/Dari).
  const end = mine !== d.rtl;
  const bg = mine ? colors.primary : '#EEF1F5';
  const fg = mine ? '#fff' : colors.text;
  const reactions = Object.entries(m.reactions ?? {});

  let content: ReactNode;
  if (m.deleted) {
    content = <Text style={[st.body, { color: mine ? '#dfe9fb' : colors.muted, fontStyle: 'italic' }]}>{t('deleted_msg')}</Text>;
  } else if (m.view_once) {
    if (mine) content = <Text style={[st.body, { color: fg }]}>{t('view_once_sent')}{m.opened ? ` · ${t('opened')}` : ''}</Text>;
    else if (m.opened) content = <Text style={[st.body, { color: colors.muted, fontStyle: 'italic' }]}>🔒 {t('opened')}</Text>;
    else
      content = (
        <Pressable onPress={onOpenOnce}>
          <Text style={[st.body, { color: colors.primary, fontWeight: '700' }]}>{t('view_once_tap')}</Text>
        </Pressable>
      );
  } else {
    content = (
      <>
        {m.media_path && m.media_type ? <ChatMedia path={m.media_path} type={m.media_type} onOpen={onOpenMedia} /> : null}
        {m.body ? <Text style={[st.body, { color: fg, textAlign: d.align, writingDirection: d.writing }]}>{m.body}</Text> : null}
      </>
    );
  }

  return (
    <View style={{ alignItems: end ? 'flex-end' : 'flex-start', marginVertical: 2 }}>
      {showName ? <Text style={st.sender}>{m.sender.first_name}</Text> : null}
      <View style={{ flexDirection: end ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6, maxWidth: '82%' }}>
        {!mine ? <Avatar uri={avatarUrl(m.sender.photo_path)} name={m.sender.first_name} size={26} /> : null}
        <Pressable onLongPress={onLongPress} delayLongPress={250} style={[st.bubble, { backgroundColor: bg }]}>
          {m.reply ? (
            <View style={[st.quote, { borderColor: mine ? '#fff' : colors.primary }]}>
              <Text style={{ color: mine ? '#dfe9fb' : colors.muted, fontSize: 12 }} numberOfLines={2}>
                {m.reply.deleted ? t('deleted_msg') : m.reply.body || (m.reply.media_type === 'video' ? '🎬' : '📷')}
              </Text>
            </View>
          ) : null}
          {content}
        </Pressable>
      </View>
      {reactions.length ? (
        <View style={[st.reactions, end ? { marginRight: 8 } : { marginLeft: 36 }]}>
          {reactions.map(([e, n]) => (
            <Text key={e} style={{ fontSize: 13 }}>
              {e}
              {n > 1 ? n : ''}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ChatMedia({ path, type, onOpen }: { path: string; type: 'image' | 'video'; onOpen: (v: Viewer) => void }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    chatFileUrl(path).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [path]);
  if (!url) return <View style={[st.media, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={colors.muted} /></View>;
  if (type === 'image') {
    return (
      <Pressable onPress={() => onOpen({ kind: 'image', url })}>
        <Image source={{ uri: url }} style={st.media} resizeMode="cover" />
      </Pressable>
    );
  }
  return (
    <Pressable onPress={() => onOpen({ kind: 'video', url })} style={[st.media, { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name="play-circle" size={54} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 12 }}>{t('video_tap')}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  groupAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, flexShrink: 1 },
  body: { fontSize: 16, lineHeight: 22 },
  sender: { fontSize: 11, color: colors.muted, marginHorizontal: 40, marginBottom: 2 },
  quote: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 6, opacity: 0.9 },
  media: { width: 220, height: 220, borderRadius: 12, marginBottom: 4, backgroundColor: '#ddd' },
  reactions: { flexDirection: 'row', gap: 2, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 1, marginTop: -6, elevation: 2, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  replyBar: { alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  attach: { alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.bg },
  attachThumb: { width: 46, height: 46, borderRadius: 8 },
  composer: { alignItems: 'flex-end', gap: 4, padding: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  iconBtn: { padding: 6, paddingBottom: 9 },
  input: { flex: 1, backgroundColor: colors.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 16, maxHeight: 120, color: colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 },
  menu: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 10 },
  emojis: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6, marginBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  emoji: { padding: 4, borderRadius: 20 },
  menuItem: { alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10 },
  viewer: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  viewerText: { color: '#fff', fontSize: 18, textAlign: 'center', padding: 20 },
  viewerNote: { color: '#bbb', fontSize: 12, textAlign: 'center', paddingBottom: 30 },
  viewerClose: { position: 'absolute', top: 40, right: 20 },
});
