/**
 * Central API client used by screens.
 * Exposes named exports and a default export object for back-compat.
 */

type Json = Record<string, any>;

/** Ensure the base always ends with /api */
function normalizeBase(input?: string) {
  let u = (input || '').trim();
  if (!u) return 'http://localhost:3001/api';
  // strip trailing slashes
  u = u.replace(/\/+$/, '');
  // append /api if missing
  if (!/\/api$/.test(u)) u = `${u}/api`;
  return u;
}

let API_BASE = normalizeBase(
  (typeof process !== 'undefined' && (process as any)?.env?.EXPO_PUBLIC_SERVER_URL) ||
  ''
);

export function getApiBase() {
  return API_BASE;
}
export function setApiBase(url: string) {
  API_BASE = normalizeBase(url);
}
export async function loadApiBase() {
  const envBase =
    (typeof process !== 'undefined' && (process as any)?.env?.EXPO_PUBLIC_SERVER_URL) ||
    '';
  if (envBase) API_BASE = normalizeBase(envBase);
  return API_BASE;
}

// Format cents to a string with optional sign (UI adds "$")
export function dollars(cents?: number | null, opts?: { withSign?: boolean }): string {
  const n = Number(cents ?? 0);
  const abs = Math.abs(n);
  const amt = (abs / 100).toFixed(2);
  const prefix = n < 0 ? '-' : (opts?.withSign ? '+' : '');
  return `${prefix}${amt}`;
}

function logBase() {
  console.log('[api] BASE', API_BASE);
}

async function http<T = any>(
  method: 'GET'|'POST'|'PUT'|'DELETE',
  path: string,
  body?: Json
): Promise<{ ok: boolean; status: number; json?: T }> {
  const url = `${API_BASE}${path}`;
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body != null) (init as any).body = JSON.stringify(body);

  const prettyBody = body != null ? ` body=${JSON.stringify(body)}` : '';
  console.log(`[api] → ${path} ${method}${prettyBody}`);
  logBase();

  const res = await fetch(url, init);
  let json: any = undefined;
  try { json = await res.json(); } catch {}
  console.log(`[api] ← ${path} ${res.status}`, json ?? {});
  return { ok: res.ok, status: res.status, json };
}

/* ---------------- Credits ---------------- */

export async function getBalance(email: string): Promise<number> {
  const enc = encodeURIComponent(email.trim().toLowerCase());
  const base = getApiBase();
  const res = await fetch(`${base}/credits/${enc}/wallets`);
  const data = await res.json();
  if (!res.ok) throw new Error('balance failed');
  const dollars = Number(data?.dollars || 0);
  const skill = Number(data?.skill || 0);
  return dollars + skill;
}

export async function getWallets(email: string): Promise<{ dollars: number; skill: number }> {
  const enc = encodeURIComponent(email.trim().toLowerCase());
  const base = getApiBase();
  const res = await fetch(`${base}/credits/${enc}/wallets`);
  const data = await res.json();
  if (!res.ok || !data?.success) throw new Error('wallets failed');
  return { dollars: Number(data.dollars || 0), skill: Number(data.skill || 0) };
}

/** Admin/user credits mutation (cents). Used for grants, deductions, refunds. */
export async function grantCredits(email: string, deltaCents: number, note?: string) {
  throw new Error('Deprecated: use wallet v2 endpoints via AdminScreen or Events join/unjoin');
  const payload = { email: (email || '').toLowerCase(), delta: Number(deltaCents||0), note: note || '' };
  const { ok, json } = await http<{ success: boolean; balance: number }>('POST', `/credits/grant`, payload);
  if (!ok || !json?.success) throw new Error('grant failed');
  return json as any;
}

/** Alias kept for older callers */
export async function applyCredits(email: string, deltaCents: number, note?: string) {
  throw new Error('Deprecated: use wallet v2 endpoints via AdminScreen or Events join/unjoin');
  return grantCredits(email, deltaCents, note);
}

