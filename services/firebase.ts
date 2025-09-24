import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth as getAuthRaw,
  Auth,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;

export function ensureFirebase() {
  if (!_app) {
    _app = getApps()[0] ?? initializeApp(firebaseConfig as any);
    // Helpful masked log (remove later if noisy)
    try {
      const key = (firebaseConfig as any)?.apiKey as string | undefined;
      const proj = (firebaseConfig as any)?.projectId as string | undefined;
      // eslint-disable-next-line no-console
      console.log('Firebase cfg',
        key ? key.slice(0, 6) + '…' : 'MISSING',
        proj || 'no-project'
      );
    } catch {}
  }
  if (!_auth) {
    try {
      _auth = initializeAuth(_app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      // If already initialized elsewhere
      _auth = getAuthRaw(_app!);
    }
  }
  return { app: _app!, auth: _auth! };
}

export function getAuthInstance(): Auth {
  return ensureFirebase().auth;
}
