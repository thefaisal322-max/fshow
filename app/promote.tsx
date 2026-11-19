import { Ionicons } from '@expo/vector-icons';
import { PackGate } from '@/components/PackGate';
import * as Clipboard from 'expo-clipboard';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Coin } from '@/components/Coin';
import { Card, P, Page } from '@/components/ui';
import { StringKey, useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { coins, offerPrice, postIdFromLink, Promotion, PROMO_UNIT, Wallet } from '@/lib/coins';
import { authorName, formatCount, Post, postImageUrl, social } from '@/lib/social';
import { colors, radius } from '@/theme';

const KINDS: { k: Promotion['kind']; icon: string; label: StringKey }[] = [
  { k: 'likes', icon: '❤️', label: 'pr_likes' },
  { k: 'plays', icon: '▶️', label: 'pr_plays' },
  { k: 'views', icon: '👁️', label: 'pr_views' },
];

/**
 * Promote a post (mine or anyone's, by pasting its link): 100 FC = 150 likes, or 100 plays, or 300 views.
 * The post is shown first in For You to real people until it reaches the number.
 */
function PromoteScreenInner() {
  const { t, d } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ post?: string }>();
  const [link, setLink] = useState(params.post ? String(params.post) : '');
  const [post, setPost] = useState<Post | null>(null);
  const [finding, setFinding] = useState(false);
  const [kind, setKind] = useState<Promotion['kind']>('views');
  const [units, setUnits] = useState(1);
  const [w, setW] = useState<Wallet | null>(null);
  const [mine, setMine] = useState<Promotion[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    coins.wallet().then(setW).catch(() => {});
    coins.myPromotions().then(setMine).catch(() => {});
  }, []);
  useFocusEffect(load);

  useEffect(() => {
    const id = postIdFromLink(link);
    if (!id) {
      setPost(null);
      return;
    }
    let alive = true;
    setFinding(true);
    social
      .post(id)
      .then((p) => {
        if (!alive) return;
        setPost(p);
        if (p && !p.video_path && kind === 'plays') setKind('views');
      })
      .catch(() => alive && setPost(null))
      .finally(() => alive && setFinding(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  const price = offerPrice(w, 100 * units);
  const target = PROMO_UNIT[kind] * units;
  const canAfford = !!w && (w.unlimited || w.balance >= price);

  async function promote() {
    if (!post) return;
    setBusy(true);
    try {
      const r = await coins.promote(post.id, kind, units);
      Alert.alert('📣', t('pr_done', { n: formatCount(r.target), kind: t(KINDS.find((x) => x.k === kind)!.label) }));
      load();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const thumb = post ? postImageUrl(post.thumb_path ?? post.image_path) : null;

  return (
    <Page>
      <Stack.Screen options={{ headerShown: true, title: t('promote'), headerTitleAlign: 'center' }} />
      <Card>
        <P muted>{t('promote_sub')}</P>
        <View style={[st.linkRow, { flexDirection: d.row }]}>
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder={t('pr_paste')}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={[st.input, { flex: 1, textAlign: d.align }]}
          />
          <Pressable
            onPress={async () => {
              const s = await Clipboard.getStringAsync();
              if (s) setLink(s);
            }}
            style={st.paste}
          >
            <Ionicons name="clipboard-outline" size={20} color="#fff" />
          </Pressable>
        </View>
        {finding ? <ActivityIndicator color={colors.primary} /> : null}
        {post ? (
          <Pressable onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })} style={[st.post, { flexDirection: d.row }]}>
            {thumb ? <Image source={{ uri: thumb }} style={st.thumb} /> : <View style={[st.thumb, st.thumbEmpty]}><Ionicons name="document-text" size={24} color={colors.muted} /></View>}
            <View style={{ flex: 1, alignItems: d.items }}>
              <Text style={st.postName}>{authorName(post.author)}</Text>
              <Text style={st.small} numberOfLines={2}>
                {post.video_path ? '🎬 ' : ''}
                {post.body || '—'}
              </Text>
              <Text style={st.small}>
                ❤️ {formatCount(post.likes_count)} · 👁️ {formatCount(post.views_count)}
              </Text>
            </View>
          </Pressable>
        ) : link && !finding ? (
          <Text style={[st.small, { color: colors.error, textAlign: d.align }]}>{t('pr_not_found')}</Text>
        ) : null}
      </Card>

      {post ? (
        <Card>
          <View style={[st.kinds, { flexDirection: d.row }]}>
            {KINDS.filter((x) => x.k !== 'plays' || post.video_path).map((x) => {
              const on = kind === x.k;
              return (
                <Pressable key={x.k} onPress={() => setKind(x.k)} style={[st.kind, on && st.kindOn]}>
                  <Text style={{ fontSize: 22 }}>{x.icon}</Text>
                  <Text style={[st.kindN, on && { color: '#fff' }]}>{PROMO_UNIT[x.k]}</Text>
                  <Text style={[st.kindLabel, on && { color: '#fff' }]}>{t(x.label)}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={[st.units, { flexDirection: d.row }]}>
            <Pressable onPress={() => setUnits((u) => Math.max(1, u - 1))} style={st.step}>
              <Ionicons name="remove" size={22} color={colors.text} />
            </Pressable>
            <View style={{ alignItems: 'center', minWidth: 120 }}>
              <Text style={st.target}>
                {formatCount(target)} {t(KINDS.find((x) => x.k === kind)!.label)}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Coin size={16} />
                <Text style={st.price}>{formatCount(price)} FC</Text>
                {price < 100 * units ? <Text style={st.old}>{formatCount(100 * units)}</Text> : null}
              </View>
            </View>
            <Pressable onPress={() => setUnits((u) => Math.min(100, u + 1))} style={st.step}>
              <Ionicons name="add" size={22} color={colors.text} />
            </Pressable>
          </View>
          <Text style={[st.small, { textAlign: 'center' }]}>
            {t('fc_balance')}: {w?.unlimited ? '∞' : formatCount(w?.balance ?? 0)} FC · {t('pr_split')}
          </Text>
          {canAfford ? (
            <Pressable onPress={promote} disabled={busy} style={st.btn}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>📣 {t('promote')}</Text>}
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push('/settings/fc')} style={[st.btn, { backgroundColor: '#F2994A' }]}>
              <Text style={st.btnText}>{t('fc_get_more')}</Text>
            </Pressable>
          )}
        </Card>
      ) : null}

      {mine.length ? (
        <Card>
          <Text style={[st.h, { textAlign: d.align }]}>{t('pr_mine')}</Text>
          {mine.map((p) => {
            const pct = Math.min(1, p.done / p.target);
            return (
              <Pressable key={p.id} onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.post_id } })} style={{ paddingVertical: 8 }}>
                <Text style={[st.postName, { textAlign: d.align }]} numberOfLines={1}>
                  {KINDS.find((x) => x.k === p.kind)?.icon} {formatCount(p.done)}/{formatCount(p.target)} · {p.body || '—'}
                </Text>
                <View style={st.track}>
                  <View style={[st.fill, { width: `${Math.round(pct * 100)}%` as `${number}%` }]} />
                </View>
              </Pressable>
            );
          })}
        </Card>
      ) : null}
    </Page>
  );
}

