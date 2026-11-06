import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

import { firebaseConfig, FUNCTIONS_REGION } from '@/config/firebase.config';

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// getReactNativePersistence only exists in the React Native build of firebase/auth,
// so it is missing from the TypeScript types — read it dynamically.
const getReactNativePersistence = (FirebaseAuth as any).getReactNativePersistence;

function createAuth(): FirebaseAuth.Auth {
  try {
    // Keeps the user logged in after the app is closed.
    return FirebaseAuth.initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Already initialized (fast refresh in development).
    return FirebaseAuth.getAuth(app);
  }
}

export const auth = createAuth();
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);
