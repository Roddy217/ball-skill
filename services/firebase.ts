import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth as getAuthRaw,
  Auth,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// helpful debug once on startup (masked key)
if (__DEV__) {
  const k = firebaseConfig.apiKey ? String(firebaseConfig.apiKey).slice(0,6) + '…' : 'MISSING';
  console.log('Firebase cfg', k, firebaseConfig.projectId);
}

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

export function initFirebase() {
  app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig as any);
  if (!authInstance) {
    try {
      authInstance = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      // already initialized by another module
      authInstance = getAuthRaw(app);
    }
  }
  return app!;
}

export function getAuthInstance(): Auth {
  if (!authInstance) initFirebase();
  return authInstance!;
}
