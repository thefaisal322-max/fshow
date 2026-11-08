import Constants from 'expo-constants';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Text } from 'react-native';

import { Card, P, Page, Row } from '@/components/ui';
import { LANGUAGES, StringKey, useI18n } from '@/i18n';
import { account, AccountSettings } from '@/lib/account';
import { useAuth } from '@/lib/auth-context';
import { colors, themeName } from '@/theme';

export default function Settings() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const { signOut, profile, session } = useAuth();
  const langName = LANGUAGES.find((l) => l.code === lang)?.native ?? '';
  const [counts, setCounts] = useState({ messages: 0, friends: 0 });
  const [acc, setAcc] = useState<AccountSettings | null>(null);

  useFocusEffect(
    useCallback(() => {
      account.counts().then(setCounts).catch(() => {});
      if (session) account.settings(session.user.id).then(setAcc).catch(() => {});
    }, [session]),
  );

  const msgRule = acc ? t(`msg_${acc.who_can_message}` as StringKey) : undefined;
  const postsRule = acc ? t(`vis_${acc.default_visibility}` as StringKey) : undefined;
  const n = (x: number) => (x > 0 ? String(x) : undefined);

  return (
    <Page>
      <Stack.Screen options={{ title: t('settings') }} />
      <Card>
        <Row icon="person-circle-outline" label={t('personalize')} value={profile?.displayName} onPress={() => router.push('/settings/personal')} />
        <Row icon="id-card-outline" label={t('profile_details')} onPress={() => router.push('/settings/details')} last />
      </Card>
      <Card>
        <Row icon="chatbubbles-outline" label={t('message_requests')} value={n(counts.messages)} onPress={() => router.push('/settings/message-requests')} />
        <Row icon="person-add-outline" label={t('friend_requests')} value={n(counts.friends)} onPress={() => router.push('/settings/friend-requests')} last />
      </Card>
      <Card>
        <Row icon="search-outline" label={t('find_contact')} value={acc ? (acc.searchable ? t('on') : t('off')) : undefined} onPress={() => router.push('/settings/privacy')} />
        <Row icon="mail-outline" label={t('who_can_message')} value={msgRule} onPress={() => router.push('/settings/privacy')} />
        <Row icon="eye-outline" label={t('who_can_see_posts')} value={postsRule} onPress={() => router.push('/settings/privacy')} last />
      </Card>
      <Card>
        <Row icon="cash-outline" label={t('monetize')} onPress={() => router.push('/settings/monetize')} />
        <Row icon="checkmark-circle-outline" label={t('verified_sub')} onPress={() => router.push('/settings/verified')} last />
      </Card>
      <Card>
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
