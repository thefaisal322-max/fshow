import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/PostCard';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { authorName, formatCount, SearchResult, social } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius } from '@/theme';

export default function Search() {
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  // Search 350 ms after the user stops typing; ignore late answers to old queries.
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults([]);
      setError(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await social.search(query);
        if (id === reqId.current) {
          setResults(r);
          setError(null);
        }
      } catch (e) {
        if (id === reqId.current) setError(errorMessage(e));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  async function follow(u: SearchResult) {
    const on = !u.followed_by_me;
    setResults((rs) => rs.map((r) => (r.id === u.id ? { ...r, followed_by_me: on } : r)));
    try {
      await social.follow(u.id, on, me);
    } catch {
      setResults((rs) => rs.map((r) => (r.id === u.id ? u : r)));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={st.box}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="نوم یا @ID Name ولټوئ"
          placeholderTextColor={colors.muted}
          style={st.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>
      <FlatList
        data={results}
        keyExtractor={(u) => u.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 8 }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: error ? colors.error : colors.muted, marginTop: 30 }}>
            {error ?? (q.trim() && !loading ? 'هېڅوک ونه موندل شو' : 'ملګري او نوي خلک ومومئ')}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable style={st.row} onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })}>
            {item.id !== me ? (
              <Pressable onPress={() => follow(item)} style={[st.follow, item.followed_by_me && st.following]}>
                <Text style={[st.followText, item.followed_by_me && { color: colors.primary }]}>
                  {item.followed_by_me ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
                <Text style={st.name}>{authorName(item)}</Text>
                {item.is_fainet ? <VerifiedBadge /> : null}
              </View>
              <Text style={st.meta}>
                {item.username ? `@${item.username} · ` : ''}
                {formatCount(item.followers_count)} Followers
              </Text>
            </View>
            <Avatar uri={avatarUrl(item.photo_path)} name={item.first_name} size={48} />
          </Pressable>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  box: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, margin: 10, paddingHorizontal: 14, backgroundColor: colors.card, borderRadius: radius.full },
  input: { flex: 1, fontSize: 16, paddingVertical: 11, textAlign: 'right', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, padding: 12, borderRadius: radius.md, marginBottom: 6 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  follow: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: radius.full },
  following: { backgroundColor: '#E7F0FD' },
  followText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
