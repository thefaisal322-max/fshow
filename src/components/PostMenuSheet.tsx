import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { RefObject, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { StringKey, useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { downloadToCache, extOf, galleryPermission, saveToGallery } from '@/lib/download';
import { feedSignal, profileSignal } from '@/lib/signals';
import { authorName, Feedback, Post, postImageUrl, postLink, social, videoUrl, Visibility } from '@/lib/social';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export const VISIBILITY: { v: Visibility; icon: IconName; label: StringKey; sub: StringKey }[] = [
  { v: 'public', icon: 'earth', label: 'vis_public', sub: 'vis_public_sub' },
  { v: 'friends', icon: 'people', label: 'vis_friends', sub: 'vis_friends_sub' },
  { v: 'private', icon: 'lock-closed', label: 'vis_private', sub: 'vis_private_sub' },
];

/**
 * The "⋯" menu of a post or reel (like TikTok):
 *  everyone: Download, Copy link, Interested, Not interested, Remove from my feed, Report, Block
 *  my own:   Download, Copy link, Privacy (Public / Friends / Only me), Edit, Delete
 */
export function PostMenuSheet({
  post,
  onClose,
  onChange,
  onRemoved,
}: {
  post: Post;
  onClose: () => void;
  onChange?: (p: Post) => void;
  /** The post should disappear from this list (hidden, not interested, deleted, blocked). */
  onRemoved?: (id: string) => void;
}) {
  const { t, d } = useI18n();
  const { session } = useAuth();
  const bottom = useBottomSpace();
  const mine = post.author.id === session?.user.id;
  const [view, setView] = useState<'main' | 'privacy' | 'edit' | 'save'>('main');
  const [text, setText] = useState(post.body);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [shotUri, setShotUri] = useState<string | null>(null);
  const shot = useRef<View>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const feedback = (kind: Feedback) =>
    run(async () => {
      await social.feedback(post.id, kind);
      onChange?.({ ...post, feedback: kind });
      onClose();
      if (kind !== 'interested') onRemoved?.(post.id);
      Alert.alert('', t(kind === 'interested' ? 'fb_interested_done' : kind === 'hide' ? 'fb_hide_done' : 'fb_not_done'));
    });

  const setVisibility = (v: Visibility) =>
    run(async () => {
      await social.updatePost(post.id, { visibility: v });
      onChange?.({ ...post, visibility: v });
      profileSignal.dirty = true;
      setView('main');
    });

  const saveEdit = () =>
    run(async () => {
      const body = text.trim();
      if (!body && !post.image_path && !post.video_path) return;
      await social.updatePost(post.id, { body });
      onChange?.({ ...post, body, edited: true });
      feedSignal.dirty = true;
      profileSignal.dirty = true;
      onClose();
    });

  function remove() {
    Alert.alert(t('delete_post_q'), t('delete_forever'), [
      { text: t('no'), style: 'cancel' },
      {
        text: t('yes_delete'),
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await social.deletePost(post);
            profileSignal.dirty = true;
            onClose();
            onRemoved?.(post.id);
          }),
      },
    ]);
  }

  function block() {
    Alert.alert(t('block_q', { name: authorName(post.author) }), t('block_warn'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('block'),
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await social.block(post.author.id, true);
            feedSignal.dirty = true;
            onClose();
            onRemoved?.(post.id);
          }),
      },
    ]);
  }

  const report = () =>
    run(async () => {
      await social.report({ postId: post.id }, 'inappropriate');
      onClose();
      Alert.alert('', t('report_thanks'));
    });

  const copyLink = async () => {
    await Clipboard.setStringAsync(postLink(post.id));
    onClose();
    Alert.alert('', t('link_copied'));
  };

  /** Videos are saved as they are; photos get the Faisal Show watermark. */
  async function download() {
    if (!(await galleryPermission())) {
      Alert.alert('', t('gallery_permission'));
      return;
    }
    const path = post.video_path ?? post.image_path;
    const url = videoUrl(path);
    if (!path || !url) return;
    setView('save');
    setProgress(0);
    try {
      const local = await downloadToCache(url, extOf(path), setProgress);
      if (post.video_path) {
        await saveToGallery(local);
        onClose();
        Alert.alert('', t('saved_gallery'));
      } else {
        setShotUri(local); // the watermark view renders, then capture() runs on image load
      }
    } catch (e) {
      setView('main');
      Alert.alert('', errorMessage(e));
    }
  }

  async function capture() {
    try {
      await new Promise((r) => setTimeout(r, 150));
      const uri = await captureRef(shot, { format: 'jpg', quality: 0.92, result: 'tmpfile' });
      await saveToGallery(uri);
      onClose();
      Alert.alert('', t('saved_gallery'));
    } catch (e) {
      setView('main');
      Alert.alert('', errorMessage(e));
    }
  }

  const canDownload = !!(post.video_path || post.image_path);
  const vis = VISIBILITY.find((x) => x.v === (post.visibility ?? 'public'))!;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={st.backdrop} onPress={busy || view === 'save' ? undefined : onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={[st.sheet, { paddingBottom: 16 + bottom }]}>
            <View style={st.handle} />

            {view === 'main' ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[st.tiles, { flexDirection: d.row }]}>
                  {canDownload ? <Tile icon="download-outline" label={t('download')} onPress={download} /> : null}
                  <Tile icon="link-outline" label={t('copy_link')} onPress={copyLink} />
                  {mine ? (
                    <>
                      <Tile icon={vis.icon} label={t('privacy')} onPress={() => setView('privacy')} />
                      <Tile icon="create-outline" label={t('edit')} onPress={() => setView('edit')} />
                    </>
                  ) : (
                    <>
                      <Tile icon="flag-outline" label={t('report_short')} onPress={report} />
                      <Tile icon="ban-outline" label={t('block')} onPress={block} danger />
                    </>
                  )}
                </ScrollView>

                {mine ? (
                  <>
                    <Item icon={vis.icon} label={t('privacy')} value={t(vis.label)} onPress={() => setView('privacy')} />
                    <Item icon="create-outline" label={t('edit_post')} onPress={() => setView('edit')} />
                    <Item icon="trash-outline" label={t('delete_post')} onPress={remove} danger />
                  </>
                ) : (
                  <>
                    <Item
                      icon={post.feedback === 'interested' ? 'heart' : 'heart-outline'}
                      label={t('fb_interested')}
                      sub={t('fb_interested_sub')}
                      onPress={() => feedback('interested')}
                    />
                    <Item icon="heart-dislike-outline" label={t('fb_not')} sub={t('fb_not_sub')} onPress={() => feedback('not_interested')} />
                    <Item icon="eye-off-outline" label={t('fb_hide')} sub={t('fb_hide_sub')} onPress={() => feedback('hide')} />
                    <Item icon="flag-outline" label={t('report')} onPress={report} />
                    <Item icon="ban-outline" label={`${t('block')} ${authorName(post.author)}`} onPress={block} danger />
                  </>
                )}
                {busy ? <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} /> : null}
              </>
            ) : null}

            {view === 'privacy' ? (
              <>
                <Text style={st.title}>{t('who_can_see')}</Text>
                {VISIBILITY.map((o) => {
                  const on = (post.visibility ?? 'public') === o.v;
                  return (
                    <Pressable key={o.v} onPress={() => setVisibility(o.v)} style={[st.item, { flexDirection: d.row }]}>
                      <View style={[st.itemIcon, on && { backgroundColor: colors.primary }]}>
                        <Ionicons name={o.icon} size={20} color={on ? '#fff' : colors.text} />
                      </View>
                      <View style={{ flex: 1, alignItems: d.items }}>
                        <Text style={st.itemText}>{t(o.label)}</Text>
                        <Text style={st.itemSub}>{t(o.sub)}</Text>
                      </View>
                      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.primary : colors.muted} />
                    </Pressable>
                  );
                })}
                {busy ? <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} /> : null}
              </>
            ) : null}

            {view === 'edit' ? (
              <>
                <Text style={st.title}>{t('edit_post')}</Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  multiline
                  autoFocus
                  maxLength={2000}
                  placeholder={t('whats_on_mind')}
                  placeholderTextColor={colors.muted}
                  style={[st.input, { textAlign: d.align, writingDirection: d.writing }]}
                />
                <View style={{ flexDirection: d.row, gap: 10, marginTop: 12 }}>
                  <Pressable onPress={() => setView('main')} style={[st.btn, { backgroundColor: colors.surface }]}>
                    <Text style={[st.btnText, { color: colors.text }]}>{t('cancel')}</Text>
                  </Pressable>
                  <Pressable onPress={saveEdit} disabled={busy} style={[st.btn, { backgroundColor: colors.primary }]}>
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>{t('save')}</Text>}
                  </Pressable>
                </View>
              </>
            ) : null}

            {view === 'save' ? (
              <View style={{ alignItems: 'center', paddingVertical: 12, gap: 10 }}>
                {shotUri ? (
                  <Watermarked ref={shot} uri={shotUri} username={post.author.username} onReady={capture} />
                ) : (
                  <Ionicons name="cloud-download-outline" size={44} color={colors.primary} />
                )}
                <Text style={st.itemText}>
                  {t('downloading')} {Math.round(progress * 100)}%
                </Text>
                <View style={st.progress}>
                  <View style={[st.progressFill, { width: `${Math.round(progress * 100)}%` as `${number}%` }]} />
                </View>
              </View>
            ) : null}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

