import { Platform } from 'react-native';

// —— Server base URL ——
const RAW_SERVER =
  (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_SERVER_URL)
    ? process.env.EXPO_PUBLIC_SERVER_URL
    : ((Platform.OS === 'ios' || Platform.OS === 'android')
        ? 'http://192.168.1.244:3001' // your LAN IP for real device
        : 'http://localhost:3001');

export const API_BASE_URL = `${RAW_SERVER}/api`;

// dollars display helper (also exposed on api instance)
export const toDollars = (cents) => (Number(cents || 0) / 100).toFixed(2);

// legacy compatibility (UI reads these)
export async function loadApiBase() { /* no-op: using env/RAW_SERVER */ }
export function getApiBase() { return RAW_SERVER; }

class ApiService {
  async makeRequest(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const res = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
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
  joinEventDemo(eventId, email, fee) {
    return this.makeRequest(`/events/${encodeURIComponent(eventId)}/joinDemo`, {
      method: 'POST',
      body: JSON.stringify({ email, fee }),
    });
  }

  // ---- Credits ----
  async getCredits(email) {
    const enc = encodeURIComponent(String(email || '').toLowerCase());
    return this.makeRequest(`/credits/${enc}`); // { credits: number (cents) }
  }
  grantCredits(email, delta, note) {
    return this.makeRequest('/credits/grant', {
      method: 'POST',
      body: JSON.stringify({ email, delta, note }),
    });
  }
  // Balance in DOLLARS (string like "5.00")
  async getBalance(email) {
    const data = await this.getCredits(email);
    return toDollars(data?.credits ?? 0);
  }

  // --- Joins ---
  recordJoin(eventId, email) {
    return this.makeRequest(`/events/${encodeURIComponent(eventId)}/join`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }
  getUserJoins(email) {
    return this.makeRequest(`/users/${encodeURIComponent(String(email || '').toLowerCase())}/joins`);
  }
  // Returns boolean joined status; if no email, treat as not joined
  async getRegistrationStatus(eventId, email) {
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanEmail) return false;
    const id = encodeURIComponent(eventId);
    const params = new URLSearchParams({ email: cleanEmail }).toString();
    const data = await this.makeRequest(`/events/${id}/joined?${params}`);
    return !!data?.joined;
  }

  /** High-level helper: deduct fee then record join */
  async joinEvent(eventId, email, feeDollars) {
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanEmail) throw new Error('Sign in required');
    const fee = Math.abs(Number(feeDollars) || 0);
    if (fee > 0) await this.grantCredits(cleanEmail, -(fee * 100), `join:${eventId}`);
    await this.recordJoin(eventId, cleanEmail);
    return { success: true, fee };
  }

  // Back-compat alias used by older code paths
  joinEventWithCredits(eventId, email, feeDollars) {
    return this.joinEvent(eventId, email, feeDollars);
  }

  // expose as method too (in case someone calls api.toDollars)
  toDollars(x) { return toDollars(x); }
}

// Default instance (for: import api from '../services/api')
const api = new ApiService();
export default api;

// ---- Named wrappers (for: import { … } from '../services/api') ----
export const getEvents = (...args) => api.getEvents(...args);
export const createEvent = (...args) => api.createEvent(...args);
export const joinEventDemo = (...args) => api.joinEventDemo(...args);
export const getCredits = (...args) => api.getCredits(...args);
export const grantCredits = (...args) => api.grantCredits(...args);
export const getBalance = (...args) => api.getBalance(...args);
export const recordJoin = (...args) => api.recordJoin(...args);
export const getUserJoins = (...args) => api.getUserJoins(...args);
export const getRegistrationStatus = (...args) => api.getRegistrationStatus(...args);
export const joinEvent = (...args) => api.joinEvent(...args);
export const joinEventWithCredits = (...args) => api.joinEventWithCredits(...args);
