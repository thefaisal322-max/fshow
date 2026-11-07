import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: true, headerTitleAlign: 'center', contentStyle: { backgroundColor: colors.bg } }} />;
}