/** Photo with the Faisal Show logo and @username in the corner (this view is captured to a JPG). */
function Watermarked({ uri, username, onReady, ref }: { uri: string; username: string | null; onReady: () => void; ref: RefObject<View | null> }) {
  const [ratio, setRatio] = useState(1);
  const fired = useRef(false);
  return (
    <View ref={ref} collapsable={false} style={{ width: 280, aspectRatio: ratio, backgroundColor: '#000' }}>
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onLoad={(e) => {
          const { width, height } = e.nativeEvent.source;
          if (width && height) setRatio(Math.max(0.5, Math.min(2, width / height)));
          if (!fired.current) {
            fired.current = true;
            onReady();
          }
        }}
      />
      <View style={st.mark}>
        <Image source={require('../../assets/logo-mark.png')} style={{ width: 22, height: 22 }} />
        <View>
          <Text style={st.markBrand}>Faisal Show</Text>
          {username ? <Text style={st.markUser}>@{username}</Text> : null}
        </View>
      </View>
    </View>
  );
}

function Tile({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={st.tile}>
      <View style={[st.tileIcon, danger && { backgroundColor: colors.errorBg }]}>
        <Ionicons name={icon} size={24} color={danger ? colors.error : colors.text} />
      </View>
      <Text style={st.tileText} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function Item({ icon, label, sub, value, onPress, danger }: { icon: IconName; label: string; sub?: string; value?: string; onPress: () => void; danger?: boolean }) {
  const { d } = useI18n();
  const color = danger ? colors.error : colors.text;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.item, { flexDirection: d.row }, pressed && { opacity: 0.6 }]}>
      <View style={[st.itemIcon, danger && { backgroundColor: colors.errorBg }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1, alignItems: d.items }}>
        <Text style={[st.itemText, { color }]}>{label}</Text>
        {sub ? <Text style={[st.itemSub, { textAlign: d.align }]}>{sub}</Text> : null}
      </View>
      {value ? <Text style={st.itemSub}>{value}</Text> : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 14, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 10 },
  tiles: { gap: 14, paddingVertical: 6, paddingHorizontal: 2, marginBottom: 6 },
  tile: { width: 68, alignItems: 'center', gap: 6 },
  tileIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: 12, color: colors.text, textAlign: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 8 },
  item: { alignItems: 'center', gap: 12, paddingVertical: 10 },
  itemIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 15, fontWeight: '600', color: colors.text },
  itemSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  input: { minHeight: 110, maxHeight: 260, fontSize: 16, color: colors.text, backgroundColor: colors.input, borderRadius: radius.md, padding: 12, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.border },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  progress: { width: '80%', height: 6, borderRadius: 3, backgroundColor: colors.surface, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.primary },
  mark: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 4 },
  markBrand: { color: '#fff', fontWeight: '900', fontSize: 11 },
  markUser: { color: '#fff', fontSize: 10, opacity: 0.9 },
});
