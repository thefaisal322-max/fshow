import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PostList, PostListHandle } from '@/components/PostList';
import { feedSignal } from '@/lib/signals';
import { social } from '@/lib/social';
import { colors } from '@/theme';

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<'foryou' | 'following'>('foryou');
  const list = useRef<PostListHandle>(null);
  const load = useCallback((offset: number) => social.feed(mode, offset), [mode]);

  useFocusEffect(
    useCallback(() => {
      if (feedSignal.dirty) {
        feedSignal.dirty = false;
        list.current?.reload();
      }
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={st.tabs}>
        <Tab label="For You" active={mode === 'foryou'} onPress={() => setMode('foryou')} />
        <Tab label="Following" active={mode === 'following'} onPress={() => setMode('following')} />
      </View>
      <PostList
        ref={list}
        load={load}
        empty={mode === 'following' ? 'تاسو لا هېچا ته Follow نه دی کړی.\nد لټون (Search) له لارې خلک ومومئ.' : 'تر اوسه هېڅ پوسټ نشته. لومړی پوسټ تاسو واچوئ!'}
      />
      <Pressable style={st.fab} onPress={() => router.push('/create')}>
        <Ionicons name="add" size={30} color="#fff" />
      </Pressable>
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[st.tab, active && st.tabOn]}>
      <Text style={[st.tabText, active && { color: colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  tabs: { flexDirection: 'row-reverse', backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 15, fontWeight: '700', color: colors.muted },
  fab: {
    position: 'absolute',
    left: 18,
    bottom: 18,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
