// Minimal API wrapper (single source of truth)
import { Platform } from 'react-native';
import { auth } from './firebase';

// --- Networking base ---
// iPhone Expo Go hits your Mac's LAN IP; iOS Simulator can use localhost
const LAN_IP = '192.168.1.244'; // <-- set to your Mac LAN IP
export const API_BASE_URL =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? `http://${LAN_IP}:3001/api`
    : 'http://localhost:3001/api';

class ApiService {
  async getAuthToken() {
    const user = auth?.currentUser;
    return user ? await user.getIdToken() : null;
  }

  async makeRequest(endpoint, options = {}) {
    const token = await this.getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || `API request failed: ${res.status}`);
    }
    return data;
  }

  // ---- Convenience helpers ----
  getEvents(filters = {}) {
    const qs = new URLSearchParams(filters);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.makeRequest(`/events${suffix}`);
  }

  createEvent(payload) {
    return this.makeRequest(`/events`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  submitResult(eventId, payload) {
    return this.makeRequest(`/events/${eventId}/submit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Credits
  getCredits(email) {
    return this.makeRequest(`/credits/${encodeURIComponent(email)}`);
  }

  grantCredits(email, delta) {
    return this.makeRequest(`/credits/grant`, {
      method: 'POST',
      body: JSON.stringify({ email, delta }),
    });
  }

  // Head-to-Head compare
  compare(eventId, userA, userB, drills) {
    return this.makeRequest(`/events/${eventId}/compare`, {
      method: 'POST',
      body: JSON.stringify({ userA, userB, drills }),
    });
  }
}

export default new ApiService();
