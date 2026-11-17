import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { useI18n } from '@/i18n';
import { EMOJI_GROUPS, recentEmojis, rememberEmoji, searchEmojis } from '@/lib/emojis';
import { useBottomSpace } from '@/lib/useBottomSpace';
import { colors, radius } from '@/theme';

type Row = { kind: 'head'; key: string; title: string; group: string } | { kind: 'row'; key: string; items: string[]; group: string };

const COLS = 6;
const HEAD_H = 40;
const ROW_H = 54;

function toRows(group: string, title: string, list: string[]): Row[] {
  const rows: Row[] = [{ kind: 'head', key: `h-${group}`, title, group }];
  for (let i = 0; i < list.length; i += COLS) rows.push({ kind: 'row', key: `${group}-${i}`, items: list.slice(i, i + COLS), group });
  return rows;
}

/**
 * Every emoji, like Messenger's "+" sheet: search, "Your reactions", Recent, then the groups,
 * with a tab bar at the bottom that jumps to a group.
 */
export function EmojiPicker({
  visible,
  onClose,
  onPick,
  quick,
  selected,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
  /** shown first as "Your reactions" */
  quick?: readonly string[];
  selected?: string | null;
}) {
  const { t, lang, d } = useI18n();
  const bottom = useBottomSpace();
  const { height } = useWindowDimensions();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const list = useRef<FlatList<Row>>(null);

  useEffect(() => {
    if (!visible) return;
    setQ('');
    recentEmojis().then(setRecent);
  }, [visible]);

  const rows = useMemo<Row[]>(() => {
    if (q.trim()) return toRows('search', t('emoji_search'), searchEmojis(q));
    const out: Row[] = [];
    if (quick?.length) out.push(...toRows('quick', t('your_reactions'), [...quick]));
    if (recent.length) out.push(...toRows('recent', t('recent_emojis'), recent));
    for (const gr of EMOJI_GROUPS) out.push(...toRows(gr.key, gr.label[lang as 'ps' | 'en' | 'fa'] ?? gr.label.en, gr.list));
    return out;
  }, [q, quick, recent, lang, t]);

  const offsets = useMemo(() => {
    let y = 0;
    return rows.map((r) => {
      const o = { length: r.kind === 'head' ? HEAD_H : ROW_H, offset: y };
      y += o.length;
      return o;
    });
  }, [rows]);

  function pick(e: string) {
    rememberEmoji(e);
    onPick(e);
  }

  function jump(group: string) {
    const i = rows.findIndex((r) => r.kind === 'head' && r.group === group);
    if (i >= 0) list.current?.scrollToIndex({ index: i, animated: false });
  }

  const tabs = [...(recent.length ? [{ key: 'recent', icon: '🕘' }] : []), ...EMOJI_GROUPS.map((gr) => ({ key: gr.key, icon: gr.icon }))];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} />
      <View style={[st.sheet, { height: Math.round(height * 0.72), paddingBottom: bottom }]}>
        <View style={st.handle} />
        <View style={[st.search, { flexDirection: d.row }]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t('emoji_search')}
            placeholderTextColor={colors.muted}
            style={[st.input, { textAlign: d.align }]}
          />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <FlatList
          ref={list}
          data={rows}
          keyExtractor={(r) => r.key}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={14}
          windowSize={7}
          getItemLayout={(_, i) => ({ ...offsets[i], index: i })}
          ListEmptyComponent={<Text style={st.none}>🤷</Text>}
          renderItem={({ item }) =>
            item.kind === 'head' ? (
              <Text style={[st.head, { textAlign: d.align }]}>{item.title}</Text>
            ) : (
              <View style={[st.row, { flexDirection: d.row }]}>
                {item.items.map((e) => (
                  <Pressable key={e} onPress={() => pick(e)} style={({ pressed }) => [st.cell, (pressed || selected === e) && st.cellOn]}>
                    <Text style={st.emoji}>{e}</Text>
                  </Pressable>
                ))}
              </View>
            )
          }
        />
        {!q ? (
          <View style={[st.tabs, { flexDirection: d.row }]}>
            {tabs.map((tb) => (
              <Pressable key={tb.key} onPress={() => jump(tb.key)} hitSlop={4} style={st.tab}>
                <Text style={{ fontSize: 20 }}>{tb.icon}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 8, marginBottom: 10 },
  search: { alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.lg, marginHorizontal: 12, paddingHorizontal: 12, height: 40 },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  head: { height: HEAD_H, lineHeight: HEAD_H, paddingHorizontal: 16, fontWeight: '700', color: colors.muted, fontSize: 14 },
  row: { height: ROW_H, paddingHorizontal: 8 },
  cell: { flex: 1 / COLS, width: `${100 / COLS}%`, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  cellOn: { backgroundColor: colors.soft },
  emoji: { fontSize: 30 },
  none: { textAlign: 'center', fontSize: 30, marginTop: 30 },
  tabs: { justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingVertical: 6 },
  tab: { padding: 4 },
});
