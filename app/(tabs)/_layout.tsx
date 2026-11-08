import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { useUnread } from '@/lib/notifications';
import { colors } from '@/theme';

export const unstable_settings = { initialRouteName: 'index' };

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName) => ({ color, size }: { color: string; size: number }) => (
  <Ionicons name={name} color={color} size={size} />
);

function HeaderButton({ name, onPress, badge }: { name: IconName; onPress: () => void; badge?: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={st.hBtn}>
      <Ionicons name={name} size={22} color={colors.text} />
      {badge ? (
        <View style={st.badge}>
          <Text style={st.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Tabs: Home (🔍 + 💬 in the header), Reels, Notifications, Profile (⚙️ in the header). */
export default function TabsLayout() {
  const router = useRouter();
  const { t, d } = useI18n();
  const { unread, chatUnread } = useUnread();

  const homeButtons = () => (
    <View style={{ flexDirection: 'row', gap: 4, marginHorizontal: 8 }}>
      <HeaderButton name="search" onPress={() => router.push('/search')} />
      <HeaderButton name="chatbubble-ellipses" onPress={() => router.push('/chats')} badge={chatUnread} />
    </View>
  );
  const settingsButton = () => (
    <View style={{ marginHorizontal: 8 }}>
      <HeaderButton name="settings-outline" onPress={() => router.push('/settings')} />
    </View>
  );
  // Put header buttons on the reading-end side: left in Pashto/Dari, right in English.
  const side = (render: () => ReactElement) => (d.rtl ? { headerLeft: render } : { headerRight: render });

  // In RTL the first tab sits on the right, so we list them in reverse.
  const screens = [
    <Tabs.Screen key="index" name="index" options={{ title: t('tab_home'), tabBarIcon: icon('home'), ...side(homeButtons) }} />,
    <Tabs.Screen key="reels" name="reels" options={{
        title: t('tab_reels'),
        tabBarIcon: icon('play-circle'),
        headerShown: false,
        // black bar on Reels, like TikTok
        tabBarStyle: { backgroundColor: '#000', borderTopColor: '#1a1a1a' },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#8a8a8a',
      }} />,
    <Tabs.Screen
      key="notifications"
      name="notifications"
      options={{
        title: t('tab_noti'),
        tabBarIcon: icon('notifications'),
        tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
      }}
    />,
    <Tabs.Screen key="profile" name="profile" options={{ title: t('tab_profile'), tabBarIcon: icon('person'), ...side(settingsButton) }} />,
  ];

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
      {d.rtl ? screens.reverse() : screens}
    </Tabs>
  );
}

const st = StyleSheet.create({
  hBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
