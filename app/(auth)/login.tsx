import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { accounts, SavedAccount } from '@/lib/accounts';
import { avatarUrl } from '@/lib/supabase';
import { colors } from '@/theme';

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
  // accounts saved on this phone ("Switch account") — one tap to continue
  const [saved, setSaved] = useState<SavedAccount[]>([]);
  useEffect(() => {
    accounts.list().then(setSaved).catch(() => {});
  }, []);

  async function continueAs(a: SavedAccount) {
    setError(null);
    setBusy(true);
    try {
      await accounts.switchTo(a.id);
    } catch (err) {
      setError(errorMessage(err));
      setSaved(await accounts.list());
    } finally {
      setBusy(false);
    }
  }

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
      {saved.length ? (
        <View style={{ gap: 8, marginBottom: 16 }}>
          {saved.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => continueAs(a)}
              disabled={busy}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 10 }}
            >
              <Avatar uri={avatarUrl(a.photo_path)} name={a.name} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '700', color: colors.text }}>{t('acc_continue', { name: a.name })}</Text>
                {a.username ? <Text style={{ color: colors.muted, fontSize: 12 }}>@{a.username}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
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
