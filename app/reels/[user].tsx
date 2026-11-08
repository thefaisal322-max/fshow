import { Stack, useLocalSearchParams } from 'expo-router';

import { ReelsFeed } from '@/components/ReelsFeed';

/** One person's reels, opened from the Reels grid on their profile. */
export default function UserReels() {
  const { user, start, name } = useLocalSearchParams<{ user: string; start?: string; name?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      <ReelsFeed userId={user} startId={start} title={name} />
    </>
  );
}
