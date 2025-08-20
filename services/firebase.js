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

console.log('Initializing Firebase app...');
const app = initializeApp(firebaseConfig);
console.log('Firebase app initialized:', app);

let authInstance;
try {
  console.log('Attempting to initialize auth with persistence...');
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
  console.log('Auth initialized successfully:', authInstance);
} catch (error) {
  console.error('Auth initialization failed:', error);
  authInstance = getAuth(app); // Fallback
  console.log('Using fallback auth:', authInstance);
}

if (!authInstance) {
  throw new Error('Firebase auth could not be initialized');
}

export const auth = authInstance;
