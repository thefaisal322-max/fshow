import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { UnreadProvider } from '@/lib/notifications';

/**
 * Sends each user to the right place:
 *  - not logged in        → (auth)  welcome / login / signup
 *  - logged in, no profile → (setup) photo → ID Name
 *  - ready                → (tabs) + post / user / create screens
 */
function Gate() {
  const { session, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const group = segments[0];

  useEffect(() => {
    if (loading) return;
    if (!session) {
      if (group !== '(auth)') router.replace('/welcome');
    } else if (profile && !profile.profileComplete) {
      if (group !== '(setup)') router.replace('/photo');
    } else if (profile && (group === '(auth)' || group === '(setup)' || group === undefined)) {
      // finished profile: leave login/setup screens; other screens (post, user, create) are fine
      router.replace('/');
    }
  }, [session?.user.id, profile?.profileComplete, loading, group]);

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, headerBackTitle: 'شاته' }} />
      {loading ? <Loading /> : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <UnreadProvider>
          <StatusBar style="dark" />
          <Gate />
        </UnreadProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
