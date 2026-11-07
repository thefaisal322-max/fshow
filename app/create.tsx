import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ErrorBox } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { feedSignal, profileSignal } from '@/lib/signals';
import { social } from '@/lib/social';
import { colors, radius } from '@/theme';

const MAX = 2000;

export default function CreatePost() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const [body, setBody] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canPost = !busy && (body.trim().length > 0 || !!image) && body.length <= MAX;

  async function pick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('د عکسونو اجازه ورکړئ');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled && res.assets[0]) setImage(res.assets[0].uri);
  }

  async function submit() {
    if (!session || !canPost) return;
    setBusy(true);
    setError(null);
    try {
      await social.createPost(session.user.id, body, image);
      feedSignal.dirty = true;
      profileSignal.dirty = true;
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.card }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'نوی پوسټ',
          headerTitleAlign: 'center',
          headerRight: () =>
            busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Pressable onPress={submit} disabled={!canPost} style={[st.postBtn, !canPost && { opacity: 0.4 }]}>
                <Text style={st.postBtnText}>Post</Text>
              </Pressable>
            ),
        }}
      />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <ErrorBox message={error} />
        <View style={st.who}>
          <Text style={st.name}>{profile?.displayName}</Text>
          <Avatar uri={profile?.photoURL} name={profile?.firstName} size={44} />
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="څه فکر کوئ؟"
          placeholderTextColor={colors.muted}
          multiline
          autoFocus
          maxLength={MAX + 100}
          style={st.input}
        />
        <Text style={[st.counter, body.length > MAX && { color: colors.error }]}>
          {body.length}/{MAX}
        </Text>
        {image ? (
          <View>
            <Image source={{ uri: image }} style={st.preview} resizeMode="cover" />
            <Pressable style={st.remove} onPress={() => setImage(null)}>
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      <Pressable style={st.bar} onPress={pick}>
        <Ionicons name="image" size={24} color={colors.success} />
        <Text style={st.barText}>عکس</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  postBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: radius.full },
  postBtnText: { color: '#fff', fontWeight: '700' },
  who: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  input: { fontSize: 18, minHeight: 140, textAlign: 'right', writingDirection: 'rtl', textAlignVertical: 'top', color: colors.text, marginTop: 12 },
  counter: { textAlign: 'left', color: colors.muted, fontSize: 12 },
  preview: { width: '100%', aspectRatio: 1, borderRadius: radius.md, marginTop: 12, backgroundColor: colors.bg },
  remove: { position: 'absolute', top: 20, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, padding: 6 },
  bar: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  barText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