const st = StyleSheet.create({
  linkRow: { gap: 8, alignItems: 'center', marginTop: 8 },
  input: { backgroundColor: colors.input, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text },
  paste: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  post: { gap: 10, alignItems: 'center', marginTop: 10, backgroundColor: colors.surface, borderRadius: radius.md, padding: 8 },
  thumb: { width: 56, height: 72, borderRadius: radius.sm, backgroundColor: colors.border },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  postName: { fontWeight: '800', color: colors.text, fontSize: 14 },
  small: { fontSize: 12, color: colors.muted, marginTop: 2 },
  kinds: { gap: 8, marginBottom: 12 },
  kind: { flex: 1, alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, gap: 2 },
  kindOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  kindN: { fontSize: 18, fontWeight: '900', color: colors.text },
  kindLabel: { fontSize: 12, color: colors.muted },
  units: { alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 8 },
  step: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  target: { fontSize: 18, fontWeight: '900', color: colors.text },
  price: { fontSize: 16, fontWeight: '800', color: '#E6A100' },
  old: { fontSize: 13, color: colors.muted, textDecorationLine: 'line-through' },
  btn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  h: { fontSize: 16, fontWeight: '900', color: colors.text, marginBottom: 4 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden', marginTop: 4 },
  fill: { height: 6, backgroundColor: colors.success },
});

/** needs the downloaded "FC & Live" pack */
export default function PromoteScreen() {
  const { t } = useI18n();
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('promote'), headerTitleAlign: 'center' }} />
      <PackGate need="fc">
        <PromoteScreenInner />
      </PackGate>
    </>
  );
}
