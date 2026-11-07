import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Card, ErrorBox, Field, P, Page } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';

/** Permanently deletes the account (Play Store requirement). Asks for the password again. */
export default function DeleteAccount() {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    if (!password) return setError(t('enter_password'));
    Alert.alert(t('delete_account'), t('delete_account_warn'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('yes_delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          setError(null);
          try {
            await api.deleteAccount(password); // signs out → Gate shows the welcome screen
          } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <Page>
      <Stack.Screen options={{ title: t('delete_account') }} />
      <Card>
        <ErrorBox message={error} />
        <P style={{ marginBottom: 12 }}>{t('delete_account_warn')}</P>
        <Field label={t('enter_password')} ltr value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
        <Button title={t('delete_account')} variant="danger" onPress={confirm} loading={busy} />
      </Card>
    </Page>
  );
}
