import { Stack } from 'expo-router';

import { Card, P, Page } from '@/components/ui';
import { useI18n } from '@/i18n';

export default function Policy() {
  const { t } = useI18n();
  return (
    <Page>
      <Stack.Screen options={{ title: t('privacy_policy') }} />
      <Card>
        <P>{t('policy_text')}</P>
      </Card>
    </Page>
  );
}
