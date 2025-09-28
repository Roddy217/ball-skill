import AsyncStorage from '@react-native-async-storage/async-storage';
import api, {
  getBalance as getBalanceFn,
  applyCredits as applyCreditsFn,
  grantCredits as grantCreditsFn,
  toDollars as toDollarsFn,
} from './api';

/** ---------------- Email helpers ---------------- */
const norm = (email) => String(email || '').trim().toLowerCase();
const keyFor = (email) => `balance:${norm(email)}`;

/** ---------------- In-memory cache + listeners ---------------- */
const cache = new Map(); // email -> cents (number)
const listeners = new Set(); // f: ({email, balanceCents}) => void
const notify = (email, balanceCents) => {
  for (const fn of listeners) {
    try { fn({ email, balanceCents }); } catch {}
  }
};

/** ---------------- API helpers (compat with named or instance) ---------------- */
const callGetBalance  = (email) => (api?.getBalance ? api.getBalance(email) : getBalanceFn(email));
const callApply       = (email, delta, note) => (api?.applyCredits ? api.applyCredits(email, delta, note) : applyCreditsFn(email, delta, note));
const callGrant       = (email, delta, note) => (api?.grantCredits ? api.grantCredits(email, delta, note) : grantCreditsFn(email, delta, note));
export const toDollars = (cents) => (toDollarsFn ? toDollarsFn(cents) : (Number(cents||0)/100).toFixed(2));

/** ---------------- Public API ---------------- */

/** Read from memory cache synchronously (fast, may be null) */
export function getCachedSync(email) {
  const e = norm(email);
  return cache.has(e) ? cache.get(e) : null;
}

/** Read from disk cache (AsyncStorage) if not in memory */
export async function getCached(email) {
  const e = norm(email);
  if (cache.has(e)) return cache.get(e);
  try {
    const raw = await AsyncStorage.getItem(keyFor(e));
    const n = raw != null ? Number(raw) : null;
    if (Number.isFinite(n)) {
      cache.set(e, n);
      return n;
    }
  } catch {}
  return null;
}

/** Fetch from server -> update memory+disk -> notify listeners */
export async function refresh(email, reason = '') {
  const e = norm(email);
  if (!e) return null;
  console.log('[balanceService.refresh]', reason, e);
  const cents = await callGetBalance(e);
  const c = Number(cents || 0);
  cache.set(e, c);
  try { await AsyncStorage.setItem(keyFor(e), String(c)); } catch {}
  notify(e, c);
  return c;
}

/** Apply a delta (in cents) then return new balance via refresh */
export async function apply(email, delta, note) {
  const e = norm(email);
  console.log('[balanceService.apply]', { e, delta, note });
  await callApply(e, Number(delta||0), note);
  return refresh(e, 'apply');
}

/** Grant is just a named wrapper for apply */
export async function grant(email, delta, note) {
  const e = norm(email);
  console.log('[balanceService.grant]', { e, delta, note });
  await callGrant(e, Number(delta||0), note);
  return refresh(e, 'grant');
}

/** Subscribe to any balance update. Returns unsubscribe fn. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
