import { Platform } from 'react-native';

// —— Server base URL ——
const RAW_SERVER =
  (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_SERVER_URL)
    ? process.env.EXPO_PUBLIC_SERVER_URL
    : ((Platform.OS === 'ios' || Platform.OS === 'android')
        ? 'http://192.168.1.244:3001' // your LAN IP for real device
        : 'http://localhost:3001');

export const API_BASE_URL = `${String(RAW_SERVER).replace(/\/+$/, '')}/api`;

// dollars display helper (also exposed on api instance)
export const toDollars = (cents) => (Number(cents || 0) / 100).toFixed(2);

// legacy compatibility (UI reads these)
export async function loadApiBase() { /* no-op: using env/RAW_SERVER */ }
export function getApiBase() { return RAW_SERVER; }

class ApiService {
  async makeRequest(endpoint, options = {}) {
    const method = (options && options.method) || 'GET';
    const bodyShown = options && options.body ? ` body=${options.body}` : '';
    console.log('[api] →', endpoint, method, bodyShown);
    console.log('[api] BASE', API_BASE_URL);

    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const res = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }

    console.log('[api] ←', endpoint, res.status, data);
    if (!res.ok) throw new Error(data?.error || 'API request failed');
    return data;
  }

  // ---- Events ----
  getEvents() {
    return this.makeRequest('/events');
  }
  createEvent(payload) {
    return this.makeRequest('/events', { method: 'POST', body: JSON.stringify(payload) });
  }
  recordJoin(eventId, email) {
    const id = encodeURIComponent(eventId);
    return this.makeRequest(`/events/${id}/join`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }
  // Remove the user from the event (mirrors recordJoin)
  unrecordJoin(eventId, email) {
    const id = encodeURIComponent(eventId);
    return this.makeRequest(`/events/${id}/join`, {
      method: 'DELETE',
      body: JSON.stringify({ email }),
    });
  }
  // Demo helper (legacy)
  joinEventDemo(eventId, email, fee) {
    console.warn('[api.legacy] joinEventDemo() removed — use real join route');
    throw new Error('Removed: joinEventDemo');
  }

  // ---- Credits ----
  async getBalance(email) {
    const enc = encodeURIComponent(String(email || '').toLowerCase());
    const resp = await this.makeRequest(`/credits/${enc}/wallets`); // { success, email, skill, dollars }
    const { skill = 0, dollars = 0 } = resp || {};
    return Number(skill) + Number(dollars); // keep legacy combined balance for old UIs
  }
  grantCredits(email, delta, note) {
    console.warn('[api.legacy] grantCredits() is deprecated — use explicit wallet v2 endpoints');
    throw new Error('Deprecated: grantCredits — migrate to explicit wallet endpoints');
  }
  applyCredits(email, delta, note) {
    console.warn('[api.legacy] applyCredits() is deprecated — use explicit wallet v2 endpoints');
    throw new Error('Deprecated: applyCredits — migrate to explicit wallet endpoints');
  }
  async getHistory(email, { q = '', limit = 100 } = {}) {
    const enc = encodeURIComponent(String(email || '').toLowerCase());
    const qs = new URLSearchParams({ limit: String(limit), sort: 'desc' }).toString();
    const resp = await this.makeRequest(`/transactions/${enc}?${qs}`);
    // Normalize to legacy shape `{ history: [...] }` if callers expect it
    if (Array.isArray(resp?.items)) return resp.items;
    if (Array.isArray(resp)) return resp; // tolerate direct arrays
    return [];
  }

  // ---- User Joins (tolerant to multiple server shapes) ----
  async getUserJoins(email) {
    const enc = encodeURIComponent(String(email || '').toLowerCase());
    const candidates = [
      `/joins/${enc}`,
      `/events/joins/${enc}`,
      `/user/${enc}/joins`,
    ];
    for (const p of candidates) {
      try {
        const resp = await this.makeRequest(p);
        if (Array.isArray(resp)) return resp;
        if (resp && Array.isArray(resp.joins)) return resp.joins;
        if (resp && Array.isArray(resp.events)) return resp.events;
      } catch {
        // try next route
      }
    }
    console.log('[api.getUserJoins] no compatible route found; returning []');
    return [];
  }

  // ---- Stripe Connect ----
  getConnectStatus(email) {
    const enc = encodeURIComponent(String(email || '').toLowerCase());
    return this.makeRequest(`/stripe/connect/status/${enc}`);
  }
  startConnectOnboarding(email, opts = {}) {
    // opts: { refreshUrl, returnUrl } must be full http(s) URLs (not exp://)
    const body = {
      email: String(email || '').toLowerCase(),
      refreshUrl: opts.refreshUrl,
      returnUrl: opts.returnUrl,
    };
    return this.makeRequest('/stripe/connect/onboard', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}

const api = new ApiService();
export default api;

// Convenience named exports (so you can `import { fn } from '../services/api'`)
export const getEvents = (...a) => api.getEvents(...a);
export const createEvent = (...a) => api.createEvent(...a);
export const recordJoin = (...a) => api.recordJoin(...a);
export const unrecordJoin = (...a) => api.unrecordJoin(...a);
export const joinEventDemo = (...a) => api.joinEventDemo(...a); // now throws by design

export const getBalance = (...a) => api.getBalance(...a); // sums /wallets
export const grantCredits = (...a) => api.grantCredits(...a); // throws deprecation
export const applyCredits = (...a) => api.applyCredits(...a); // throws deprecation
export const getHistory = (...a) => api.getHistory(...a);     // proxies /transactions/:email

export const getUserJoins = (...a) => api.getUserJoins(...a);

export const getConnectStatus = (...a) => api.getConnectStatus(...a);
export const startConnectOnboarding = (...a) => api.startConnectOnboarding(...a);

// Convenience export for dollars formatting
export { toDollars as dollars };
