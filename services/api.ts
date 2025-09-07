import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'api_base_v1';
const DEFAULT_BASE = Platform.select({
  ios: 'http://localhost:3001/api',
  android: 'http://10.0.2.2:3001/api',
  default: 'http://localhost:3001/api',
});
let API_BASE = process.env.EXPO_PUBLIC_API_BASE || DEFAULT_BASE || 'http://localhost:3001/api';

export function getApiBase(): string { return API_BASE; }
export async function loadApiBase(): Promise<string> { try { const v = await AsyncStorage.getItem(STORAGE_KEY); if (v) API_BASE = v; } catch {} return API_BASE; }
export async function setApiBase(next: string): Promise<void> { API_BASE = next; try { await AsyncStorage.setItem(STORAGE_KEY, next); } catch {} }

export async function ping(): Promise<boolean> { try { const r = await fetch(`${getApiBase()}/ping`); return r.ok; } catch { return false; } }

export async function getEvents(): Promise<any[]> {
  const res = await fetch(`${getApiBase()}/events`);
  const data = await res.json();
  return Array.isArray(data?.events) ? data.events : [];
}
export const refreshEvents = getEvents;

export async function seedDemoEvents(): Promise<{ success: boolean; count?: number }> {
  try { const res = await fetch(`${getApiBase()}/dev/seed-events`, { method: 'POST' }); const data = await res.json(); return { success: !!data?.success, count: data?.count }; } catch { return { success: false }; }
}

export async function getRegistrationStatus(eventId: string, email: string): Promise<boolean> {
  try { const res = await fetch(`${getApiBase()}/events/${encodeURIComponent(eventId)}/registration/${encodeURIComponent(email)}`); if (!res.ok) return false; const data = await res.json(); return !!data?.joined; } catch { return false; }
}
export async function joinEventWithCredits(eventId: string, email: string, fee?: number) {
  try {
    const res = await fetch(`${getApiBase()}/events/${encodeURIComponent(eventId)}/joinDemo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, ...(fee !== undefined ? { fee } : {}) }),
    });
    const data = await res.json();
    return { success: res.ok, ...data };
  } catch (e: any) { return { success: false, message: e?.message || 'Network error' }; }
}

export async function getBalance(email: string): Promise<number | null> {
  try { const res = await fetch(`${getApiBase()}/credits/${encodeURIComponent(email)}`); if (!res.ok) return null; const data = await res.json(); return typeof data?.balance === 'number' ? data.balance : null; } catch { return null; }
}
export async function applyCredits(email: string, delta: number, note?: string) {
  try {
    const res = await fetch(`${getApiBase()}/credits/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, delta, note }) });
    const data = await res.json();
    return { success: res.ok, balance: data?.balance, error: data?.error };
  } catch (e: any) { return { success: false, error: e?.message || 'network_error' }; }
}
export async function getCreditsHistory(email: string, opts?: { q?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (opts?.q) params.append('q', opts.q);
  if (opts?.limit) params.append('limit', String(opts.limit));
  const qs = params.toString();
  const url = `${getApiBase()}/credits/${encodeURIComponent(email)}/history${qs ? `?${qs}` : ''}`;
  try { const res = await fetch(url); if (!res.ok) return []; const data = await res.json(); return Array.isArray(data?.history) ? data.history : []; } catch { return []; }
}

export async function getUserRegistrations(email: string) {
  const res = await fetch(`${getApiBase()}/user/${encodeURIComponent(email)}/registrations`);
  const data = await res.json();
  return Array.isArray(data?.registrations) ? data.registrations : [];
}

// Stripe
export async function getConnectStatus(email: string) { const r = await fetch(`${getApiBase()}/stripe/connect/status/${encodeURIComponent(email)}`); return r.json(); }
export async function startConnectOnboarding(email: string, returnUrl?: string, refreshUrl?: string) {
  const r = await fetch(`${getApiBase()}/stripe/connect/onboard`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, returnUrl, refreshUrl }) });
  return r.json();
}

// Profiles
export async function getProfile(email: string) {
  const r = await fetch(`${getApiBase()}/profile/${encodeURIComponent(email)}`); const d = await r.json();
  return d?.profile || null;
}
export async function saveProfile(profile: any) {
  const r = await fetch(`${getApiBase()}/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
  return r.json();
}
export async function searchProfiles(q: string) {
  const url = `${getApiBase()}/profile/search?q=${encodeURIComponent(q||'')}`;
  const r = await fetch(url); const d = await r.json();
  return Array.isArray(d?.results) ? d.results : [];
}
export async function seedProfiles() {
  const r = await fetch(`${getApiBase()}/dev/seed-profiles`, { method: 'POST' });
  return r.json();
}
