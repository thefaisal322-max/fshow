import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
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

import { Avatar } from '@/components/Avatar';
import { ErrorBox } from '@/components/ui';
import { FeedVideo } from '@/components/Video';
import { StringKey, useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { feedSignal, profileSignal } from '@/lib/signals';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { FEELINGS, feelingLabel, social } from '@/lib/social';
import { colors, radius } from '@/theme';

const MAX = 2000;
type Video = { uri: string; duration?: number | null; size?: number | null; mime?: string | null };

export default function CreatePost() {
  const router = useRouter();
  const { t, d } = useI18n();
  const { session, profile } = useAuth();
  const bottom = useBottomSpace();
  const [body, setBody] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [feeling, setFeeling] = useState<string | null>(null);
  const [feelingOpen, setFeelingOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canPost = !busy && (body.trim().length > 0 || !!image || !!video) && body.length <= MAX;

  async function pick(kind: 'images' | 'videos') {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t('photos_permission'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [kind],
      quality: 0.8,
      videoMaxDuration: 60,
      allowsEditing: kind === 'videos',
    });
    const a = res.canceled ? null : res.assets[0];
    if (!a) return;
    if (kind === 'images') {
      setImage(a.uri);
      setVideo(null);
      return;
    }
    if (a.duration && a.duration > 61_000) return setError(t('e_video_long'));
    if (a.fileSize && a.fileSize > 25 * 1024 * 1024) return setError(t('e_video_big'));
    setVideo({ uri: a.uri, duration: a.duration, size: a.fileSize, mime: a.mimeType });
    setImage(null);
  }

  async function findLocation() {
    setError(null);
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setError(t('location_permission'));
        setLocation('');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync(pos.coords);
      const name = [place?.city ?? place?.subregion ?? place?.district, place?.country].filter(Boolean).join(', ');
      setLocation(name.slice(0, 100));
    } catch {
      setLocation(''); // let the user type it
    } finally {
      setLocating(false);
    }
  }

  async function submit() {
    if (!session || !canPost) return;
    setBusy(true);
    setError(null);
    try {
      await social.createPost(session.user.id, { body, image, video, location, feeling });
      feedSignal.dirty = true;
      profileSignal.dirty = true;
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const postButton = () =>
    busy ? (
      <ActivityIndicator color={colors.primary} style={{ marginHorizontal: 12 }} />
    ) : (
      <Pressable onPress={submit} disabled={!canPost} style={[st.postBtn, !canPost && { opacity: 0.4 }]}>
        <Text style={st.postBtnText}>Post</Text>
      </Pressable>
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.card }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: true, title: t('new_post'), headerTitleAlign: 'center', headerRight: postButton }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <ErrorBox message={error} />
        <View style={[st.who, { flexDirection: d.rowOpp, justifyContent: 'flex-end' }]}>
          <View style={{ flex: 1, alignItems: d.items }}>
            <Text style={st.name}>{profile?.displayName}</Text>
            {feeling || location ? (
              <Text style={{ color: colors.muted, fontSize: 13, textAlign: d.align }}>
                {[feeling ? t('is_feeling', { f: feelingLabel(feeling) ?? '' }) : null, location ? `📍 ${location}` : null].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          <Avatar uri={profile?.photoURL} name={profile?.firstName} size={44} />
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={t('whats_on_mind')}
          placeholderTextColor={colors.muted}
          multiline
          autoFocus
          maxLength={MAX + 100}
          style={[st.input, { textAlign: d.align, writingDirection: d.writing }]}
        />
        <Text style={[st.counter, { textAlign: d.rtl ? 'left' : 'right' }, body.length > MAX && { color: colors.error }]}>
          {body.length}/{MAX}
        </Text>

        {location !== null ? (
          <View style={[st.locRow, { flexDirection: d.row }]}>
            <Ionicons name="location" size={18} color={colors.error} />
            <TextInput
              value={location}
              onChangeText={(v) => setLocation(v.slice(0, 100))}
              placeholder={locating ? t('locating') : t('type_location')}
              placeholderTextColor={colors.muted}
              style={[st.locInput, { textAlign: d.align }]}
            />
            <Pressable onPress={() => setLocation(null)} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          </View>
        ) : null}

        {image ? (
          <View>
            <Image source={{ uri: image }} style={st.preview} resizeMode="cover" />
            <RemoveBtn onPress={() => setImage(null)} />
          </View>
        ) : null}
        {video ? (
          <View>
            <FeedVideo uri={video.uri} style={st.preview} />
            <RemoveBtn onPress={() => setVideo(null)} />
          </View>
        ) : null}
      </ScrollView>

      <View style={[st.bar, { flexDirection: d.row, paddingBottom: 6 + bottom }]}>
        <Tool icon="image" color={colors.success} label={t('photo')} onPress={() => pick('images')} />
        <Tool icon="videocam" color="#E4405F" label={t('video')} onPress={() => pick('videos')} />
        <Tool icon="location" color={colors.error} label={t('location')} onPress={findLocation} busy={locating} />
        <Tool icon="happy" color="#F7B928" label={t('feeling')} onPress={() => setFeelingOpen(true)} />
      </View>

      <Modal visible={feelingOpen} transparent animationType="slide" onRequestClose={() => setFeelingOpen(false)}>
        <Pressable style={st.backdrop} onPress={() => setFeelingOpen(false)}>
          <Pressable style={[st.sheet, { paddingBottom: 30 + bottom }]}>
            <Text style={st.sheetTitle}>{t('feeling_title')}</Text>
            <View style={[st.grid, { flexDirection: d.row }]}>
              {FEELINGS.map((f) => (
                <Pressable
                  key={f.code}
                  style={[st.feel, feeling === f.code && { borderColor: colors.primary, backgroundColor: '#E7F0FD' }]}
                  onPress={() => {
                    setFeeling(feeling === f.code ? null : f.code);
                    setFeelingOpen(false);
                  }}
                >
                  <Text style={{ fontSize: 26 }}>{f.emoji}</Text>
                  <Text style={{ fontSize: 13, color: colors.text }}>{t(`f_${f.code}` as StringKey)}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Tool({ icon, color, label, onPress, busy }: { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable onPress={onPress} style={st.tool}>
      {busy ? <ActivityIndicator color={color} /> : <Ionicons name={icon} size={24} color={color} />}
      <Text style={st.toolText}>{label}</Text>
    </Pressable>
  );
}

function RemoveBtn({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={st.remove} onPress={onPress}>
      <Ionicons name="close" size={20} color="#fff" />
    </Pressable>
  );
}

const st = StyleSheet.create({
  postBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: radius.full, marginHorizontal: 8 },
  postBtnText: { color: '#fff', fontWeight: '700' },
  who: { alignItems: 'center', gap: 10 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  input: { fontSize: 18, minHeight: 120, textAlignVertical: 'top', color: colors.text, marginTop: 12 },
  counter: { color: colors.muted, fontSize: 12 },
  locRow: { alignItems: 'center', gap: 8, backgroundColor: colors.bg, borderRadius: radius.md, paddingHorizontal: 12, marginTop: 10 },
  locInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: colors.text },
  preview: { width: '100%', aspectRatio: 1, borderRadius: radius.md, marginTop: 12, backgroundColor: '#000' },
  remove: { position: 'absolute', top: 20, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, padding: 6 },
  bar: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingVertical: 6 },
  tool: { flex: 1, alignItems: 'center', paddingVertical: 6, gap: 2 },
  toolText: { fontSize: 12, fontWeight: '600', color: colors.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 30 },
  sheetTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 12, color: colors.text },
  grid: { flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  feel: { width: '30%', alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
});
