import type { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { api, ProfileRow } from './api';
import { avatarUrl, supabase } from './supabase';

/** Profile in the shape the screens use. */
export type Profile = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  gender: 'male' | 'female';
  username: string | null;
  bio: string;
  photoPath: string | null;
  photoURL: string | null;
  isFainet: boolean;
  profileComplete: boolean;
  followersCount: number;
  followingCount: number;
  likesCount: number;
  postsCount: number;
};

export function toProfile(r: ProfileRow): Profile {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    displayName: `${r.first_name} ${r.last_name}`,
    gender: r.gender,
    username: r.username,
    bio: r.bio,
    photoPath: r.photo_path,
    photoURL: avatarUrl(r.photo_path),
    isFainet: r.is_fainet,
    profileComplete: r.profile_complete,
    followersCount: Number(r.followers_count),
    followingCount: Number(r.following_count),
    likesCount: Number(r.likes_count),
    postsCount: Number(r.posts_count),
  };
}

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Re-read the profile from the server (after photo / username changes). */
  refreshProfile: () => Promise<void>;
  setProfileRow: (r: ProfileRow) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  setProfileRow: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const uid = session?.user.id ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setSessionReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (id: string) => {
    try {
      const row = await api.getProfile(id);
      if (row) setProfile(toProfile(row));
      else {
        // Every real account gets its profile from the signup function.
        // A login without one is not a valid Faisal Show account.
        setProfile(null);
        await supabase.auth.signOut();
      }
    } catch {
      // offline — keep whatever we had
    } finally {
      setProfileReady(true);
    }
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (!uid) {
      setProfile(null);
      setProfileReady(true);
      return;
    }
    setProfileReady(false);
    loadProfile(uid);
  }, [uid, sessionReady, loadProfile]);

  const value: AuthState = {
    session,
    profile,
    loading: !sessionReady || (!!uid && !profileReady),
    refreshProfile: async () => {
      if (uid) await loadProfile(uid);
    },
    setProfileRow: (r) => setProfile(toProfile(r)),
    signOut: api.logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
