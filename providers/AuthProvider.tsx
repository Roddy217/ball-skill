import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { initFirebase, getAuthInstance } from '../services/firebase';
import { upsertUser } from '../services/firestore';

type AuthUser = { uid: string; email?: string | null };
type Ctx = { user: AuthUser | null };

const AuthCtx = createContext<Ctx>({ user: null });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    initFirebase();
    const auth = getAuthInstance();
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        const cred = await signInAnonymously(auth);
        setUser({ uid: cred.user.uid, email: cred.user.email });
        await upsertUser(cred.user.uid, cred.user.email);
      } else {
        setUser({ uid: fbUser.uid, email: fbUser.email });
        await upsertUser(fbUser.uid, fbUser.email);
      }
    });
    return () => unsub();
  }, []);

  return <AuthCtx.Provider value={{ user }}>{children}</AuthCtx.Provider>;
}

export function useAuth() { return useContext(AuthCtx); }
