import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { HomeHeader, PeopleYouMayKnow, ReelsRow } from '@/components/HomeSections';
import { PostList, PostListHandle } from '@/components/PostList';
import { feedSignal } from '@/lib/signals';
import { social } from '@/lib/social';
import { colors } from '@/theme';
import { useI18n } from '@/i18n';

export default function Home() {
  const { t, d } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<'foryou' | 'following'>('foryou');
  const list = useRef<PostListHandle>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const load = useCallback((offset: number) => social.feed(mode, offset), [mode]);

  useFocusEffect(
    useCallback(() => {
      // refresh stories every time Home is shown (they change often)
      setRefreshKey((k) => k + 1);
      if (feedSignal.dirty) {
        feedSignal.dirty = false;
        list.current?.reload();
      }
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[st.tabs, { flexDirection: d.row }]}>
        <Tab label={t('for_you')} active={mode === 'foryou'} onPress={() => setMode('foryou')} />
        <Tab label={t('following')} active={mode === 'following'} onPress={() => setMode('following')} />
      </View>
      <PostList
        ref={list}
        load={load}
        header={<HomeHeader refreshKey={refreshKey} />}
        extraAfter={(i) => (i === 1 ? <PeopleYouMayKnow /> : i === 4 ? <ReelsRow /> : null)}
        footerExtra={
          <>
            <PeopleYouMayKnow />
            <ReelsRow />
          </>
        }
        empty={mode === 'following' ? t('empty_following') : t('empty_feed')}
      />
      <Pressable style={[st.fab, d.rtl ? { left: 18 } : { right: 18 }]} onPress={() => router.push('/create')}>
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
  tabs: { backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.primary },
  tabText: { fontSize: 15, fontWeight: '700', color: colors.muted },
  fab: {
    position: 'absolute',
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
