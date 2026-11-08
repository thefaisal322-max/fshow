import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '@/components/ui';
import { LanguageProvider, useI18n } from '@/i18n';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { UnreadProvider } from '@/lib/notifications';
import { usePresenceHeartbeat } from '@/lib/presence';
import { colors } from '@/theme';

// Header, tab bar and screen backgrounds follow the chosen theme.
const navTheme = {
  ...(colors.dark ? DarkTheme : DefaultTheme),
  colors: {
    ...(colors.dark ? DarkTheme : DefaultTheme).colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    notification: colors.error,
  },
};

/**
 * Sends each user to the right place:
 *  - not logged in        → (auth)  welcome / login / signup
 *  - logged in, no profile → (setup) photo → ID Name
 *  - ready                → (tabs) + post / user / create screens
 */
function Gate() {
  const { session, profile, loading: authLoading } = useAuth();
  const { ready: langReady, t } = useI18n();
  const loading = authLoading || !langReady;
  const segments = useSegments();
  const router = useRouter();
  const group = segments[0];
  usePresenceHeartbeat(profile?.profileComplete ? session?.user.id : undefined);

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
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack screenOptions={{ headerShown: false, headerBackTitle: t('back') }} />
      {loading ? <Loading /> : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
      <LanguageProvider>
      <AuthProvider>
        <UnreadProvider>
          <StatusBar style={colors.dark ? 'light' : 'dark'} />
          <Gate />
        </UnreadProvider>
      </AuthProvider>
      </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
