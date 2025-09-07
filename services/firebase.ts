import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth as getAuthRaw,
  Auth,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

let authInstance: Auth | null = null;

export function initFirebase() {
  const app = getApps().length ? getApps()[0]! : initializeApp(config as any);
  if (!authInstance) {
    try {
      // First/only initialization with RN persistence
      authInstance = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      // If something else already initialized auth, fall back to the existing instance
      authInstance = getAuthRaw(app);
    }
  }
  return app;
}

export function getAuthInstance(): Auth {
  if (!authInstance) {
    initFirebase();
  }
  // non-null by here
  return authInstance!;
}
