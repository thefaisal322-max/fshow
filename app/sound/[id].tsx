import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ReelGrid } from '@/components/ReelGrid';
import { useI18n } from '@/i18n';
import { authorName, formatCount, Post, social, Sound, soundUrl } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { colors, radius } from '@/theme';

/** A sound (like TikTok's sound page): who made it, listen, "Use this sound", and every reel that uses it. */
export default function SoundScreen() {
  const { t, d } = useI18n();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [sound, setSound] = useState<Sound | null>(null);

  const load = useCallback(
    async (offset: number): Promise<Post[]> => {
      const r = await social.getSound(String(id), offset);
      if (r && offset === 0) setSound(r.sound);
      return r?.reels ?? [];
    },
    [id],
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('sound'), headerTitleAlign: 'center' }} />
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ReelGrid
          load={load}
          empty={t('no_reels')}
          onOpen={(p) => router.push({ pathname: '/sound/play', params: { id: String(id), start: p.id, name: sound?.title ?? '' } })}
          header={
            sound ? (
              <View style={st.head}>
                <View style={{ flexDirection: d.row, alignItems: 'center', gap: 14 }}>
                  <Listen sound={sound} />
                  <View style={{ flex: 1, alignItems: d.items }}>
                    <Text style={st.title} numberOfLines={2}>
                      {sound.title}
                    </Text>
                    <Pressable
                      onPress={() => router.push({ pathname: '/user/[id]', params: { id: sound.owner.id } })}
                      style={{ flexDirection: d.row, alignItems: 'center', gap: 6, marginTop: 4 }}
                    >
                      <Avatar uri={avatarUrl(sound.owner.photo_path)} name={sound.owner.first_name} size={20} />
                      <Text style={st.owner}>{authorName(sound.owner)}</Text>
                    </Pressable>
                    <Text style={st.sub}>{t('sound_uses', { n: formatCount(sound.uses_count) })}</Text>
                  </View>
                </View>
                <Pressable onPress={() => router.push({ pathname: '/create', params: { sound: sound.id, soundTitle: sound.title } })} style={st.use}>
                  <Ionicons name="musical-notes" size={18} color="#fff" />
                  <Text style={st.useText}>{t('use_sound')}</Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      </View>
    </>
  );
}

/** Square cover with the owner's photo; tap to listen. */
function Listen({ sound }: { sound: Sound }) {
  const url = soundUrl(sound);
  const player = useAudioPlayer(url ? { uri: url } : null);
  const status = useAudioPlayerStatus(player);
  useEffect(() => () => player.pause(), [player]);
  return (
    <Pressable
      onPress={() => {
        if (status.playing) player.pause();
        else {
          setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
          if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.2)) player.seekTo(0).catch(() => {});
          player.play();
        }
      }}
      style={st.cover}
    >
      <Avatar uri={avatarUrl(sound.owner.photo_path)} name={sound.owner.first_name} size={84} />
      <View style={st.play}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={30} color="#fff" />
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  head: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, marginBottom: 8, gap: 14 },
  cover: { width: 84, height: 84, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  play: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '900', color: colors.text },
  owner: { fontSize: 14, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 4 },
  use: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FE2C55', borderRadius: radius.md, paddingVertical: 12 },
  useText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
