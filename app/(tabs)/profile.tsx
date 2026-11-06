import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { colors, radius } from '@/theme';

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

export default function Profile() {
  const { user: profile, signOut } = useAuth();
  if (!profile) return null;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 12 }}>
      <View style={st.cover} />
      <View style={st.avatarWrap}>
        <View style={st.avatarRing}>
          <Avatar uri={profile.photoURL} name={profile.firstName} size={110} />
        </View>
      </View>
      <Text style={st.name}>{profile.displayName}</Text>
      {profile.username ? <Text style={st.username}>@{profile.username}</Text> : null}
      {profile.bio ? <Text style={st.bio}>{profile.bio}</Text> : null}

      <View style={st.stats}>
        <Stat n={profile.followingCount} label="Following" />
        <Stat n={profile.followersCount} label="Followers" />
        <Stat n={profile.likesCount} label="Likes" />
      </View>

      <View style={{ marginTop: 16 }}>
        <Button title="وتل (Logout)" variant="secondary" onPress={signOut} />
      </View>
    </ScrollView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{formatCount(n ?? 0)}</Text>
      <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  cover: { height: 140, borderRadius: radius.lg, backgroundColor: colors.primary, overflow: 'hidden' },
  avatarWrap: { alignItems: 'center', marginTop: -60 },
  avatarRing: { padding: 4, backgroundColor: '#fff', borderRadius: 999 },
  name: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 8, color: colors.text },
  username: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 2 },
  bio: { fontSize: 15, color: colors.text, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  stats: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: radius.md,
    paddingVertical: 14,
    marginTop: 16,
  },
});
