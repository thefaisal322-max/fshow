import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from './auth-context';
import { chat } from './chat';
import { friends } from './friends';
import { social } from './social';
import { supabase } from './supabase';

type Unread = {
  unread: number;
  setUnread: (n: number) => void;
  chatUnread: number;
  refreshChats: () => void;
  /** incoming friend requests (badge on the Friends tab) */
  friendRequests: number;
  refreshFriends: () => void;
};
const Ctx = createContext<Unread>({
  unread: 0,
  setUnread: () => {},
  chatUnread: 0,
  refreshChats: () => {},
  friendRequests: 0,
  refreshFriends: () => {},
});

/** Keeps the notification + chat badges up to date: realtime + refresh when the app comes back. */
export function UnreadProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const uid = session?.user.id;
  const ready = !!profile?.profileComplete;
  const [unread, setUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [friendRequests, setFriendRequests] = useState(0);

  const refreshFriends = useCallback(() => {
    friends
      .counts()
      .then((c) => setFriendRequests(c.requests))
      .catch(() => {});
  }, []);

  const refreshChats = useCallback(() => {
    chat.unread().then(setChatUnread).catch(() => {});
  }, []);

  useEffect(() => {
    if (!uid || !ready) {
      setUnread(0);
      setChatUnread(0);
      setFriendRequests(0);
      return;
    }
    const refresh = () => {
      social.unreadCount().then(setUnread).catch(() => {});
      refreshChats();
      refreshFriends();
    };
    refresh();

    // Realtime respects Row Level Security: we only receive rows we are allowed to see.
    const channel = supabase
      .channel(`badges:${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, (p) => {
        setUnread((n) => n + 1);
        if (String((p.new as { type?: string }).type ?? '').startsWith('friend_')) refreshFriends();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        if ((p.new as { sender_id?: string }).sender_id !== uid) refreshChats();
      })
      .subscribe();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    const timer = setInterval(refresh, 60_000);

    return () => {
      supabase.removeChannel(channel);
      sub.remove();
      clearInterval(timer);
    };
  }, [uid, ready, refreshChats, refreshFriends]);

  return (
    <Ctx.Provider value={{ unread, setUnread, chatUnread, refreshChats, friendRequests, refreshFriends }}>{children}</Ctx.Provider>
  );
}

export const useUnread = () => useContext(Ctx);
