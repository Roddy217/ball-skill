import { initializeApp, getApps } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyDIRR9apJ4btQMvGytLkplGOTbFJOySkPU",
  authDomain: "ballskill-app.firebaseapp.com",
  projectId: "ballskill-app",
  storageBucket: "ballskill-app.firebasestorage.app",
  messagingSenderId: "1007534039189",
  appId: "1:1007534039189:ios:67f0794415c945f0d1bb9c",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Persist auth in React Native
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export { app, auth };
