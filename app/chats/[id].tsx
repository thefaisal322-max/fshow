import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as ScreenCapture from 'expo-screen-capture';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
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
import { EmojiPicker } from '@/components/EmojiPicker';
import { ForwardSheet } from '@/components/ForwardSheet';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { FeedVideo } from '@/components/Video';
import { VoiceMessage, VoiceRecorder } from '@/components/Voice';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { calls } from '@/lib/calls';
import { Attachment, chat, chatFileUrl, chatInfo, ChatInfo, ChatMember, Message, REACTIONS, Reaction } from '@/lib/chat';
import { useUnread } from '@/lib/notifications';
import { isOnline, presenceText, usePresence } from '@/lib/presence';
import { downloadToCache, extOf, galleryPermission, saveToGallery } from '@/lib/download';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { authorName, PostPreview, postImageUrl, social } from '@/lib/social';
import { avatarUrl, supabase } from '@/lib/supabase';
import { colors, radius } from '@/theme';

type Viewer = { kind: 'image' | 'video'; url: string; body?: string; once?: boolean } | { kind: 'text'; body: string; once: true };

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, d } = useI18n();
  const { session, profile } = useAuth();
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
  const [recording, setRecording] = useState(false);
  const [picker, setPicker] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);

  /** photo / video from the chat → the phone's gallery (as sent, private chats get no watermark) */
  async function saveMedia(m: Message) {
    try {
      if (!m.media_path) return;
      if (!(await galleryPermission())) {
        Alert.alert('', t('gallery_permission'));
        return;
      }
      const url = await chatFileUrl(m.media_path);
      if (!url) throw new Error('network');
      const local = await downloadToCache(url, extOf(m.media_path));
      await saveToGallery(local);
      Alert.alert('', t('saved_gallery'));
    } catch (e) {
      Alert.alert('', errorMessage(e));
    }
  }
  const loadingOlder = useRef(false);
  const lastMineId = msgs.find((m) => m.sender_id === me && !m.deleted)?.id;

  const others = info?.members ?? [];
  const other = !info?.is_group ? others[0] : undefined;
  const blocked = !!other && (other.blocked_by_me || other.blocked_me);
  const [typing, setTyping] = useState<string | null>(null);
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presence = usePresence(other ? [other.id] : []);
  const otherSeen = other ? presence[other.id] : null;
  const title = info?.is_group ? info.title ?? t('chats') : others[0] ? authorName(others[0]) : t('chats');

  /** Reload the newest page and merge it with what we already have (keeps older pages). */
  const refreshLatest = useCallback(async () => {
    try {
      const page = await chat.messages(id);
      if (page.length < 40) setOlder(false);
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
    const loadInfo = () => chatInfo(id).then(setInfo).catch(() => {});
    loadInfo();
    refreshLatest();
    // Live updates for this chat (Row Level Security limits them to members):
    // new/changed messages, reactions, read receipts ("Seen") and typing.
    const ch = supabase
      .channel(`chat:${id}`, { config: { broadcast: { self: false } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, () => {
        setTyping(null);
        refreshLatest();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => refreshLatest())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${id}` }, () => loadInfo())
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.user === me) return;
        setTyping(String(payload.name ?? ''));
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(null), 3500);
      })
      .subscribe();
    channel.current = ch;
    return () => {
      channel.current = null;
      supabase.removeChannel(ch);
    };
  }, [id, refreshLatest]);

  /** Tell the others "I am typing" (at most every 2 s). */
  function onType(v: string) {
    setText(v);
    const now = Date.now();
    if (v && now - lastTypingSent.current > 2000 && channel.current) {
      lastTypingSent.current = now;
      channel.current.send({ type: 'broadcast', event: 'typing', payload: { user: me, name: profile?.firstName ?? '' } });
    }
  }

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

  /** 📞 / 🎥 — start a call (direct chats) */
  async function startCall(video: boolean) {
    try {
      const c = await calls.start(id, video);
      if (c.status === 'busy') {
        Alert.alert('', t('user_busy', { name: others[0]?.first_name ?? '' }));
        refreshLatest();
        return;
      }
      router.push({ pathname: '/call/[id]', params: { id: c.id, role: 'caller' } });
    } catch (e) {
      Alert.alert('', errorMessage(e));
    }
  }

  /** 👍 button (when nothing is typed) — sends a big thumbs-up like Messenger */
  async function sendLike() {
    if (sending) return;
    setSending(true);
    try {
      await chat.send(id, { body: '👍', replyTo: replyTo?.id });
      setReplyTo(null);
      await refreshLatest();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function sendVoice(uri: string) {
    setRecording(false);
    setSending(true);
    try {
      await chat.send(id, { body: '', attachment: { uri, type: 'audio', mime: 'audio/mp4' }, replyTo: replyTo?.id });
      setReplyTo(null);
      await refreshLatest();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function react(m: Message, emoji: Reaction) {
    setAction(null);
    setPicker(null);
    const off = m.my_reaction === emoji;
    // show it right away
    setMsgs((old) =>
      old.map((x) => {
        if (x.id !== m.id) return x;
        const r = { ...(x.reactions ?? {}) };
        if (x.my_reaction) r[x.my_reaction] = Math.max(0, (r[x.my_reaction] ?? 1) - 1);
        if (!off) r[emoji] = (r[emoji] ?? 0) + 1;
        for (const k of Object.keys(r)) if (!r[k]) delete r[k];
        return { ...x, reactions: r, my_reaction: off ? null : emoji };
      }),
    );
    try {
      await chat.react(m.id, off ? null : emoji, me);
      await refreshLatest();
    } catch (e) {
      Alert.alert('', errorMessage(e));
      refreshLatest();
    }
  }

  /** Delete for you (only you stop seeing it) · Delete for everyone (your own messages) */
  function remove(m: Message) {
    setAction(null);
    const forMe = async () => {
      setMsgs((old) => old.filter((x) => x.id !== m.id));
      try {
        await chat.hide(m.id);
      } catch (e) {
        Alert.alert('', errorMessage(e));
        refreshLatest();
      }
    };
    const forAll = async () => {
      try {
        await chat.remove(m.id);
        await refreshLatest();
      } catch (e) {
        Alert.alert('', errorMessage(e));
      }
    };
    Alert.alert(t('delete_msg_q'), '', [
      ...(m.sender_id === me && !m.deleted ? [{ text: t('delete_for_everyone'), style: 'destructive' as const, onPress: forAll }] : []),
      { text: t('delete_for_me'), style: 'destructive' as const, onPress: forMe },
      { text: t('cancel'), style: 'cancel' as const },
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
        <View>
          <Avatar uri={avatarUrl(others[0]?.photo_path)} name={others[0]?.first_name} size={34} />
          {isOnline(otherSeen) ? <View style={st.onlineDot} /> : null}
        </View>
      )}
      <View style={{ alignItems: d.items }}>
        <Text style={{ fontWeight: '800', fontSize: 16, color: colors.text }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ fontSize: 11, color: colors.muted }}>
          {typing
            ? `${info?.is_group ? typing + ' ' : ''}${t('typing')}`
            : info?.is_group
              ? t('members_n', { n: others.length + 1 })
              : presenceText(otherSeen) || (others[0]?.username ? `@${others[0].username}` : '')}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.card }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen
        options={{
          headerTitle,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 6 }}>
              {info && !info.is_group && !blocked ? (
                <>
                  <Pressable onPress={() => startCall(false)} hitSlop={8}>
                    <Ionicons name="call" size={23} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => startCall(true)} hitSlop={8}>
                    <Ionicons name="videocam" size={25} color={colors.primary} />
                  </Pressable>
                </>
              ) : null}
              <Pressable onPress={() => router.push({ pathname: '/chats/info/[id]', params: { id } })} hitSlop={10}>
                <Ionicons name="information-circle" size={26} color={colors.primary} />
              </Pressable>
            </View>
          ),
        }}
      />
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
          ListHeaderComponent={typing ? <Text style={st.typing}>{info?.is_group ? `${typing} ` : ''}{t('typing')}</Text> : null}
          ListFooterComponent={info && !older ? <ChatIntro info={info} /> : null}
          renderItem={({ item, index }) => (
            <>
              <Bubble
                m={item}
                mine={item.sender_id === me}
                showName={!!info?.is_group && item.sender_id !== me && msgs[index + 1]?.sender_id !== item.sender_id}
                onLongPress={() => setAction(item)}
                onOpenOnce={() => openOnce(item)}
                onOpenMedia={(v) => setViewer(v)}
                onCallBack={(video) => startCall(video)}
              />
              {item.id === lastMineId ? <SeenBy message={item} members={others} isGroup={!!info?.is_group} /> : null}
            </>
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
              {replyTo.view_once ? '🔒' : replyTo.body || (replyTo.media_type === 'video' ? '🎬' : replyTo.media_type === 'audio' ? '🎤' : '📷')}
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

      {blocked ? (
        <View style={[st.blocked, { paddingBottom: 14 + bottom }]}>
          <Text style={{ color: colors.muted, textAlign: 'center' }}>{other?.blocked_by_me ? t('blocked_banner') : t('blocked_me_banner')}</Text>
          {other?.blocked_by_me ? (
            <Pressable
              onPress={async () => {
                try {
                  await social.block(other.id, false);
                  setInfo(await chatInfo(id));
                } catch (e) {
                  Alert.alert('', errorMessage(e));
                }
              }}
              style={st.unblockBtn}
            >
              <Text style={{ color: colors.primary, fontWeight: '800' }}>{t('unblock')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : recording ? (
        <View style={[st.composer, { paddingBottom: 8 + bottom, padding: 0 }]}>
          <VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} />
        </View>
      ) : (
      <View style={[st.composer, { flexDirection: d.row, paddingBottom: 8 + bottom }]}>
        <Pressable onPress={pick} hitSlop={6} style={st.iconBtn}>
          <Ionicons name="image" size={24} color={colors.primary} />
        </Pressable>
        <Pressable onPress={() => setViewOnce((v) => !v)} hitSlop={6} style={st.iconBtn}>
          <Ionicons name={viewOnce ? 'lock-closed' : 'lock-open-outline'} size={22} color={viewOnce ? colors.primary : colors.muted} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={onType}
          placeholder={t('type_message')}
          placeholderTextColor={colors.muted}
          multiline
          maxLength={4000}
          style={[st.input, { textAlign: d.align, writingDirection: d.writing }]}
        />
        {!text.trim() && !attachment && !sending ? (
          <>
            <Pressable onPress={() => setRecording(true)} hitSlop={6} style={st.iconBtn}>
              <Ionicons name="mic" size={24} color={colors.primary} />
            </Pressable>
            <Pressable onPress={sendLike} hitSlop={6} style={st.iconBtn}>
              <Ionicons name="thumbs-up" size={25} color={colors.primary} />
            </Pressable>
          </>
        ) : (
        <Pressable onPress={send} disabled={sending || (!text.trim() && !attachment)} style={[st.iconBtn, { opacity: text.trim() || attachment ? 1 : 0.4 }]}>
          {sending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Ionicons name="send" size={22} color={colors.primary} style={d.rtl ? { transform: [{ scaleX: -1 }] } : undefined} />
          )}
        </Pressable>
        )}
      </View>
      )}

      {/* long-press: quick reactions on top, actions at the bottom (like Messenger) */}
      <Modal visible={!!action} transparent animationType="fade" onRequestClose={() => setAction(null)}>
        <Pressable style={st.backdrop} onPress={() => setAction(null)} />
        {action ? (
          <View style={[st.sheetWrap, { paddingBottom: bottom }]} pointerEvents="box-none">
            {!action.deleted ? (
              <View style={[st.reactBar, { flexDirection: d.row }]}>
                {REACTIONS.map((e) => (
                  <Pressable key={e} onPress={() => react(action, e)} style={[st.emoji, action.my_reaction === e && { backgroundColor: colors.soft }]}>
                    <Text style={{ fontSize: 30 }}>{e}</Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => {
                    setPicker(action);
                    setAction(null);
                  }}
                  style={[st.emoji, st.plus, action.my_reaction && !(REACTIONS as readonly string[]).includes(action.my_reaction) && { backgroundColor: colors.soft }]}
                >
                  {action.my_reaction && !(REACTIONS as readonly string[]).includes(action.my_reaction) ? (
                    <Text style={{ fontSize: 24 }}>{action.my_reaction}</Text>
                  ) : (
                    <Ionicons name="add" size={24} color={colors.text} />
                  )}
                </Pressable>
              </View>
            ) : null}
            <View style={[st.actionBar, { flexDirection: d.row }]}>
              {!action.deleted ? (
                <BarItem icon="arrow-undo" label={t('reply')} onPress={() => { setReplyTo(action); setAction(null); }} />
              ) : null}
              {action.body && !action.view_once && !action.deleted ? (
                <BarItem icon="copy" label={t('copy')} onPress={() => { Clipboard.setStringAsync(action.body); setAction(null); }} />
              ) : null}
              {!action.deleted && !action.view_once ? (
                <BarItem icon="arrow-redo" label={t('forward')} onPress={() => { setForwarding(action); setAction(null); }} />
              ) : null}
              {!action.deleted && !action.view_once && action.media_path && action.media_type !== 'audio' ? (
                <BarItem icon="download" label={t('save')} onPress={() => { const m = action; setAction(null); saveMedia(m); }} />
              ) : null}
              <BarItem icon="trash" label={t('delete')} color={colors.error} onPress={() => remove(action)} />
            </View>
          </View>
        ) : null}
      </Modal>

      <EmojiPicker
        visible={!!picker}
        quick={REACTIONS}
        selected={picker?.my_reaction}
        onClose={() => setPicker(null)}
        onPick={(e) => picker && react(picker, e)}
      />
      {forwarding ? <ForwardSheet message={forwarding} currentChat={id} onClose={() => setForwarding(null)} /> : null}

      {/* photo / video viewer */}
      <Modal visible={!!viewer && !viewer.once} transparent={false} animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={st.viewer}>
          {viewer?.kind === 'image' ? <Image source={{ uri: viewer.url }} style={{ flex: 1 }} resizeMode="contain" /> : null}
          {viewer?.kind === 'video' ? <FeedVideo uri={viewer.url} style={{ flex: 1 }} /> : null}
          {viewer && viewer.body ? <Text style={st.viewerText}>{viewer.body}</Text> : null}
          <Pressable style={st.viewerClose} onPress={() => setViewer(null)} hitSlop={10}>
            <Ionicons name="close" size={30} color="#fff" />
          </Pressable>
        </View>
      </Modal>
      {/* view once: drawn inside this screen (not a Modal window) so screenshots and screen recording are blocked */}
      {viewer?.once ? <OnceViewer viewer={viewer} onClose={() => setViewer(null)} /> : null}
    </KeyboardAvoidingView>
  );
}

function BarItem({ icon, label, onPress, color = colors.primary }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={st.barItem} hitSlop={4}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[st.barText, { color: color === colors.primary ? colors.text : color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** View-once content. While it is open the phone blocks screenshots and screen recording (black image). */
function OnceViewer({ viewer, onClose }: { viewer: Viewer; onClose: () => void }) {
  const { t } = useI18n();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync('view-once').catch(() => {});
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      close.current();
      return true;
    });
    // iPhone cannot block a screenshot fully — close it if one is taken
    const shot = ScreenCapture.addScreenshotListener(() => close.current());
    return () => {
      back.remove();
      shot.remove();
      ScreenCapture.allowScreenCaptureAsync('view-once').catch(() => {});
    };
  }, []);
  return (
    <View style={[StyleSheet.absoluteFill, st.viewer, { zIndex: 50, elevation: 50 }]}>
      {viewer.kind === 'image' ? <Image source={{ uri: viewer.url }} style={{ flex: 1 }} resizeMode="contain" /> : null}
      {viewer.kind === 'video' ? <FeedVideo uri={viewer.url} style={{ flex: 1 }} /> : null}
      {viewer.body ? <Text style={st.viewerText}>{viewer.body}</Text> : null}
      <Text style={st.viewerNote}>🔒 {t('once_closes')} · {t('no_screenshots')}</Text>
      <Pressable style={st.viewerClose} onPress={onClose} hitSlop={10}>
        <Ionicons name="close" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

function Bubble({
  m,
  mine,
  showName,
  onLongPress,
  onOpenOnce,
  onOpenMedia,
  onCallBack,
}: {
  m: Message;
  mine: boolean;
  showName: boolean;
  onLongPress: () => void;
  onOpenOnce: () => void;
  onOpenMedia: (v: Viewer) => void;
  onCallBack: (video: boolean) => void;
}) {
  const { t, d } = useI18n();
  // My messages sit on the reading-end side (right in English, left in Pashto/Dari).
  const end = mine !== d.rtl;
  const bg = mine ? colors.primary : colors.surface;
  const fg = mine ? '#fff' : colors.text;
  const reactions = Object.entries(m.reactions ?? {});

  if (m.call) return <CallLine m={m} onLongPress={onLongPress} onCallBack={onCallBack} />;

  let content: ReactNode;
  if (m.deleted) {
    content = (
      <Text style={[st.body, { color: colors.muted, fontStyle: 'italic' }]}>
        {mine ? t('you_deleted_msg') : t('x_deleted_msg', { name: m.sender.first_name })}
      </Text>
    );
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
        {m.media_path && m.media_type === 'audio' ? <VoiceMessage path={m.media_path} mine={mine} /> : null}
        {m.media_path && (m.media_type === 'image' || m.media_type === 'video') ? (
          <ChatMedia path={m.media_path} type={m.media_type} onOpen={onOpenMedia} />
        ) : null}
        {m.post ? <SharedPostCard p={m.post} /> : null}
        {m.body ? <Text style={[st.body, { color: fg, textAlign: d.align, writingDirection: d.writing }]}>{m.body}</Text> : null}
      </>
    );
  }

  return (
    <View style={{ alignItems: end ? 'flex-end' : 'flex-start', marginVertical: 2 }}>
      {showName ? <Text style={st.sender}>{m.sender.first_name}</Text> : null}
      {m.forwarded && !m.deleted ? (
        <View style={[st.fwd, { flexDirection: d.row }, mine ? null : { marginHorizontal: 40 }]}>
          <Ionicons name="arrow-redo" size={11} color={colors.muted} />
          <Text style={st.fwdText}>{mine ? t('you_forwarded') : t('forwarded')}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: end ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6, maxWidth: '82%' }}>
        {!mine ? <Avatar uri={avatarUrl(m.sender.photo_path)} name={m.sender.first_name} size={26} /> : null}
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={250}
          style={[
            st.bubble,
            // a voice message alone is its own pill (no bubble around it)
            m.media_type === 'audio' && !m.body && !m.reply && !m.post && !m.deleted
              ? { backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 }
              : m.deleted
                ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }
                : { backgroundColor: bg },
          ]}
        >
          {m.reply ? (
            <View style={[st.quote, { borderColor: mine ? '#fff' : colors.primary }]}>
              <Text style={{ color: mine ? '#dfe9fb' : colors.muted, fontSize: 12 }} numberOfLines={2}>
                {m.reply.deleted ? t('deleted_msg') : m.reply.body || (m.reply.media_type === 'video' ? '🎬' : m.reply.media_type === 'audio' ? '🎤' : '📷')}
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

/** "📞 Video call · 2:31" / "Missed call — Call back" in the middle of the chat. */
function CallLine({ m, onLongPress, onCallBack }: { m: Message; onLongPress: () => void; onCallBack: (video: boolean) => void }) {
  const { t, d } = useI18n();
  const { session } = useAuth();
  const c = m.call!;
  const iCalled = c.caller_id === session?.user.id;
  const failed = c.status === 'missed' || c.status === 'declined' || c.status === 'busy';
  const mm = Math.floor(c.seconds / 60);
  const ss = String(c.seconds % 60).padStart(2, '0');
  const title = failed
    ? iCalled
      ? c.status === 'declined'
        ? t('call_declined')
        : c.status === 'busy'
          ? t('busy_word')
          : t('no_answer')
      : t('missed_call')
    : c.video
      ? t('video_call')
      : t('audio_call');
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={250} onPress={() => onCallBack(c.video)} style={st.callLine}>
      <View style={[st.callIcon, failed && { backgroundColor: '#E5383B' }]}>
        <Ionicons name={c.video ? 'videocam' : 'call'} size={16} color="#fff" />
      </View>
      <View style={{ alignItems: d.items }}>
        <Text style={st.callTitle}>{title}</Text>
        <Text style={st.callSub}>
          {failed ? t('call_back') : `${mm}:${ss}`}
        </Text>
      </View>
    </Pressable>
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
  onlineDot: { position: 'absolute', right: 0, bottom: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: '#31A24C', borderWidth: 2, borderColor: colors.card },
  groupAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, flexShrink: 1 },
  body: { fontSize: 16, lineHeight: 22 },
  sender: { fontSize: 11, color: colors.muted, marginHorizontal: 40, marginBottom: 2 },
  quote: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 6, opacity: 0.9 },
  media: { width: 220, height: 220, borderRadius: 12, marginBottom: 4, backgroundColor: colors.border },
  reactions: { flexDirection: 'row', gap: 2, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 1, marginTop: -6, elevation: 2, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  replyBar: { alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  attach: { alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.bg },
  attachThumb: { width: 46, height: 46, borderRadius: 8 },
  composer: { alignItems: 'flex-end', gap: 4, padding: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  iconBtn: { padding: 6, paddingBottom: 9 },
  input: { flex: 1, backgroundColor: colors.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: 16, maxHeight: 120, color: colors.text },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  reactBar: { alignSelf: 'center', alignItems: 'center', gap: 2, backgroundColor: colors.card, borderRadius: 30, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 14, elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  plus: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
  actionBar: { backgroundColor: colors.card, justifyContent: 'space-around', paddingTop: 12, paddingBottom: 10, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  barItem: { alignItems: 'center', gap: 4, minWidth: 64 },
  barText: { fontSize: 12, fontWeight: '600' },
  fwd: { alignItems: 'center', gap: 3, marginBottom: 2 },
  callLine: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, marginVertical: 6 },
  callIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  callTitle: { fontWeight: '700', color: colors.text, fontSize: 14 },
  callSub: { color: colors.muted, fontSize: 12 },
  fwdText: { fontSize: 11, color: colors.muted },
  menu: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 10 },
  emojis: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 6, marginBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  emoji: { padding: 4, borderRadius: 20 },
  menuItem: { alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 10 },
  viewer: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  viewerText: { color: '#fff', fontSize: 18, textAlign: 'center', padding: 20 },
  viewerNote: { color: '#bbb', fontSize: 12, textAlign: 'center', paddingBottom: 30 },
  viewerClose: { position: 'absolute', top: 40, right: 20 },
  typing: { color: colors.muted, fontStyle: 'italic', fontSize: 13, marginVertical: 6, marginHorizontal: 6 },
  intro: { alignItems: 'center', paddingVertical: 26 },
  introName: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 6 },
  introSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  introBtn: { marginTop: 12, backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 8 },
  blocked: { alignItems: 'center', gap: 8, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  unblockBtn: { backgroundColor: colors.soft, borderRadius: radius.full, paddingHorizontal: 18, paddingVertical: 7 },
  postCard: { width: 230, backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden', marginVertical: 4 },
});

/** Top of the conversation (like Messenger): photo, name and whether you are friends. */
function ChatIntro({ info }: { info: ChatInfo }) {
  const router = useRouter();
  const { t } = useI18n();
  const o = info.members?.[0];
  if (info.is_group) {
    return (
      <View style={st.intro}>
        <View style={[st.groupAvatar, { width: 80, height: 80, borderRadius: 40 }]}>
          <Ionicons name="people" size={40} color="#fff" />
        </View>
        <Text style={st.introName}>{info.title}</Text>
        <Text style={st.introSub}>{t('members_n', { n: (info.members?.length ?? 0) + 1 })}</Text>
      </View>
    );
  }
  if (!o) return null;
  const status = o.followed_by_me && o.follows_me ? t('friends_on_app') : o.followed_by_me ? t('you_follow') : o.follows_me ? t('follows_you') : t('not_connected');
  return (
    <View style={st.intro}>
      <Avatar uri={avatarUrl(o.photo_path)} name={o.first_name} size={86} />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <Text style={st.introName}>{authorName(o)}</Text>
        {o.is_fainet ? <VerifiedBadge size={16} /> : null}
      </View>
      {o.username ? <Text style={st.introSub}>@{o.username}</Text> : null}
      <Text style={[st.introSub, { marginTop: 4 }]}>
        {o.followed_by_me && o.follows_me ? '🤝 ' : ''}
        {status}
      </Text>
      <Pressable style={st.introBtn} onPress={() => router.push({ pathname: '/user/[id]', params: { id: o.id } })}>
        <Text style={{ fontWeight: '700', color: colors.text }}>{t('view_profile')}</Text>
      </Pressable>
    </View>
  );
}

/** "Seen" under my last message (1-to-1), or small faces of who read it (groups). */
function SeenBy({ message, members, isGroup }: { message: Message; members: ChatMember[]; isGroup: boolean }) {
  const { t, d } = useI18n();
  const readers = members.filter((m) => new Date(m.last_read_at).getTime() >= new Date(message.created_at).getTime());
  if (!readers.length) return null;
  return (
    <View style={{ flexDirection: d.rtl ? 'row' : 'row-reverse', alignItems: 'center', gap: 3, marginTop: 2, marginHorizontal: 4 }}>
      {isGroup ? (
        readers.slice(0, 6).map((r) => <Avatar key={r.id} uri={avatarUrl(r.photo_path)} name={r.first_name} size={14} />)
      ) : (
        <>
          <Avatar uri={avatarUrl(readers[0].photo_path)} name={readers[0].first_name} size={14} />
          <Text style={{ fontSize: 11, color: colors.muted }}>{t('seen')}</Text>
        </>
      )}
    </View>
  );
}

/** A post that someone sent into the chat. */
function SharedPostCard({ p }: { p: PostPreview }) {
  const router = useRouter();
  const img = postImageUrl(p.image_path);
  return (
    <Pressable onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })} style={st.postCard}>
      {img ? <Image source={{ uri: img }} style={{ width: '100%', height: 140 }} resizeMode="cover" /> : null}
      {p.video_path ? (
        <View style={{ width: '100%', height: 140, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="play-circle" size={44} color="#fff" />
        </View>
      ) : null}
      <View style={{ padding: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Avatar uri={avatarUrl(p.author.photo_path)} name={p.author.first_name} size={20} />
          <Text style={{ fontWeight: '700', fontSize: 13, color: colors.text }} numberOfLines={1}>
            {authorName(p.author)}
          </Text>
        </View>
        {p.body ? (
          <Text style={{ fontSize: 13, color: colors.text, marginTop: 4 }} numberOfLines={3}>
            {p.body}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
