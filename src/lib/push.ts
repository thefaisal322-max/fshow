import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Push notifications (Firebase): messages, likes, follows… and ringing calls arrive even when
 * Faisal Show is closed. The server ("push" Edge Function) decides what to send; here we
 * register the phone, make the Android channels and open the right screen on a tap.
 */

// While the app is open: calls show our own full-screen page instead of a banner.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const type = (n.request.content.data as { type?: string } | null)?.type;
    const quiet = type === 'call';
    return { shouldShowBanner: !quiet, shouldShowList: !quiet, shouldPlaySound: !quiet, shouldSetBadge: false };
  },
});

let channelsDone = false;
async function channels() {
  if (Platform.OS !== 'android' || channelsDone) return;
  channelsDone = true;
  await Notifications.setNotificationChannelAsync('calls', {
    name: 'Calls',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'ringtone.wav',
    vibrationPattern: [0, 1000, 800, 1000, 800, 1000, 800, 1000],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
  });
  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 150, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
  await Notifications.setNotificationChannelAsync('social', {
    name: 'Likes, comments, follows',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('missed', {
    name: 'Missed calls',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}

let myToken: string | null = null;

/** After login: ask permission (Android 13+) and save this phone's token. */
export async function registerPush(lang: string) {
  try {
    await channels();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const t = await Notifications.getDevicePushTokenAsync();
    const token = typeof t.data === 'string' ? t.data : null;
    if (!token) return;
    myToken = token;
    await supabase.rpc('save_push_token', { p_token: token, p_platform: Platform.OS === 'ios' ? 'ios' : 'android', p_lang: lang });
  } catch {
    /* no Google services on this phone, or offline — try again next start */
  }
}

/** Before logout: stop pushes to this phone for this account. */
export async function unregisterPush() {
  if (!myToken) return;
  try {
    await supabase.rpc('remove_push_token', { p_token: myToken });
  } catch {
    /* ignore */
  }
}

/** Remove the "incoming call" notification (answered / declined / ended). */
export async function dismissCallNotification(callId: string) {
  try {
    const list = await Notifications.getPresentedNotificationsAsync();
    for (const n of list) {
      const d = n.request.content.data as { call_id?: string } | null;
      if (d?.call_id === callId) await Notifications.dismissNotificationAsync(n.request.identifier);
    }
  } catch {
    /* ignore */
  }
}

/** A tap on a notification opens its screen (chat, post, profile…). Calls open via the incoming-call page. */
export function usePushTaps(enabled: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const open = (r: Notifications.NotificationResponse | null) => {
      const d = (r?.notification.request.content.data ?? {}) as { type?: string; url?: string };
      if (!d.url || d.type === 'call') return;
      if (!/^\/(chats|post|user|settings)\//.test(d.url)) return;
      setTimeout(() => router.push(d.url as never), 300);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [enabled, router]);
}
