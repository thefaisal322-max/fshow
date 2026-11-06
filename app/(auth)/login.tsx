import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorBox, Field, FormScreen, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { isValidEmail, normalizeEmail } from '@/lib/validation';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const e = normalizeEmail(email);
    if (!isValidEmail(e) || !password) {
      setError('ایمیل او پاسورډ ولیکئ');
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
      <Title>ننوتل</Title>
      <ErrorBox message={error} />
      <Field
        label="ایمیل"
        ltr
        value={email}
        onChangeText={setEmail}
        placeholder="name@fainet.org"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Field
        label="پاسورډ"
        ltr
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        onSubmitEditing={submit}
      />
      <Button title="ننوتل" onPress={submit} loading={busy} />
      <Button title="پاسورډ مو هېر دی؟" variant="link" onPress={() => router.push('/forgot')} />
      <Button title="حساب نه لرئ؟ Sign up" variant="link" onPress={() => router.replace('/signup')} />
    </FormScreen>
  );
}
