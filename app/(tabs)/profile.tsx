import { useLocalSearchParams } from 'expo-router';

import { ProfileView } from '@/components/ProfileView';
import { useAuth } from '@/lib/auth-context';

export default function MyProfile() {
  const { session } = useAuth();
  const { tab, at } = useLocalSearchParams<{ tab?: string; at?: string }>();
  if (!session) return null;
  const initial = tab === 'saved' || tab === 'reels' || tab === 'posts' || tab === 'all' ? tab : undefined;
  return <ProfileView userId={session.user.id} initialTab={initial} tabNonce={at} />;
}
