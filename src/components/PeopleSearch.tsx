import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { authorName, formatCount, SearchResult, social } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

/** Search box + results. `right` renders the action for each person (Follow, ✓ select, ...). */
export function PeopleSearch({
  onPress,
  right,
  header,
  autoFocus,
  placeholder,
  excludeMe,
  emptyExtra,
  onTag,
}: {
  /** Shown while the search box is empty (e.g. trending hashtags). */
  emptyExtra?: ReactNode;
  /** Typing "#something" offers to open that hashtag. */
  onTag?: (tag: string) => void;
  onPress: (u: SearchResult) => void;
  right?: (u: SearchResult, update: (u: SearchResult) => void) => ReactNode;
  header?: ReactNode;
  autoFocus?: boolean;
  placeholder?: string;
  excludeMe?: string;
}) {
  const { t, d } = useI18n();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const bottom = useBottomSpace();

  // Search 350 ms after typing stops; ignore late answers to old queries.
  useEffect(() => {
    const query = q.trim();
    if (!query || query.startsWith('#')) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await social.search(query);
        if (id === reqId.current) {
          setResults(excludeMe ? r.filter((u) => u.id !== excludeMe) : r);
          setError(null);
        }
      } catch (e) {
        if (id === reqId.current) setError(errorMessage(e));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [q, excludeMe]);

  const update = (u: SearchResult) => setResults((rs) => rs.map((r) => (r.id === u.id ? u : r)));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <View style={[st.box, { flexDirection: d.row }]}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={placeholder ?? t('search_placeholder')}
          placeholderTextColor={colors.muted}
          style={[st.input, { textAlign: d.align }]}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType="search"
        />
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>
      <FlatList
        data={results}
        keyExtractor={(u) => u.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 8, paddingBottom: 8 + bottom }}
        ListHeaderComponent={
          onTag && /^#[0-9A-Za-z_\u0600-\u06FF]{1,50}$/.test(q.trim()) ? (
            <Pressable style={[st.row, { flexDirection: d.row }]} onPress={() => onTag(q.trim().slice(1).toLowerCase())}>
              <View style={st.tagIcon}>
                <Ionicons name="pricetag" size={22} color="#fff" />
              </View>
              <Text style={[st.name, { flex: 1, textAlign: d.align }]}>{q.trim()}</Text>
              <Ionicons name={d.rtl ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.muted} />
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          !q.trim() && emptyExtra ? (
            <>{emptyExtra}</>
          ) : q.trim().startsWith('#') ? null : (
          <Text style={{ textAlign: 'center', color: error ? colors.error : colors.muted, marginTop: 30 }}>
            {error ?? (q.trim() && !loading ? t('nobody_found') : t('find_people'))}
          </Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable style={[st.row, { flexDirection: d.rowOpp }]} onPress={() => onPress(item)}>
            {right ? right(item, update) : <View />}
            <View style={{ flex: 1, alignItems: d.items }}>
              <View style={{ flexDirection: d.row, alignItems: 'center' }}>
                <Text style={st.name}>{authorName(item)}</Text>
                {item.is_fainet ? <VerifiedBadge /> : null}
              </View>
              <Text style={st.meta}>
                {item.username ? `@${item.username} · ` : ''}
                {formatCount(item.followers_count)} {t('followers')}
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
  box: { alignItems: 'center', gap: 8, margin: 10, paddingHorizontal: 14, backgroundColor: colors.card, borderRadius: radius.full },
  input: { flex: 1, fontSize: 16, paddingVertical: 11, color: colors.text },
  row: { alignItems: 'center', gap: 12, backgroundColor: colors.card, padding: 12, borderRadius: radius.md, marginBottom: 6 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  tagIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
