import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signInAnonymously, signOut } from 'firebase/auth';
import { getAuthInstance, ensureFirebase } from '../services/firebase';

type Ctx = {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInAnon: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({
  user: null,
  loading: true,
  error: null,
  signInAnon: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  ensureFirebase();
  const auth = getAuthInstance();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, [auth]);

  const signInAnon = async () => {
    setError(null);
    try {
      await signInAnonymously(auth);
    } catch (e: any) {
      // Anonymous must be enabled in Firebase Console → Auth → Sign-in method → Anonymous
      setError(e?.message || 'Sign-in failed. Enable Anonymous in Firebase console.');
    }
  };

  const signOutSafe = async () => {
    setError(null);
    try { await signOut(auth); }
    catch (e: any) { setError(e?.message || 'Sign-out failed'); }
  };

  const value = useMemo(() => ({
    user, loading, error, signInAnon, signOut: signOutSafe,
  }), [user, loading, error]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() { return useContext(AuthCtx); }
