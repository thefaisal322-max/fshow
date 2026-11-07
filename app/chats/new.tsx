import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PeopleSearch } from '@/components/PeopleSearch';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { chat } from '@/lib/chat';
import { SearchResult } from '@/lib/social';
import { colors, radius } from '@/theme';

/** New 1-to-1 message, or a new group (pick members + name). */
export default function NewChat() {
  const router = useRouter();
  const { t, d } = useI18n();
  const { session } = useAuth();
  const [group, setGroup] = useState(false);
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);

  async function open(u: SearchResult) {
    if (group) {
      setPicked((p) => (p.some((x) => x.id === u.id) ? p.filter((x) => x.id !== u.id) : [...p, u]));
      return;
    }
    setBusy(true);
    try {
      const id = await chat.startDirect(u.id);
      router.replace({ pathname: '/chats/[id]', params: { id } });
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    if (!title.trim() || picked.length === 0) return;
    setBusy(true);
    try {
      const id = await chat.createGroup(title.trim(), picked.map((p) => p.id));
      router.replace({ pathname: '/chats/[id]', params: { id } });
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <View>
      <View style={[st.switch, { flexDirection: d.row }]}>
        <Pressable onPress={() => setGroup(false)} style={[st.sw, !group && st.swOn]}>
          <Text style={[st.swText, !group && { color: '#fff' }]}>{t('new_message')}</Text>
        </Pressable>
        <Pressable onPress={() => setGroup(true)} style={[st.sw, group && st.swOn]}>
          <Text style={[st.swText, group && { color: '#fff' }]}>{t('new_group')}</Text>
        </Pressable>
      </View>
      {group ? (
        <View style={{ paddingHorizontal: 10 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t('group_name')}
            placeholderTextColor={colors.muted}
            maxLength={60}
            style={[st.title, { textAlign: d.align }]}
          />
          <View style={[st.chips, { flexDirection: d.row }]}>
            {picked.map((p) => (
              <Pressable key={p.id} onPress={() => open(p)} style={st.chip}>
                <Text style={st.chipText}>{p.first_name}</Text>
                <Ionicons name="close" size={14} color={colors.primary} />
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={createGroup}
            disabled={busy || !title.trim() || picked.length === 0}
            style={[st.create, (busy || !title.trim() || picked.length === 0) && { opacity: 0.4 }]}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>
              {t('create')} ({picked.length})
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: group ? t('new_group') : t('new_message') }} />
      <PeopleSearch
        header={header}
        excludeMe={session?.user.id}
        placeholder={t('start_chat_hint')}
        onPress={open}
        right={(u) =>
          group ? (
            <Ionicons
              name={picked.some((p) => p.id === u.id) ? 'checkmark-circle' : 'ellipse-outline'}
              size={26}
              color={picked.some((p) => p.id === u.id) ? colors.primary : colors.muted}
            />
          ) : (
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.primary} />
          )
        }
      />
    </>
  );
}

const st = StyleSheet.create({
  switch: { margin: 10, marginBottom: 0, backgroundColor: colors.card, borderRadius: radius.full, padding: 4 },
  sw: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.full },
  swOn: { backgroundColor: colors.primary },
  swText: { fontWeight: '700', color: colors.text },
  title: { backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, marginTop: 10, color: colors.text },
  chips: { flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E7F0FD', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { color: colors.primary, fontWeight: '600' },
  create: { backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', paddingVertical: 11, marginTop: 8 },
});
