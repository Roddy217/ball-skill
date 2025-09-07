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
    return this.makeRequest(`/events/${eventId}/joinDemo`, {
      method: 'POST',
      body: JSON.stringify({ email, fee }),
    });
  }

  // ---- Credits ----
  getCredits(email) {
    const enc = encodeURIComponent(email);
    return this.makeRequest(`/credits/${enc}`);
  }
  grantCredits(email, delta) {
    return this.makeRequest('/credits/grant', {
      method: 'POST',
      body: JSON.stringify({ email, delta }),
    });
  }

  // expose as method too (in case someone calls api.toDollars)
  toDollars(x) { return toDollars(x); }
}

export default new ApiService();
