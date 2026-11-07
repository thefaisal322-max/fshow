import { Stack, useLocalSearchParams } from 'expo-router';

import { ProfileView } from '@/components/ProfileView';
import { useI18n } from '@/i18n';

export default function UserScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('profile_title'), headerTitleAlign: 'center' }} />
      <ProfileView userId={id} />
    </>
  );
}
