import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  updateProfile,
  User,
} from 'firebase/auth';
import { getAuthInstance } from '../services/firebase';

type Ctx = {
  user: User | null;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
};

const AuthCtx = createContext<Ctx>({
  user: null,
  isAdmin: false,
  signIn: async () => {},
  signUp: async () => {},
  signInGuest: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = getAuthInstance();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      console.log('[AuthProvider] onAuthStateChanged →', u ? (u.isAnonymous ? 'anonymous' : u.email) : 'null');
    });
    return () => unsub();
  }, [auth]);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const signUp = async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (cred.user && !cred.user.displayName) {
      try { await updateProfile(cred.user, { displayName: email.split('@')[0] }); } catch {}
    }
  };

  const signInGuest = async () => {
    await signInAnonymously(auth);
  };

  const signOut = async () => {
    await fbSignOut(auth);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const isAdmin = useMemo(() => {
    const e = user?.email?.toLowerCase() || '';
    return e === 'admin@ballskill.com' || e === 'support@ballskill.com';
  }, [user]);

  const value: Ctx = {
    user,
    isAdmin,
    signIn,
    signUp,
    signInGuest,
    signOut,
    resetPassword,
  };

  // DEBUG: prove signInGuest exists on every render
  // (you can remove this after verifying)
  console.log('[AuthProvider] value keys:', Object.keys(value));
  console.log('[AuthProvider] typeof signInGuest =', typeof value.signInGuest);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
