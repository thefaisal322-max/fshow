import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useUnread } from '@/lib/notifications';
import { colors } from '@/theme';

export const unstable_settings = { initialRouteName: 'index' };

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName) => ({ color, size }: { color: string; size: number }) => (
  <Ionicons name={name} color={color} size={size} />
);

// Declared left → right like the prototype, so "Home" sits on the right (RTL).
export default function TabsLayout() {
  const { unread } = useUnread();
  return (
    <Tabs
      screenOptions={{
        headerTitle: 'Faisal Show',
        headerTitleAlign: 'center',
        headerTitleStyle: { color: colors.primary, fontWeight: '800', fontSize: 22 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('person') }} />
      <Tabs.Screen
        name="notifications"
        options={{ title: 'Noti', tabBarIcon: icon('notifications'), tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined }}
      />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: icon('search') }} />
      <Tabs.Screen name="chats" options={{ title: 'Chats', tabBarIcon: icon('chatbubbles') }} />
      <Tabs.Screen name="reels" options={{ title: 'Reels', tabBarIcon: icon('flash') }} />
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
    </Tabs>
  );
}
