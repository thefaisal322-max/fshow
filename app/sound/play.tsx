import { Stack, useLocalSearchParams } from 'expo-router';

import { ReelsFeed } from '@/components/ReelsFeed';

/** The reels that use one sound, opened from the sound page. */
export default function SoundReels() {
  const { id, start, name } = useLocalSearchParams<{ id: string; start?: string; name?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      <ReelsFeed soundId={id} startId={start} title={name} />
    </>
  );
}
