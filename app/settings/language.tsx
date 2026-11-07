import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, P, Page, Row } from '@/components/ui';
import { LANGUAGES, useI18n } from '@/i18n';
import { colors } from '@/theme';

const COMING = ['اردو (Urdu)', 'العربية (Arabic)', 'Türkçe (Turkish)', 'فارسی ایران (Persian)', 'Русский (Russian)'];

export default function Language() {
  const { t, d, lang, setLang } = useI18n();
  const [more, setMore] = useState(false);

  return (
    <Page>
      <Stack.Screen options={{ title: t('language') }} />
      <Card>
        <P muted>{t('lang_installed')}</P>
        {LANGUAGES.map((l, i) => (
          <Pressable key={l.code} onPress={() => setLang(l.code)} style={[st.row, { flexDirection: d.row }, i < LANGUAGES.length - 1 && st.border]}>
            <Ionicons
              name={lang === l.code ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={lang === l.code ? colors.primary : colors.muted}
            />
            <View style={{ flex: 1, alignItems: d.items }}>
              <Text style={st.native}>{l.native}</Text>
              <Text style={st.name}>{l.name}</Text>
            </View>
          </Pressable>
        ))}
      </Card>
      <Card>
        <Row icon="download-outline" label={t('lang_more')} onPress={() => setMore((m) => !m)} last={!more} />
        {more ? (
          <View style={{ paddingTop: 8 }}>
            <P muted>{t('lang_more_sub')}</P>
            {COMING.map((c) => (
              <View key={c} style={[st.row, { flexDirection: d.row, opacity: 0.5 }]}>
                <Ionicons name="time-outline" size={20} color={colors.muted} />
                <Text style={[st.native, { flex: 1, textAlign: d.align }]}>{c}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </Page>
  );
}

const st = StyleSheet.create({
  row: { alignItems: 'center', gap: 12, paddingVertical: 12 },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  native: { fontSize: 17, fontWeight: '600', color: colors.text },
  name: { fontSize: 13, color: colors.muted },
});
