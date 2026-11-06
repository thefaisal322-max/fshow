import { Image, Text, View } from 'react-native';

import { colors } from '@/theme';

export function Avatar({ uri, name, size = 96 }: { uri?: string | null; name?: string; size?: number }) {
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={[style, { backgroundColor: colors.border }]} />;
  return (
    <View style={[style, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: '#fff', fontSize: size * 0.4, fontWeight: '700' }}>{(name ?? '?').trim().charAt(0)}</Text>
    </View>
  );
}
