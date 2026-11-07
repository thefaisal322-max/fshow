import { useState } from 'react';
import { Text } from 'react-native';

import { Button, ErrorBox, Field, FormScreen, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { normalizeUsername, usernameError } from '@/lib/validation';
import { colors } from '@/theme';
import { useI18n } from '@/i18n';

export default function Username() {
  const { t } = useI18n();
  const { setProfileRow } = useAuth();
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = normalizeUsername(username);

  async function save() {
    const err = usernameError(clean);
    setError(err);
    if (err) return;
    setBusy(true);
    try {
      setProfileRow(await api.claimUsername(clean, bio.trim()));
      // profileComplete becomes true on the server → Gate opens the app.
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen>
      <Title sub={t('username_sub')}>{t('username_title')}</Title>
      <ErrorBox message={error} />
      <Field
        label="ID Name"
        ltr
        value={username}
        onChangeText={(t) => setUsername(t.toLowerCase().replace(/\s/g, ''))}
        placeholder="faisal.khan"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
      />
      {clean ? <Text style={{ textAlign: 'left', color: colors.muted, marginTop: -6, marginBottom: 12 }}>@{clean}</Text> : null}
      <Field
        label={t('bio_optional')}
        value={bio}
        onChangeText={setBio}
        placeholder={t('bio_placeholder')}
        maxLength={150}
        multiline
      />
      <Button title={t('start')} onPress={save} loading={busy} />
    </FormScreen>
  );
}
