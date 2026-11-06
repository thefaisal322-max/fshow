import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button, ErrorBox, FormScreen, Steps, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { uploadAvatar } from '@/lib/upload';

export default function Photo() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('د عکسونو اجازه ورکړئ ترڅو عکس غوره کړئ');
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
    if (!user || !localUri) return;
    setBusy(true);
    setError(null);
    try {
      await uploadAvatar(user.uid, localUri);
      router.push('/username');
    } catch (e: any) {
      setError(e?.message === 'too-big' ? 'عکس ډېر لوی دی (تر 5MB کم)' : 'عکس پورته نه شو. بیا هڅه وکړئ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen>
      <Steps current={4} total={4} />
      <Title sub="خلک به تاسو په دې عکس وپېژني">خپل عکس واچوئ</Title>
      <ErrorBox message={error} />
      <View style={{ alignItems: 'center', marginVertical: 16 }}>
        <Pressable onPress={pick}>
          <Avatar uri={localUri ?? profile?.photoURL} name={profile?.firstName} size={140} />
        </Pressable>
      </View>
      {localUri ? (
        <>
          <Button title="خوندي کول او مخته" onPress={save} loading={busy} />
          <Button title="بل عکس" variant="secondary" onPress={pick} disabled={busy} />
        </>
      ) : (
        <Button title="عکس غوره کړئ" onPress={pick} />
      )}
      <Button title="اوس نه" variant="link" onPress={() => router.push('/username')} disabled={busy} />
    </FormScreen>
  );
}
