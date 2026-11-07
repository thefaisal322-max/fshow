import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button, ErrorBox, FormScreen, Steps, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/i18n';

export default function Photo() {
  const { t } = useI18n();
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError(t('photos_permission'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!res.canceled && res.assets[0]) setLocalUri(res.assets[0].uri);
  }

  async function save() {
    if (!session || !localUri) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadAvatar(session.user.id, localUri, profile?.photoPath ?? null);
      await refreshProfile();
      router.push('/username');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen>
      <Steps current={4} total={4} />
      <Title sub={t('photo_sub')}>{t('photo_title')}</Title>
      <ErrorBox message={error} />
      <View style={{ alignItems: 'center', marginVertical: 16 }}>
        <Pressable onPress={pick}>
          <Avatar uri={localUri ?? profile?.photoURL} name={profile?.firstName} size={140} />
        </Pressable>
      </View>
      {localUri ? (
        <>
          <Button title={t('save_next')} onPress={save} loading={busy} />
          <Button title={t('other_photo')} variant="secondary" onPress={pick} disabled={busy} />
        </>
      ) : (
        <Button title={t('choose_photo')} onPress={pick} />
      )}
      <Button title={t('not_now')} variant="link" onPress={() => router.push('/username')} disabled={busy} />
    </FormScreen>
  );
}
