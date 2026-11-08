import { useLocalSearchParams } from 'expo-router';

import { ReelsFeed } from '@/components/ReelsFeed';

/** Reels tab (Following / For You). `start` opens a given reel first (from the Home reels row). */
export default function Reels() {
  const { start } = useLocalSearchParams<{ start?: string }>();
  return <ReelsFeed startId={start} />;
}
