import * as SecureStore from 'expo-secure-store';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { api, ApiError, AuthResult, Me, setApiToken, setOnUnauthorized } from './api';

const TOKEN_KEY = 'fshow.session';

type AuthState = {
  /** The logged-in user, or null. */
  user: Me | null;
  loading: boolean;
  /** Save a session returned by signup / login / reset. */
  signIn: (r: AuthResult) => Promise<void>;
  signOut: () => Promise<void>;
  /** Replace the user after a profile change. */
  setUser: (u: Me) => void;
};

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  setUser: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const clear = useCallback(async () => {
    setApiToken(null);
    setUser(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  }, []);

  // On app start: restore the saved session (kept in the phone's encrypted keystore).
  useEffect(() => {
    setOnUnauthorized(() => void clear());
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (token) {
          setApiToken(token);
          const { user } = await api.me();
          setUser(user);
        }
      } catch (e) {
        // Only forget the session if the server rejected it — not when offline.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) await clear();
      } finally {
        setLoading(false);
      }
    })();
    return () => setOnUnauthorized(null);
  }, [clear]);

  const signIn = useCallback(async ({ token, user }: AuthResult) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    setApiToken(token);
    setUser(user);
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    await clear();
  }, [clear]);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, setUser }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
