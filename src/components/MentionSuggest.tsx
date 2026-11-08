import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { SearchResult, social, TrendingTag } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius } from '@/theme';

import { Avatar } from './Avatar';

let trendingCache: TrendingTag[] | null = null;

/** The word being typed at the end of the text, if it starts with @ or #. */
function lastToken(text: string): { kind: '@' | '#'; word: string } | null {
  const m = /(^|\s)([@#])([0-9A-Za-z._؀-ۿ]{0,30})$/.exec(text);
  if (!m) return null;
  return { kind: m[2] as '@' | '#', word: m[3] };
}

/**
 * While typing "@ka…" shows matching people, while typing "#ka…" shows matching hashtags.
 * Tapping one completes the word in the text.
 */
export function MentionSuggest({ text, onPick }: { text: string; onPick: (next: string) => void }) {
  const { d } = useI18n();
  const token = lastToken(text);
  const [people, setPeople] = useState<SearchResult[]>([]);
  const [tags, setTags] = useState<TrendingTag[]>(trendingCache ?? []);
  const key = token ? token.kind + token.word : '';

  useEffect(() => {
    if (!token) return;
    let alive = true;
    if (token.kind === '@') {
      if (!token.word) {
        setPeople([]);
        return;
      }
      const timer = setTimeout(() => {
        social
          .search(token.word)
          .then((r) => alive && setPeople(r.filter((u) => u.username).slice(0, 8)))
          .catch(() => {});
      }, 250);
      return () => {
        alive = false;
        clearTimeout(timer);
      };
    }
    if (!trendingCache) {
      social
        .trendingTags()
        .then((r) => {
          trendingCache = r;
          if (alive) setTags(r);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!token) return null;

  const complete = (word: string) => {
    const cut = text.length - token.word.length - 1;
    onPick(`${text.slice(0, cut)}${token.kind}${word} `);
  };

  if (token.kind === '@') {
    if (!people.length) return null;
    return (
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={[st.row, { flexDirection: d.row }]}>
        {people.map((u) => (
          <Pressable key={u.id} onPress={() => complete(u.username!)} style={[st.chip, { flexDirection: d.row }]}>
            <Avatar uri={avatarUrl(u.photo_path)} name={u.first_name} size={24} />
            <View>
              <Text style={st.name} numberOfLines={1}>
                {u.first_name} {u.last_name}
              </Text>
              <Text style={st.sub}>@{u.username}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    );
  }

  const w = token.word.toLowerCase();
  const list = tags.filter((x) => x.tag.startsWith(w)).slice(0, 10);
  if (!list.length) return null;
  return (
    <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={[st.row, { flexDirection: d.row }]}>
      {list.map((x) => (
        <Pressable key={x.tag} onPress={() => complete(x.tag)} style={st.chip}>
          <Text style={st.tag}>#{x.tag}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chip: { alignItems: 'center', gap: 6, backgroundColor: colors.soft, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5 },
  name: { fontSize: 12, fontWeight: '700', color: colors.text, maxWidth: 120 },
  sub: { fontSize: 11, color: colors.muted },
  tag: { color: colors.primary, fontWeight: '700' },
});
