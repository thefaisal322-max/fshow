import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Card, Page, Row } from '@/components/ui';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { chat, chatInfo, ChatInfo } from '@/lib/chat';
import { useUnread } from '@/lib/notifications';
import { authorName, social } from '@/lib/social';
import { avatarUrl } from '@/lib/supabase';
import { colors } from '@/theme';

/** The (!) screen: profile, mute, block, delete chat, members, leave group. */
export default function ChatInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, d } = useI18n();
  const { refreshChats } = useUnread();
  const [info, setInfo] = useState<ChatInfo | null>(null);

  const load = useCallback(() => chatInfo(id).then(setInfo).catch((e) => Alert.alert('', errorMessage(e))), [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (!info) return <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />;
  const o = !info.is_group ? info.members?.[0] : undefined;
  const name = info.is_group ? info.title ?? t('chats') : o ? authorName(o) : '';

  async function toggleMute() {
    try {
      await chat.mute(id, !info!.muted);
      await load();
      refreshChats();
    } catch (e) {
      Alert.alert('', errorMessage(e));
    }
  }

  function toggleBlock() {
    if (!o) return;
    if (o.blocked_by_me) {
      social.block(o.id, false).then(load).catch((e) => Alert.alert('', errorMessage(e)));
      return;
    }
    Alert.alert(t('block_q', { name }), t('block_warn'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('block'),
        style: 'destructive',
        onPress: () => social.block(o.id, true).then(load).catch((e) => Alert.alert('', errorMessage(e))),
      },
    ]);
  }

  function deleteChat() {
    Alert.alert(t('delete_chat'), t('delete_chat_warn'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await chat.deleteForMe(id);
            refreshChats();
            router.dismissTo('/chats');
          } catch (e) {
            Alert.alert('', errorMessage(e));
          }
        },
      },
    ]);
  }

  function leave() {
    Alert.alert(t('leave_group'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('leave_group'),
        style: 'destructive',
        onPress: async () => {
          try {
            await chat.leave(id);
            refreshChats();
            router.dismissTo('/chats');
          } catch (e) {
            Alert.alert('', errorMessage(e));
          }
        },
      },
    ]);
  }

  return (
    <Page>
      <Stack.Screen options={{ title: t('chat_info') }} />
      <View style={st.head}>
        {info.is_group ? (
          <View style={st.group}>
            <Ionicons name="people" size={44} color="#fff" />
          </View>
        ) : (
          <Avatar uri={avatarUrl(o?.photo_path)} name={o?.first_name} size={96} />
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <Text style={st.name}>{name}</Text>
          {o?.is_fainet ? <VerifiedBadge size={18} /> : null}
        </View>
        {o?.username ? <Text style={st.sub}>@{o.username}</Text> : null}
        {o ? (
          <Text style={st.sub}>
            {o.followed_by_me && o.follows_me ? `🤝 ${t('friends_on_app')}` : o.followed_by_me ? t('you_follow') : o.follows_me ? t('follows_you') : t('not_connected')}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 22, marginTop: 14 }}>
          {o ? <Circle icon="person" label={t('profile_title')} onPress={() => router.push({ pathname: '/user/[id]', params: { id: o.id } })} /> : null}
          <Circle icon={info.muted ? 'notifications-off' : 'notifications'} label={info.muted ? t('unmute') : t('mute')} onPress={toggleMute} />
        </View>
      </View>

      {info.is_group ? (
        <Card>
          <Text style={[st.section, { textAlign: d.align }]}>{t('members_n', { n: (info.members?.length ?? 0) + 1 })}</Text>
          {(info.members ?? []).map((m, i, arr) => (
            <Pressable
              key={m.id}
              onPress={() => router.push({ pathname: '/user/[id]', params: { id: m.id } })}
              style={[st.member, { flexDirection: d.row }, i < arr.length - 1 && st.border]}
            >
              <Avatar uri={avatarUrl(m.photo_path)} name={m.first_name} size={40} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text, textAlign: d.align }}>
                {authorName(m)} {m.role === 'admin' ? '⭐' : ''}
              </Text>
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Card>
        <Row icon={info.muted ? 'notifications-off-outline' : 'notifications-outline'} label={info.muted ? t('unmute') : t('mute')} onPress={toggleMute} />
        {o ? <Row icon="ban-outline" label={o.blocked_by_me ? t('unblock') : t('block')} color={colors.error} onPress={toggleBlock} /> : null}
        {info.is_group ? <Row icon="exit-outline" label={t('leave_group')} color={colors.error} onPress={leave} /> : null}
        <Row icon="trash-outline" label={t('delete_chat')} color={colors.error} onPress={deleteChat} last />
      </Card>
    </Page>
  );
}

function Circle({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 4 }}>
      <View style={st.circle}>
        <Ionicons name={icon} size={22} color={colors.text} />
      </View>
      <Text style={{ fontSize: 12, color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  head: { alignItems: 'center', paddingVertical: 18 },
  group: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 22, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 3 },
  circle: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  section: { fontWeight: '800', fontSize: 15, color: colors.text, marginBottom: 6 },
  member: { alignItems: 'center', gap: 12, paddingVertical: 10 },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
