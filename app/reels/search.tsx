import { Stack, useLocalSearchParams } from 'expo-router';

import { ReelsFeed } from '@/components/ReelsFeed';

/** Reels found by a search, full-screen, starting with the one that was tapped. */
export default function SearchReels() {
  const { q, start } = useLocalSearchParams<{ q: string; start?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'fade' }} />
      <ReelsFeed query={q} startId={start} title={`🔍 ${q ?? ''}`} />
    </>
  );
}
