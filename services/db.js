import { db } from './firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';

// ---- Credit history ----
// shape: { email, delta, reason, balanceAfter, at }
export async function saveCreditHistory(entry) {
  const col = collection(db, 'walletHistory');
  await addDoc(col, {
    email: entry.email,
    delta: entry.delta,
    reason: entry.reason || 'manual',
    balanceAfter: entry.balanceAfter ?? null,
    at: serverTimestamp(),
  });
}

// NOW USING YOUR COMPOSITE INDEX: where(email == …) + orderBy(at, 'desc')
export async function fetchCreditHistory({ email, take = 50 }) {
  if (!email) return [];
  const col = collection(db, 'walletHistory');
  const q = query(
    col,
    where('email', '==', email),
    orderBy('at', 'desc'),
    limit(take)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---- System logs ----
export async function logSystemEvent({ type, message, details }) {
  const col = collection(db, 'systemLogs');
  await addDoc(col, {
    type: type || 'info',
    message: message || '',
    details: details || null,
    at: serverTimestamp(),
  });
}

// Prefer server-side order; if Firestore asks for an index here too, we can add it.
// (You can keep the fallback if you want, but with one field orderBy it usually works.)
export async function fetchSystemLogs({ take = 50 }) {
  const col = collection(db, 'systemLogs');
  const q = query(col, orderBy('at', 'desc'), limit(take));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
