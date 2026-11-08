import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PostList } from '@/components/PostList';
import { useI18n } from '@/i18n';
import { social } from '@/lib/social';
import { colors, radius } from '@/theme';

/** All posts with one #hashtag. */
export default function TagScreen() {
  const { t } = useI18n();
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const clean = String(tag ?? '').replace(/^#/, '').toLowerCase();
  const load = useCallback((offset: number) => social.tagPosts(clean, offset), [clean]);
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: `#${clean}`, headerTitleAlign: 'center' }} />
      <PostList
        load={load}
        empty={t('no_posts')}
        header={
          <View style={st.head}>
            <View style={st.icon}>
              <Ionicons name="pricetag" size={30} color="#fff" />
            </View>
            <Text style={st.tag}>#{clean}</Text>
            <Text style={st.sub}>{t('tag_sub')}</Text>
          </View>
        }
      />
    </>
  );
}

const st = StyleSheet.create({
  head: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 18, marginBottom: 10, gap: 6 },
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  tag: { fontSize: 22, fontWeight: '900', color: colors.text },
  sub: { fontSize: 13, color: colors.muted },
});
