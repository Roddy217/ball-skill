import { getFirestore, doc, setDoc, serverTimestamp, getDocs, query, collection, where, limit, orderBy, startAt, endAt } from 'firebase/firestore';
import { initFirebase } from './firebase';

export function db() {
  const app = initFirebase();
  return getFirestore(app);
}

export async function upsertUser(uid: string, email?: string | null) {
  const d = db();
  const ref = doc(d, 'users', uid);
  const email_lowercase = (email || '').toLowerCase();
  await setDoc(ref, {
    email: email || null,
    email_lowercase,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true });
}

export async function searchUsersByEmailPrefix(prefix: string, max: number = 8): Promise<{ email: string }[]> {
  const d = db();
  const lc = prefix.toLowerCase();
  if (!lc) return [];
  const col = collection(d, 'users');
  const q = query(
    col,
    orderBy('email_lowercase'),
    startAt(lc),
    endAt(lc + '\uf8ff'),
    limit(max)
  );
  const snap = await getDocs(q);
  const out: { email: string }[] = [];
  snap.forEach(doc => {
    const e = (doc.data()?.email || '') as string;
    if (e) out.push({ email: e });
  });
  return out;
}
