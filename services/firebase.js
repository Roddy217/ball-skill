import { Platform } from 'react-native';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyDIRR9apJ4btQMvGytLkplGOTbFJOySkPU",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "ballskill-app.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "ballskill-app",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "ballskill-app.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1007534039189",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:1007534039189:web:e7748176b4aad974d1bb9c",
};

// quick masked print to confirm at runtime
try {
  const tail = (firebaseConfig.apiKey || '').slice(-6);
  console.log(`[firebase] init projectId=${firebaseConfig.projectId} apiKey=*${tail}`);
} catch {}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  if (!globalThis.__BALLSKILL_AUTH__) {
    globalThis.__BALLSKILL_AUTH__ = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }
  auth = globalThis.__BALLSKILL_AUTH__;
}

const db = getFirestore(app);

export { app, auth, db };
export default app;
