// Minimal API wrapper
import { auth } from "./firebase";

import { Platform } from "react-native";

// Mac’s LAN IP for real iPhone access
const LAN_IP = "192.168.1.244";

export const API_BASE_URL =
  Platform.OS === "ios" || Platform.OS === "android"
    ? `http://${LAN_IP}:3001/api`   // real iPhone uses your LAN IP
    : "http://localhost:3001/api";  // iOS Simulator / Web uses localhost


class ApiService {
  async getAuthToken() {
    const user = auth.currentUser;
    return user ? await user.getIdToken() : null;
  }

  async makeRequest(endpoint, options = {}) {
    const token = await this.getAuthToken();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "API request failed");
    return data;
  }

  // Example endpoints
  getUser(userId) {
    return this.makeRequest(`/users/${userId}`);
  }

  getEvents(filters = {}) {
    const qs = new URLSearchParams(filters);
    return this.makeRequest(`/events?${qs}`);
  }
  async getCredits(email) {
    const res = await fetch(`${API_BASE_URL}/credits/${encodeURIComponent(email)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Failed to fetch credits");
    return data; // { success, balance }
  }

  async grantCredits(email, delta) {
    const res = await fetch(`${API_BASE_URL}/credits/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, delta }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Failed to grant credits");
    return data; // { success, balance }
  }
}

export default new ApiService();