// History: newest-first list of credit changes (in cents)
export async function getCreditsHistory(email: string, opts?: { limit?: number; q?: string }) {
  const enc = encodeURIComponent(email.trim().toLowerCase());
  const limit = Math.max(1, Math.min(200, Number(opts?.limit ?? 100)));
  const qs = new URLSearchParams({ limit: String(limit), sort: 'desc' });
  if (opts?.q) qs.set('q', opts.q);
  const url = `${API_BASE}/transactions/${enc}?${qs.toString()}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error('history failed');
  return Array.isArray(data?.items) ? data.items : [];
}

/* ---------------- Joins ---------------- */

/** Try multiple back-compat endpoints and return raw server payload. */
export async function getUserJoins(email: string): Promise<any> {
  const enc = encodeURIComponent((email || '').toLowerCase());

  // 1) /joins/:email
  let r = await http('GET', `/joins/${enc}`);
  if (r.ok) return r.json;

  // 2) /events/joins/:email
  r = await http('GET', `/events/joins/${enc}`);
  if (r.ok) return r.json;

  // 3) /user/:email/joins
  r = await http('GET', `/user/${enc}/joins`);
  if (r.ok) return r.json;

  console.log('[api.getUserJoins] no compatible route found; returning []');
  return [];
}

/** Join an event */
export async function recordJoin(eventId: string, email: string, wallet: 'skill'|'dollars' = 'dollars') {
  const eid = encodeURIComponent(eventId);
  const payload = { email: (email || '').toLowerCase().trim(), wallet };

  // primary, matches your server
  let r = await http('POST', `/events/${eid}/join`, payload);
  if (r.ok && (r.json as any)?.success !== false) return r.json as any;

  // legacy fallbacks
  r = await http('POST', `/events/${eid}/register`, payload);
  if (r.ok && (r.json as any)?.success !== false) return r.json as any;

  throw new Error('join failed (no compatible route)');
}

/** Unjoin an event — try the route your server supports first (DELETE /events/:id/join) */
export async function unrecordJoin(eventId: string, email: string) {
  const eid = encodeURIComponent(eventId);
  const payload = { email: (email || '').toLowerCase() };

  // primary, matches your server
  let r = await http('DELETE', `/events/${eid}/join`, payload as any);
  if (r.ok && (r.json as any)?.success !== false) return r.json;

  // other fallbacks used by older builds
  r = await http('POST', `/events/${eid}/unjoin`, payload);
  if (r.ok && (r.json as any)?.success !== false) return r.json;

  r = await http('POST', `/events/${eid}/leave`, payload);
  if (r.ok && (r.json as any)?.success !== false) return r.json;

  r = await http('POST', `/events/${eid}/unregister`, payload);
  if (r.ok && (r.json as any)?.success !== false) return r.json;

  throw new Error('unjoin failed (no compatible route)');
}

/* ---------------- Stripe Connect ---------------- */

export async function startConnectOnboarding(
  email: string,
  returnUrl: string,
  refreshUrl: string
): Promise<{ success: boolean; url: string; accountId?: string }> {
  const payload = { email: (email || '').toLowerCase(), returnUrl, refreshUrl };
  const { ok, json } = await http('POST', `/stripe/connect/onboard`, payload);
  if (!ok || !(json as any)?.success) throw new Error('onboard failed');
  return json as any;
}

export async function getConnectStatus(
  email: string
): Promise<{ success: boolean; hasAccount: boolean; accountId?: string; payouts_enabled?: boolean; charges_enabled?: boolean; requirements_due?: string[] }> {
  const enc = encodeURIComponent((email || '').toLowerCase());
  const { ok, json } = await http('GET', `/stripe/connect/status/${enc}`);
  if (!ok || !(json as any)?.success) throw new Error('status failed');
  return json as any;
}

/* ---------------- Default export (back-compat) ---------------- */

const api = {
  getApiBase,
  setApiBase,
  loadApiBase,
  dollars,
  getBalance,
  grantCredits,
  applyCredits,
  getCreditsHistory,
  getUserJoins,
  recordJoin,
  unrecordJoin,
  startConnectOnboarding,
  getConnectStatus,
};

export default api;
