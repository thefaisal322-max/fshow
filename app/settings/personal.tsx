import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button, Card, ErrorBox, Field, OkBox, Page, Row } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { profileSignal } from '@/lib/signals';
import { nameError } from '@/lib/validation';

export default function Personal() {
  const router = useRouter();
  const { t } = useI18n();
  const { session, profile, refreshProfile } = useAuth();
  const [first, setFirst] = useState(profile?.firstName ?? '');
  const [last, setLast] = useState(profile?.lastName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFirst(profile.firstName);
      setLast(profile.lastName);
      setBio(profile.bio);
    }
  }, [profile?.id]);

  async function save() {
    const err = nameError(first) ?? nameError(last) ?? (bio.length > 150 ? t('e_invalid_input') : null);
    setError(err);
    setOk(null);
    if (err || !session) return;
    setBusy(true);
    try {
      await api.updateProfile(session.user.id, { first_name: first.trim(), last_name: last.trim(), bio: bio.trim() });
      await refreshProfile();
      profileSignal.dirty = true;
      setOk(t('saved_ok'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function changePhoto() {
    if (!session) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError(t('photos_permission'));
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    setPhotoBusy(true);
    setError(null);
    try {
      await api.uploadAvatar(session.user.id, res.assets[0].uri, profile?.photoPath ?? null);
      await refreshProfile();
      profileSignal.dirty = true;
      setOk(t('saved_ok'));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <Page>
      <Stack.Screen options={{ title: t('personalize') }} />
      <ErrorBox message={error} />
      <OkBox message={ok} />
      <Card style={{ alignItems: 'center' }}>
        <Pressable onPress={changePhoto}>
          <Avatar uri={profile?.photoURL} name={profile?.firstName} size={110} />
        </Pressable>
        <View style={{ alignSelf: 'stretch' }}>
          <Button title={t('change_photo')} variant="link" onPress={changePhoto} loading={photoBusy} />
        </View>
      </Card>
      <Card>
        <Field label={t('first_name')} value={first} onChangeText={setFirst} maxLength={40} />
        <Field label={t('last_name')} value={last} onChangeText={setLast} maxLength={40} />
        <Field label={t('bio_optional')} value={bio} onChangeText={setBio} maxLength={150} multiline placeholder={t('bio_placeholder')} />
        <Button title={t('save')} onPress={save} loading={busy} />
      </Card>
      <Card>
        <Row icon="mail-outline" label={t('change_email')} value={session?.user.email} onPress={() => router.push('/settings/email')} />
        <Row icon="key-outline" label={t('change_password')} onPress={() => router.push('/settings/password')} last />
      </Card>
    </Page>
  );
}
