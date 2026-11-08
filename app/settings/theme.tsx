import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, P, Page } from '@/components/ui';
import { StringKey, useI18n } from '@/i18n';
import { colors, radius, setTheme, ThemeName, themeName, THEMES } from '@/theme';

const ORDER: { name: ThemeName; label: StringKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'classic', label: 'theme_classic', icon: 'sunny' },
  { name: 'pink', label: 'theme_pink', icon: 'diamond' },
  { name: 'dark', label: 'theme_dark', icon: 'moon' },
  { name: 'night', label: 'theme_night', icon: 'sparkles' },
];

/** Pick a theme. Each card is a tiny preview of the app in that theme. */
export default function Theme() {
  const { t, d } = useI18n();
  const [busy, setBusy] = useState<ThemeName | null>(null);

  async function choose(name: ThemeName) {
    if (name === themeName || busy) return;
    setBusy(name);
    try {
      await setTheme(name);
    } catch {
      setBusy(null);
      Alert.alert('', t('e_generic'));
    }
  }

  return (
    <Page>
      <Stack.Screen options={{ title: t('theme') }} />
      <Card>
        <P muted>{t('theme_sub')}</P>
        <View style={[st.grid, { flexDirection: d.row }]}>
          {ORDER.map((o) => {
            const p = THEMES[o.name];
            const on = o.name === themeName;
            return (
              <Pressable key={o.name} onPress={() => choose(o.name)} style={[st.item, on && { borderColor: colors.primary }]}>
                <View style={[st.preview, { backgroundColor: p.bg }]}>
                  <View style={[st.bar, { backgroundColor: p.card }]}>
                    <Text style={{ color: p.primary, fontWeight: '900', fontSize: 11 }}>Faisal Show</Text>
                  </View>
                  <View style={[st.post, { backgroundColor: p.card }]}>
                    <View style={[st.dot, { backgroundColor: p.primary }]} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={[st.line, { backgroundColor: p.text, width: '70%' }]} />
                      <View style={[st.line, { backgroundColor: p.muted, width: '45%' }]} />
                    </View>
                  </View>
                  <View style={[st.post, { backgroundColor: p.card, height: 34 }]}>
                    <View style={[st.btn, { backgroundColor: p.gradient[0] }]} />
                    <View style={[st.btn, { backgroundColor: p.gradient[1] }]} />
                    <View style={[st.btn, { backgroundColor: p.gradient[2] }]} />
                  </View>
                </View>
                <View style={[st.label, { flexDirection: d.row }]}>
                  {busy === o.name ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name={on ? 'checkmark-circle' : o.icon} size={18} color={on ? colors.primary : colors.muted} />
                  )}
                  <Text style={[st.name, on && { color: colors.primary }]}>{t(o.label)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </Page>
  );
}

const st = StyleSheet.create({
  grid: { flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginTop: 8 },
  item: { width: '47%', borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, overflow: 'hidden' },
  preview: { height: 150, padding: 8, gap: 6 },
  bar: { height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  post: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, padding: 8 },
  dot: { width: 20, height: 20, borderRadius: 10 },
  line: { height: 5, borderRadius: 3 },
  btn: { flex: 1, height: 14, borderRadius: 7 },
  label: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: colors.card },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
});
