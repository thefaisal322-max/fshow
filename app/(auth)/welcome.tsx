import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, FormScreen, Title } from '@/components/ui';
import { LANGUAGES, useI18n } from '@/i18n';
import { colors, radius } from '@/theme';

export default function Welcome() {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  return (
    <FormScreen>
      <View style={st.langs}>
        {LANGUAGES.map((l) => (
          <Pressable key={l.code} onPress={() => setLang(l.code)} style={[st.lang, lang === l.code && st.langOn]}>
            <Text style={[st.langText, lang === l.code && { color: '#fff' }]}>{l.native}</Text>
          </Pressable>
        ))}
      </View>
      <Title sub={t('welcome_sub')}>{t('welcome_title')}</Title>
      <Button title={t('signup_btn')} onPress={() => router.push('/signup')} />
      <Button title={t('login_btn')} variant="secondary" onPress={() => router.push('/login')} />
    </FormScreen>
  );
}

const st = StyleSheet.create({
  langs: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 18 },
  lang: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
  langOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { fontWeight: '600', color: colors.text },
});
