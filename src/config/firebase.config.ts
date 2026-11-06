/**
 * Firebase web config.
 *
 * Firebase Console → Project settings → General → "Your apps" → Web app (</>) → Config.
 * Paste the values below.
 *
 * These keys are NOT secret (every Firebase app ships them inside the APK).
 * Security comes from firestore.rules, storage.rules and the Cloud Functions,
 * not from hiding these values.
 */
export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  storageBucket: 'PASTE_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID',
};

/** Must match the region in firebase/functions/src/index.ts */
export const FUNCTIONS_REGION = 'us-central1';
