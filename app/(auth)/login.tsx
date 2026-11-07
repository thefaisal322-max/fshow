import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorBox, Field, FormScreen, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { isValidEmail, normalizeEmail } from '@/lib/validation';
import { useI18n } from '@/i18n';

export default function Login() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const e = normalizeEmail(email);
    if (!isValidEmail(e) || !password) {
      setError(t('enter_email_password'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.login(e, password);
      // The root Gate redirects automatically once the user is logged in.
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen>
      <Title>{t('login_title')}</Title>
      <ErrorBox message={error} />
      <Field
        label={t('email')}
        ltr
        value={email}
        onChangeText={setEmail}
        placeholder="name@fainet.org"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Field
        label={t('password')}
        ltr
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        onSubmitEditing={submit}
      />
      <Button title={t('login_title')} onPress={submit} loading={busy} />
      <Button title={t('forgot_q')} variant="link" onPress={() => router.push('/forgot')} />
      <Button title={t('no_account')} variant="link" onPress={() => router.replace('/signup')} />
    </FormScreen>
  );
}
