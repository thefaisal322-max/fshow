import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from './auth-context';
import { social } from './social';
import { supabase } from './supabase';

type Unread = { unread: number; setUnread: (n: number) => void };
const Ctx = createContext<Unread>({ unread: 0, setUnread: () => {} });

/** Keeps the notification badge up to date: realtime + refresh when the app comes back. */
export function UnreadProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const uid = session?.user.id;
  const ready = !!profile?.profileComplete;
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!uid || !ready) {
      setUnread(0);
      return;
    }
    const refresh = () => social.unreadCount().then(setUnread).catch(() => {});
    refresh();

    const channel = supabase
      .channel(`notifications:${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () =>
        setUnread((n) => n + 1),
      )
      .subscribe();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    const timer = setInterval(refresh, 60_000);

    return () => {
      supabase.removeChannel(channel);
      sub.remove();
      clearInterval(timer);
    };
  }, [uid, ready]);

  return <Ctx.Provider value={{ unread, setUnread }}>{children}</Ctx.Provider>;
}

export const useUnread = () => useContext(Ctx);
