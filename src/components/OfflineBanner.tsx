import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { useOffline } from '@/lib/offline';

/** Small bar: "No internet — showing saved posts". Hidden when online. */
export function OfflineBanner({ dark }: { dark?: boolean }) {
  const { t, d } = useI18n();
  const offline = useOffline();
  if (!offline) return null;
  return (
    <View style={[st.bar, { flexDirection: d.row }, dark && { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
      <Ionicons name="cloud-offline" size={15} color="#fff" />
      <Text style={st.text}>{t('offline_bar')}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  bar: { alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#5B6470', paddingVertical: 6, paddingHorizontal: 10 },
  text: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
