import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { Alert, Text } from 'react-native';

import { Card, P, Page, Row } from '@/components/ui';
import { LANGUAGES, StringKey, useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth-context';
import { colors, themeName } from '@/theme';

export default function Settings() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const { signOut, profile } = useAuth();
  const langName = LANGUAGES.find((l) => l.code === lang)?.native ?? '';

  return (
    <Page>
      <Stack.Screen options={{ title: t('settings') }} />
      <Card>
        <Row icon="person-circle-outline" label={t('personalize')} value={profile?.displayName} onPress={() => router.push('/settings/personal')} />
        <Row icon="language-outline" label={t('language')} value={langName} onPress={() => router.push('/settings/language')} />
        <Row icon="color-palette-outline" label={t('theme')} value={t(`theme_${themeName}` as StringKey)} onPress={() => router.push('/settings/theme')} last />
      </Card>
      <Card>
        <Row icon="shield-checkmark-outline" label={t('privacy_policy')} onPress={() => router.push('/settings/policy')} />
        <Row icon="information-circle-outline" label={t('about')} onPress={() => router.push('/settings/about')} last />
      </Card>
      <Card>
        <Row
          icon="log-out-outline"
          label={t('logout')}
          onPress={() =>
            Alert.alert(t('logout_q'), '', [
              { text: t('cancel'), style: 'cancel' },
              { text: t('logout'), style: 'destructive', onPress: signOut },
            ])
          }
        />
        <Row icon="trash-outline" label={t('delete_account')} color={colors.error} onPress={() => router.push('/settings/delete')} last />
      </Card>
      <P muted style={{ textAlign: 'center' }}>{t('verified_info')}</P>
      <Text style={{ textAlign: 'center', color: colors.muted, marginTop: 12, fontSize: 12 }}>
        Faisal Show · {t('version', { v: Constants.expoConfig?.version ?? '' })}
      </Text>
    </Page>
  );
}
