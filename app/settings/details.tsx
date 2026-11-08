import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { Button, Card, ErrorBox, Field, OkBox, P, Page } from '@/components/ui';
import { useI18n } from '@/i18n';
import { account, AccountSettings } from '@/lib/account';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { profileSignal } from '@/lib/signals';
import { colors } from '@/theme';

type Details = Pick<AccountSettings, 'city' | 'hometown' | 'work' | 'education' | 'website'>;

/** City, hometown, work, school, website — shown in the "Intro" box on the profile. */
export default function ProfileDetails() {
  const { t } = useI18n();
  const { session } = useAuth();
  const uid = session?.user.id ?? '';
  const [v, setV] = useState<Details | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (uid)
      account
        .settings(uid)
        .then((s) => setV({ city: s.city, hometown: s.hometown, work: s.work, education: s.education, website: s.website }))
        .catch((e) => setError(errorMessage(e)));
  }, [uid]);

  async function save() {
    if (!v) return;
    let website = v.website.trim();
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
    if (website && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(website)) {
      setError(t('e_website'));
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const clean = { city: v.city.trim(), hometown: v.hometown.trim(), work: v.work.trim(), education: v.education.trim(), website };
      await account.save(uid, clean);
      setV(clean);
      profileSignal.dirty = true;
      setOk(t('saved_ok'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof Details) => (text: string) => setV((old) => (old ? { ...old, [k]: text } : old));

  return (
    <Page>
      <Stack.Screen options={{ title: t('profile_details') }} />
      <ErrorBox message={error} />
      <OkBox message={ok} />
      {!v ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <Card>
          <P muted>{t('details_sub')}</P>
          <Field label={`🏙️ ${t('d_city')}`} value={v.city} onChangeText={set('city')} maxLength={80} placeholder="Kabul" />
          <Field label={`🏡 ${t('d_hometown')}`} value={v.hometown} onChangeText={set('hometown')} maxLength={80} placeholder="Nangarhar" />
          <Field label={`💼 ${t('d_work')}`} value={v.work} onChangeText={set('work')} maxLength={100} placeholder="Fainet.org" />
          <Field label={`🎓 ${t('d_education')}`} value={v.education} onChangeText={set('education')} maxLength={100} placeholder="Kabul University" />
          <Field
            label={`🔗 ${t('d_website')}`}
            value={v.website}
            onChangeText={set('website')}
            maxLength={200}
            placeholder="https://fainet.org"
            autoCapitalize="none"
            keyboardType="url"
            ltr
          />
          <Button title={t('save')} onPress={save} loading={busy} />
        </Card>
      )}
    </Page>
  );
}
