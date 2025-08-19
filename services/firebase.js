import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyDIRR9apJ4btQMvGytLkplGOTbFJOySkPU",
  authDomain: "ballskill-app.firebaseapp.com",
  projectId: "ballskill-app",
  storageBucket: "ballskill-app.firebasestorage.app",
  messagingSenderId: "1007534039189",
  appId: "1:1007534039189:web:e7748176b4aad974d1bb9c"
};

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
}) || getAuth(app); // Fallback to ensure auth is registered
