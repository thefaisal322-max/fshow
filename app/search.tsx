import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { PeopleSearch } from '@/components/PeopleSearch';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth-context';
import { SearchResult, social } from '@/lib/social';
import { colors, radius } from '@/theme';

export default function Search() {
  const router = useRouter();
  const { t } = useI18n();
  const { session } = useAuth();
  const me = session?.user.id ?? '';

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
  following: { backgroundColor: '#E7F0FD' },
  followText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
