import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { auth, db } from './firebase';

/** Public profile: users/{uid}. Private data (email, birthday) lives in users_private/{uid}. */
export type Profile = {
  firstName: string;
  lastName: string;
  displayName: string;
  gender: 'male' | 'female';
  username: string | null;
  bio: string;
  photoURL: string | null;
  isFainet: boolean;
  profileComplete: boolean;
  followersCount: number;
  followingCount: number;
  likesCount: number;
  postsCount: number;
};

type AuthState = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setProfileReady(false);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileReady(true);
      return;
    }
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as Profile);
        } else {
          // Every account is created together with its profile by the server.
          // A user without one is broken, so log them out.
          setProfile(null);
          signOut(auth);
        }
        setProfileReady(true);
      },
      () => setProfileReady(true),
    );
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, profile, loading: !authReady || !profileReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
