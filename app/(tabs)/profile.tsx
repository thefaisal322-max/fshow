import { ProfileView } from '@/components/ProfileView';
import { useAuth } from '@/lib/auth-context';

export default function MyProfile() {
  const { session } = useAuth();
  if (!session) return null;
  return <ProfileView userId={session.user.id} />;
}
