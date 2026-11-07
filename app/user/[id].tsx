import { Stack, useLocalSearchParams } from 'expo-router';

import { ProfileView } from '@/components/ProfileView';

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'پروفایل', headerTitleAlign: 'center' }} />
      <ProfileView userId={id} />
    </>
  );
}
