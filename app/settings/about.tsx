import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { Image, Text } from 'react-native';

import { Card, P, Page } from '@/components/ui';
import { useI18n } from '@/i18n';
import { colors } from '@/theme';

export default function About() {
  const { t } = useI18n();
  return (
    <Page>
      <Stack.Screen options={{ title: t('about') }} />
      <Card style={{ alignItems: 'center' }}>
        <Image source={require('../../assets/logo-mark.png')} style={{ width: 110, height: 110 }} resizeMode="contain" />
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.primary, marginTop: 8 }}>Faisal Show</Text>
        <Text style={{ color: colors.muted, marginBottom: 12 }}>{t('version', { v: Constants.expoConfig?.version ?? '' })}</Text>
      </Card>
      <Card>
        <P>{t('about_text')}</P>
      </Card>
    </Page>
  );
}
