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
    return this.makeRequest(`/events/${encodeURIComponent(eventId)}/joinDemo`, {
      method: 'POST',
      body: JSON.stringify({ email, fee }),
    });
  }

  // ---- Credits ----
  async getBalance(email) {
    const enc = encodeURIComponent(String(email || '').toLowerCase());
    const resp = await this.makeRequest(`/credits/${enc}`); // { balance: number (cents) }
    const cents =
      typeof resp?.balance === 'number'
        ? resp.balance
        : typeof resp?.credits === 'number'
          ? resp.credits
          : 0;
    return cents;
  }
  grantCredits(email, delta, note) {
    console.log('[api.grantCredits]', JSON.stringify({ email, delta, note }));
    return this.makeRequest('/credits/grant', {
      method: 'POST',
      body: JSON.stringify({ email, delta, note }),
    });
  }
  applyCredits(email, delta, note) {
    console.log('[api.applyCredits]', JSON.stringify({ email, delta, note }));
    return this.makeRequest('/credits/apply', {
      method: 'POST',
      body: JSON.stringify({ email, delta, note }),
    });
  }
  getHistory(email, { q = '', limit = 100 } = {}) {
    const enc = encodeURIComponent(String(email || '').toLowerCase());
    const qs = new URLSearchParams({ q, limit: String(limit) }).toString();
    return this.makeRequest(`/credits/${enc}/history?${qs}`);
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
export const joinEventDemo = (...a) => api.joinEventDemo(...a);

export const getBalance = (...a) => api.getBalance(...a);
export const grantCredits = (...a) => api.grantCredits(...a);
export const applyCredits = (...a) => api.applyCredits(...a);
export const getHistory = (...a) => api.getHistory(...a);

export const getUserJoins = (...a) => api.getUserJoins(...a);

export const getConnectStatus = (...a) => api.getConnectStatus(...a);
export const startConnectOnboarding = (...a) => api.startConnectOnboarding(...a);

// Convenience export for dollars formatting
export { toDollars as dollars };

/** -------------------- Credits: history -------------------- */
export async function getCreditsHistory(email, opts = {}) {
  const limit = Math.max(1, Math.min(500, Number(opts.limit ?? 100)));
  const enc = encodeURIComponent(String(email || '').toLowerCase());
  const urls = [
    `${API_BASE_URL}/credits/${enc}/history?limit=${limit}`,
    `${API_BASE_URL}/credits/history?email=${enc}&limit=${limit}`, // fallback shape
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      let json = {};
      try { json = await res.json(); } catch (_e) {}
      if (res.ok && json && (Array.isArray(json.history) || Array.isArray(json.items))) {
        return json.history || json.items || [];
      }
    } catch (_e) {
      // try next
    }
  }
  return [];
}
