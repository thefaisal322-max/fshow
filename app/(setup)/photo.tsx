import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button, ErrorBox, FormScreen, Steps, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function Photo() {
  const router = useRouter();
  const { user, setUser } = useAuth();
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
      const res = await api.uploadAvatar(localUri);
      setUser(res.user);
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
      <Title sub="خلک به تاسو په دې عکس وپېژني">خپل عکس واچوئ</Title>
      <ErrorBox message={error} />
      <View style={{ alignItems: 'center', marginVertical: 16 }}>
        <Pressable onPress={pick}>
          <Avatar uri={localUri ?? user?.photoURL} name={user?.firstName} size={140} />
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
