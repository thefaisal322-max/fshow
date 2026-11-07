import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Card, ErrorBox, Field, Page } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { passwordError } from '@/lib/validation';

export default function ChangePassword() {
  const router = useRouter();
  const { t } = useI18n();
  const { session } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const err = (!current ? t('enter_password') : null) ?? passwordError(next) ?? (next !== next2 ? t('v_passwords_match') : null);
    setError(err);
    if (err || !session?.user.email) return;
    setBusy(true);
    try {
      await api.changePassword(session.user.email, current, next);
      Alert.alert('', t('password_changed'));
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <Stack.Screen options={{ title: t('change_password') }} />
      <Card>
        <ErrorBox message={error} />
        <Field label={t('current_password')} ltr value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" autoComplete="current-password" />
        <Field label={t('new_password')} ltr value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" autoComplete="new-password" placeholder="fai123@afg" />
        <Field label={t('new_password_again')} ltr value={next2} onChangeText={setNext2} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
        <Button title={t('change_password_btn')} onPress={save} loading={busy} />
      </Card>
    </Page>
  );
}
