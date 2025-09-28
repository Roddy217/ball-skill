// services/balanceService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, {
  getBalance as getBalanceFn,
  applyCredits as applyCreditsFn,
  grantCredits as grantCreditsFn,
  toDollars as toDollarsFn,
} from './api';

/** ---------------- Email + key helpers ---------------- */
const norm = (email) => String(email || '').trim().toLowerCase();
const keyFor = (email) => `balance:${norm(email)}`;

/** ---------------- In-memory cache + listeners ---------------- */
const cache = new Map();      // email -> cents (number)
const listeners = new Set();  // Set of functions { email, balanceCents } => void

const notify = (email, balanceCents) => {
  for (const fn of listeners) {
    try { fn({ email, balanceCents }); } catch {}
  }
};

/** ---------------- API shims (instance or named) ---------------- */
const callGetBalance = (email) =>
  (api && typeof api.getBalance === 'function'
    ? api.getBalance(email)
    : getBalanceFn(email));

const callApply = (email, delta, note) =>
  (api && typeof api.applyCredits === 'function'
    ? api.applyCredits(email, delta, note)
    : applyCreditsFn(email, delta, note));

const callGrant = (email, delta, note) =>
  (api && typeof api.grantCredits === 'function'
    ? api.grantCredits(email, delta, note)
    : grantCreditsFn(email, delta, note));

export const toDollars = (cents) =>
  (typeof toDollarsFn === 'function'
    ? toDollarsFn(cents)
    : (Number(cents || 0) / 100).toFixed(2));

/** ---------------- Public API ---------------- */

/** Fast sync read (memory only). Returns number|null. */
export function getCachedSync(email) {
  const e = norm(email);
  return cache.has(e) ? cache.get(e) : null;
}

/** Async read with disk fallback (AsyncStorage). Returns number|null. */
export async function getCached(email) {
  const e = norm(email);
  if (cache.has(e)) return cache.get(e);
  try {
    const raw = await AsyncStorage.getItem(keyFor(e));
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        cache.set(e, n);
        return n;
      }
    }
  } catch {}
  return null;
}

/** Server fetch -> update memory+disk -> notify listeners. Returns cents. */
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

/** Apply a delta (in cents) via server, then refresh and return cents. */
export async function apply(email, delta, note) {
  const e = norm(email);
  console.log('[balanceService.apply]', { e, delta, note });
  await callApply(e, Number(delta || 0), note);
  return refresh(e, 'apply');
}

/** Grant wrapper (alias of apply) then refresh and return cents. */
export async function grant(email, delta, note) {
  const e = norm(email);
  console.log('[balanceService.grant]', { e, delta, note });
  await callGrant(e, Number(delta || 0), note);
  return refresh(e, 'grant');
}

/** Subscribe to updates. Returns unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Optional: manual set (updates cache+disk+listeners). */
export async function set(email, cents) {
  const e = norm(email);
  const c = Number(cents || 0);
  cache.set(e, c);
  try { await AsyncStorage.setItem(keyFor(e), String(c)); } catch {}
  notify(e, c);
}

/** ---------------- Convenience “bank” adapter ----------------
 *  Lets callers do: import bank from '../services/balanceService';
 *  or: import { bank } from '../services/balanceService';
 */
export const bank = {
  refresh,                // server -> cache+disk -> notify
  get: getCached,         // async cached read (memory/disk)
  getSync: getCachedSync, // sync read (memory only)
  apply,                  // apply delta then refresh
  grant,                  // alias of apply
  subscribe,              // listener registration
  set,                    // manual set + persist + notify
  toDollars,
};

export default bank;