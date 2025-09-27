// services/api.js
import { Platform } from 'react-native';

/* -------------------- Base URL -------------------- */
const RAW_SERVER =
  (typeof process !== 'undefined' &&
    process.env &&
    process.env.EXPO_PUBLIC_SERVER_URL) ||
  ((Platform.OS === 'ios' || Platform.OS === 'android')
    ? 'http://192.168.1.244:3001' // change to your LAN IP if needed
    : 'http://localhost:3001');

export const API_BASE_URL = `${String(RAW_SERVER).replace(/\/+$/, '')}/api`;

/* -------------------- Helpers -------------------- */
export const toDollars = (cents) =>
  (Number(cents || 0) / 100).toFixed(2);

// legacy compat used elsewhere
export async function loadApiBase() {
  /* no-op; using env/RAW_SERVER */
}
export function getApiBase() {
  return RAW_SERVER;
}

/* -------------------- Core Service -------------------- */
class ApiService {
  async makeRequest(endpoint, options = {}) {
    const method = (options && options.method) || 'GET';
    const bodyShown = options && options.body ? ` body=${options.body}` : '';
    console.log('[api] →', endpoint, method, bodyShown);
    console.log('[api] BASE', API_BASE_URL);

    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      // ignore JSON parse errors on empty bodies
    }

    console.log('[api] ←', endpoint, res.status, data);
    if (!res.ok) {
      throw new Error(data?.error || 'API request failed');
    }
    return data;
  }

  /* --------------- Events --------------- */

  getEvents() {
    return this.makeRequest('/events');
  }

  // Record a join (no credit logic here; screens may deduct via grant/apply)
  recordJoin(eventId, email) {
    const id = encodeURIComponent(eventId);
    return this.makeRequest(`/events/${id}/join`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  // Remove a join; screens typically refund credits separately
  unrecordJoin(eventId, email) {
    const id = encodeURIComponent(eventId);
    return this.makeRequest(`/events/${id}/join`, {
      method: 'DELETE',
      body: JSON.stringify({ email }),
    });
  }

  // Optional helper: deduct then join in one call sequence (used by older code)
  async joinEventWithCredits(eventId, email, feeCents) {
    console.log('[api.joinEventWithCredits] →', { eventId, email, feeCents });
    if (feeCents && Number(feeCents) !== 0) {
      await this.applyCredits(email, -Math.abs(Number(feeCents)), `join:${eventId}`);
    }
    const out = await this.recordJoin(eventId, email);
    console.log('[api.joinEventWithCredits] ←', out);
    return out;
  }

  // Get all joins for a user (server route name varies between builds)
  async getUserJoins(email) {
    const enc = encodeURIComponent(String(email || '').toLowerCase());
    // Try most likely routes, fall back to empty list if none present
    const tryRoutes = [
      `/joins/${enc}`,
      `/events/joins/${enc}`,
      `/user/${enc}/joins`,
    ];
    for (const r of tryRoutes) {
      try {
        const resp = await this.makeRequest(r);
        if (resp && (Array.isArray(resp.joins) || Array.isArray(resp.events))) {
          return resp.joins || resp.events || [];
        }
      } catch (e) {
        // keep trying next route
      }
    }
    console.log('[api.getUserJoins] no compatible route found; returning []');
    return [];
  }

  // Compatibility: derive "registration status" from joins list
async getRegistrationStatus(a, b) {
  // Tolerate callers that accidentally swap args
  const looksEmail = (x) => typeof x === 'string' && x.includes('@');

  const email   = looksEmail(a) ? a : (looksEmail(b) ? b : a);
  const eventId = looksEmail(a) ? b : (looksEmail(b) ? a : b);

  if (!email || !eventId) return { registered: false };

  // (Optional) debug
  if (!looksEmail(a) && looksEmail(b)) {
    console.log('[api.getRegistrationStatus] swapped args detected; corrected order.');
  }

  try {
    const joins = await this.getUserJoins(email);
    const found = Array.isArray(joins)
      ? joins.some((j) => (j?.eventId || j?.id) === eventId)
      : false;
    return { registered: !!found };
  } catch {
    return { registered: false };
  }
}

  /* --------------- Credits --------------- */

  // Unified balance getter; server returns cents
  async getBalance(email) {
    const enc = encodeURIComponent(String(email || '').toLowerCase());
    // Supports both {balance} and {credits} shapes
    const resp = await this.makeRequest(`/credits/${enc}`);
    const cents =
      typeof resp?.balance === 'number'
        ? resp.balance
        : typeof resp?.credits === 'number'
          ? resp.credits
          : 0;
    return cents;
  }

  // Admin “grant/adjust” endpoint (explicit)
  grantCredits(email, delta, note) {
    console.log('[api.grantCredits]', { email, delta, note });
    return this.makeRequest('/credits/grant', {
      method: 'POST',
      body: JSON.stringify({ email, delta, note }),
    });
  }

  // Generic “apply” (used by some admin screens)
  applyCredits(email, delta, note) {
    console.log('[api.applyCredits]', { email, delta, note });
    return this.makeRequest('/credits/apply', {
      method: 'POST',
      body: JSON.stringify({ email, delta, note }),
    });
  }
}

/* -------------------- Instance + Named Exports -------------------- */
const api = new ApiService();
export default api;

// Named exports so screens can import either default or functions:
export const getEvents = (...args) => api.getEvents(...args);
export const recordJoin = (...args) => api.recordJoin(...args);
export const unrecordJoin = (...args) => api.unrecordJoin(...args);
export const joinEventWithCredits = (...args) => api.joinEventWithCredits(...args);

export const getUserJoins = (...args) => api.getUserJoins(...args);
export const getRegistrationStatus = (...args) =>
  api.getRegistrationStatus(...args);

export const getBalance = (...args) => api.getBalance(...args);
export const grantCredits = (...args) => api.grantCredits(...args);
export const applyCredits = (...args) => api.applyCredits(...args);

// Convenience export for dollars formatting
export { toDollars as dollars };