import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PeopleSearch } from '@/components/PeopleSearch';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth-context';
import { formatCount, SearchResult, social, TrendingTag } from '@/lib/social';
import { colors, radius } from '@/theme';

export default function Search() {
  const router = useRouter();
  const { t, d } = useI18n();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [tags, setTags] = useState<TrendingTag[]>([]);

  useEffect(() => {
    social.trendingTags().then(setTags).catch(() => {});
  }, []);

  const openTag = (tag: string) => router.push({ pathname: '/tag/[tag]', params: { tag } });

  async function follow(u: SearchResult, update: (u: SearchResult) => void) {
    const on = !u.followed_by_me;
    update({ ...u, followed_by_me: on });
    try {
      await social.follow(u.id, on, me);
    } catch {
      update(u);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('search_title'), headerTitleAlign: 'center' }} />
      <PeopleSearch
        autoFocus
        excludeMe={me}
        onTag={openTag}
        emptyExtra={
          tags.length ? (
            <View style={st.trend}>
              <View style={[st.trendHead, { flexDirection: d.row }]}>
                <Ionicons name="trending-up" size={20} color={colors.primary} />
                <Text style={st.trendTitle}>{t('trending')}</Text>
              </View>
              <View style={[st.chips, { flexDirection: d.row }]}>
                {tags.map((x, i) => (
                  <Pressable key={x.tag} onPress={() => openTag(x.tag)} style={st.chip}>
                    <Text style={st.chipText}>
                      {i < 3 ? '🔥 ' : ''}#{x.tag}
                    </Text>
                    <Text style={st.chipCount}>{formatCount(x.count)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null
        }
        onPress={(u) => router.push({ pathname: '/user/[id]', params: { id: u.id } })}
        right={(u, update) => (
          <Pressable onPress={() => follow(u, update)} style={[st.follow, u.followed_by_me && st.following]}>
            <Text style={[st.followText, u.followed_by_me && { color: colors.primary }]}>
              {u.followed_by_me ? t('following') : t('follow')}
            </Text>
          </Pressable>
        )}
      />
    </>
  );
}

const st = StyleSheet.create({
  follow: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 7, borderRadius: radius.full },
  following: { backgroundColor: colors.soft },
  followText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  trend: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, marginTop: 4 },
  trendHead: { alignItems: 'center', gap: 8, marginBottom: 10 },
  trendTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  chips: { flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.soft, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { color: colors.primary, fontWeight: '700' },
  chipCount: { color: colors.muted, fontSize: 12 },
});
