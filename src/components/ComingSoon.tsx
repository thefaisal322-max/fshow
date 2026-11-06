import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { colors } from '@/theme';

export function ComingSoon({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 }}>
      <Ionicons name={icon} size={64} color={colors.border} />
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginTop: 12 }}>{title}</Text>
      <Text style={{ color: colors.muted, marginTop: 6 }}>ژر راځي</Text>
    </View>
  );
}
