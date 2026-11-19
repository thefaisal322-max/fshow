import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { pack, PACK_BYTES, usePack, usePackInstaller } from '@/lib/pack';
import { colors, radius } from '@/theme';

const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

/**
 * Shows the content only when the "FC & Live" pack is on this phone
 * (and, for live, the person is 15+). Otherwise: the download card.
 */
export function PackGate({ need, children, dark }: { need: 'fc' | 'live'; children: ReactNode; dark?: boolean }) {
  const p = usePack();
  if (!p.ready) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
  if (p.fc && (need === 'fc' || p.live)) return <>{children}</>;
  return (
    <View style={[st.wrap, dark && { backgroundColor: '#000' }]}>
      <PackCard need={need} />
    </View>
  );
}

/** the download card (also on the Monetization screen) */
export function PackCard({ need = 'fc' }: { need?: 'fc' | 'live' }) {
  const { t } = useI18n();
  const p = usePack();
  const { progress, error, install } = usePackInstaller();
  const [checking, setChecking] = useState(false);

  // downloaded, but live is not allowed (under 15)
  if (p.fc && need === 'live' && !p.live) {
    return (
      <View style={st.card}>
        <Text style={st.icon}>🔞</Text>
        <Text style={st.title}>{t('pack_live_age')}</Text>
        <Text style={st.sub}>{t('pack_live_age_sub')}</Text>
        <Pressable
          onPress={async () => {
            setChecking(true);
            await pack.recheckLive().catch(() => {});
            setChecking(false);
          }}
          style={[st.btn, { backgroundColor: colors.surface }]}
        >
          {checking ? <ActivityIndicator color={colors.primary} /> : <Text style={[st.btnText, { color: colors.text }]}>{t('pack_check_again')}</Text>}
        </Pressable>
      </View>
    );
  }

  if (p.fc) {
    return (
      <View style={st.card}>
        <Text style={st.icon}>✅</Text>
        <Text style={st.title}>{t('pack_installed')}</Text>
        <Text style={st.sub}>
          🪙 FC ✓ · 🔴 Live {p.live ? '✓' : '✗ (15+)'} · {mb(PACK_BYTES)}
        </Text>
        <Pressable onPress={() => pack.remove()} style={[st.btn, { backgroundColor: colors.surface }]}>
          <Text style={[st.btnText, { color: colors.error }]}>{t('pack_remove')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={st.card}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Text style={st.icon}>🪙</Text>
        <Text style={st.icon}>🔴</Text>
      </View>
      <Text style={st.title}>Download FC & Live</Text>
      <Text style={st.sub}>{t('pack_sub', { size: mb(PACK_BYTES) })}</Text>
      {progress !== null ? (
        <>
          <View style={st.track}>
            <View style={[st.fill, { width: `${Math.round(progress * 100)}%` as `${number}%` }]} />
          </View>
          <Text style={st.sub}>{Math.round(progress * 100)}%</Text>
        </>
      ) : (
        <Pressable onPress={install} style={st.btn}>
          <Ionicons name="download" size={18} color="#fff" />
          <Text style={st.btnText}>
            {t('download')} · {mb(PACK_BYTES)}
          </Text>
        </Pressable>
      )}
      {error ? <Text style={[st.sub, { color: colors.error }]}>{t('pack_failed')}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: colors.bg },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, alignItems: 'center', gap: 8 },
  icon: { fontSize: 36 },
  title: { fontSize: 18, fontWeight: '900', color: colors.text, textAlign: 'center' },
  sub: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },
  btn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', backgroundColor: '#FE2C55', borderRadius: radius.md, paddingVertical: 12, marginTop: 6 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  track: { alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginTop: 6 },
  fill: { height: 8, backgroundColor: '#FE2C55' },
});
