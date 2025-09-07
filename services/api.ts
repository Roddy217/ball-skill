import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'api_base_v1';

const DEFAULT_BASE = Platform.select({
  ios: 'http://localhost:3001/api',
  android: 'http://10.0.2.2:3001/api',
  default: 'http://localhost:3001/api',
});

let API_BASE = process.env.EXPO_PUBLIC_API_BASE || DEFAULT_BASE || 'http://localhost:3001/api';

export function getApiBase(): string {
  return API_BASE;
}
export async function loadApiBase(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && typeof stored === 'string') API_BASE = stored;
  } catch {}
  return API_BASE;
}
export async function setApiBase(next: string): Promise<void> {
  API_BASE = next;
  try { await AsyncStorage.setItem(STORAGE_KEY, next); } catch {}
}

export async function ping(): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/ping`);
    return res.ok;
  } catch { return false; }
}

export type JoinResponse = { success: boolean; joined?: boolean; already?: boolean; message?: string; error?: string; balance?: number; fee?: number };

export async function getRegistrationStatus(eventId: string, email: string): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/events/${encodeURIComponent(eventId)}/registration/${encodeURIComponent(email)}`);
    if (!res.ok) return false;
    const data = await res.json();
    return !!data?.joined;
  } catch { return false; }
}

export async function joinEventWithCredits(eventId: string, email: string, fee?: number): Promise<JoinResponse> {
  try {
    const res = await fetch(`${getApiBase()}/events/${encodeURIComponent(eventId)}/joinDemo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, ...(fee !== undefined ? { fee } : {}) }),
    });
    const data = await res.json();
    return { success: res.ok, ...data };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Network error' };
  }
}

export async function getBalance(email: string): Promise<number | null> {
  try {
    const res = await fetch(`${getApiBase()}/credits/${encodeURIComponent(email)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.balance === 'number' ? data.balance : null;
  } catch { return null; }
}

// Apply credits (with optional note) via /api/credits/apply
export async function applyCredits(email: string, delta: number, note?: string): Promise<{ success: boolean; balance?: number; error?: string }> {
  try {
    const res = await fetch(`${getApiBase()}/credits/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, delta, note }),
    });
    const data = await res.json();
    return { success: res.ok, balance: data?.balance, error: data?.error };
  } catch (e: any) {
    return { success: false, error: e?.message || 'network_error' };
  }
}

// History feed
export async function getCreditsHistory(email: string, opts?: { q?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (opts?.q) params.append('q', opts.q);
  if (opts?.limit) params.append('limit', String(opts.limit));
  const qs = params.toString();
  const url = `${getApiBase()}/credits/${encodeURIComponent(email)}/history${qs ? `?${qs}` : ''}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.history) ? data.history : [];
  } catch {
    return [];
  }
}

// Stripe Connect helpers
export type ConnectStatus = { success: boolean; hasAccount?: boolean; accountId?: string; payouts_enabled?: boolean; charges_enabled?: boolean; requirements_due?: string[]; error?: string };
export async function getConnectStatus(email: string): Promise<ConnectStatus> {
  const res = await fetch(`${getApiBase()}/stripe/connect/status/${encodeURIComponent(email)}`);
  return res.json();
}
export async function startConnectOnboarding(email: string, returnUrl?: string, refreshUrl?: string): Promise<{ success: boolean; url?: string; error?: string }> {
  const res = await fetch(`${getApiBase()}/stripe/connect/onboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, returnUrl, refreshUrl }),
  });
  return res.json();
}

// Placeholder for card flow (later)
export async function joinEventWithStripe(_eventId: string, _email: string): Promise<JoinResponse> {
  return { success: false, message: 'Stripe join not implemented yet in client' };
}
