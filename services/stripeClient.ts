import { API_BASE_URL } from './api';

export type ConnectStatus = {
  success: boolean;
  hasAccount: boolean;
  accountId?: string;
  payouts_enabled?: boolean;
  charges_enabled?: boolean;
  requirements_due?: string[];
  error?: string;
};

export async function getConnectStatus(email: string): Promise<ConnectStatus> {
  const enc = encodeURIComponent(String(email || '').toLowerCase());
  const res = await fetch(`${API_BASE_URL}/stripe/connect/status/${enc}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, hasAccount: false, error: json?.error || 'request_failed' };
  }
  return json;
}

export async function startConnectOnboarding(
  email: string,
  refreshUrl: string,
  returnUrl: string
): Promise<{ success: boolean; url?: string; accountId?: string; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/stripe/connect/onboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, refreshUrl, returnUrl }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, error: json?.error || 'request_failed' };
  }
  return json;
}
