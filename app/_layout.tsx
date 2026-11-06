import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth-context';

/**
 * Sends each user to the right place:
 *  - not logged in        → (auth)  welcome / login / signup
 *  - logged in, no profile → (setup) photo → ID Name
 *  - ready                → (tabs)  the app
 */
function Gate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const group = segments[0];

  useEffect(() => {
    if (loading) return;
    if (!user) {
      if (group !== '(auth)') router.replace('/welcome');
    } else if (!user.profileComplete) {
      if (group !== '(setup)') router.replace('/photo');
    } else if (group !== '(tabs)') {
      router.replace('/');
    }
  }, [user?.id, user?.profileComplete, loading, group]);

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      {loading ? <Loading /> : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
