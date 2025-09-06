// services/api.js
// Clean JS API client for Ball Skill (Expo). Keeps values in CREDITS (aka cents).

const BASE = (process.env.EXPO_PUBLIC_SERVER_URL || 'http://192.168.1.244:3001').replace(/\/+$/, '');
const API_BASE_URL = `${BASE}/api`;

class ApiService {
  // ---------- low-level ----------
  async makeRequest(endpoint, { method = 'GET', headers = {}, body } = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    if (body != null) opts.body = body;

    const res = await fetch(url, opts);
    const text = await res.text();

    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      console.warn('API error', { url, status: res.status, body: data });
      const msg =
        (data && (data.error || data.message || data.raw)) ||
        `Request failed ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // ---------- helpers ----------
  toDollars(cents) {
    return (Number(cents || 0) / 100).toFixed(2);
  }
  toCents(n) {
    const str = String(n ?? '').replace(/[^0-9.]/g, '');
    const cents = Math.round(Number(str || 0) * 100);
    return Number.isFinite(cents) ? cents : 0;
  }

  // ---------- normalization ----------
  normalizeEvent(e) {
    if (!e || typeof e !== 'object') return null;
    // Stable ID
    const rawId = e.id ?? e._id ?? e.eventId ?? e.uid ?? e.key ?? e.slug ?? null;
    let id = rawId != null ? String(rawId) : null;
    if (id) id = id.replace(/\s+/g, '');
    if (!id) {
      const seedA = e.title ?? e.name ?? 'event';
      const seedB = e.createdAt ?? e.date ?? e.updatedAt ?? Date.now();
      id = String(`${seedA}_${seedB}`).replace(/\s+/g, '') || Math.random().toString(36).slice(2);
    }

    // Fees in cents (primary), accept legacy shapes
    let feeCents = 0;
    if (typeof e.feeCents === 'number') feeCents = e.feeCents;
    else if (typeof e.fee === 'number') feeCents = Math.round(e.fee * 100);
    else if (typeof e.priceCents === 'number') feeCents = e.priceCents;

    // Title/Name
    const title = (e.title ?? e.name ?? `Event ${id}`).toString();
    const nowIso = new Date().toISOString();

    return {
      ...e,
      id,
      _id: e._id ?? id,
      eventId: e.eventId ?? id,
      title,
      name: e.name ?? title,
      feeCents,
      priceCents: e.priceCents ?? feeCents,
      fee: typeof e.fee === 'number' ? e.fee : Math.round(feeCents / 100),
      startAt: e.startAt ?? e.date ?? nowIso,
      status: e.status ?? 'OPEN',
      isActive: e.isActive ?? true,
      published: e.published ?? true,
      hidden: e.hidden ?? false,
    };
  }

  // ---------- events ----------
  async getEvents(filters = {}) {
    const qs = new URLSearchParams(filters);
    const suffix = String(qs) ? `?${qs}` : '';
    const raw = await this.makeRequest(`/events${suffix}`);
    const list = Array.isArray(raw)
      ? raw
      : (raw && Array.isArray(raw.events) ? raw.events : []);
    const norm = (Array.isArray(list) ? list : []).map((e) => this.normalizeEvent(e)).filter(Boolean);
    console.log('[api] events fetched', norm.length, 'items');
    if (norm.length) {
      console.log(
        '[api] events sample',
        norm.slice(0, 2).map((e) => ({ id: e.id ?? null, title: e.title ?? e.name ?? null }))
      );
    }
    return norm;
  }

  async getEvent(id) {
    const target = String(id).replace(/\s+/g, '');
    const list = await this.getEvents();
    const found = list.find((e) => String(e.id || '').replace(/\s+/g, '') === target);
    if (!found) {
      const sample = list.slice(0, 5).map((e) => e.id ?? null);
      throw new Error(`Event not found: ${target} (sample ids: ${JSON.stringify(sample)})`);
    }
    return found;
  }

  createEvent(payload = {}) {
    const feeCents =
      typeof payload.feeCents === 'number'
        ? payload.feeCents
        : (typeof payload.fee === 'number' ? Math.round(payload.fee * 100) : 0);

    const compat = {
      ...payload,
      title: payload.title ?? payload.name ?? 'Ball Skill – Demo Event',
      name: payload.name ?? payload.title ?? 'Ball Skill – Demo Event',
      startAt: payload.startAt ?? payload.date ?? new Date().toISOString(),
      status: payload.status ?? 'OPEN',
      isActive: payload.isActive ?? true,
      published: payload.published ?? true,
      hidden: payload.hidden ?? false,
      feeCents,
      fee: Math.round(feeCents / 100),
      priceCents: payload.priceCents ?? feeCents,
    };

    return this.makeRequest(`/events`, {
      method: 'POST',
      body: JSON.stringify(compat),
    }).then((res) => {
      const created = this.normalizeEvent(res?.event ?? res);
      console.log('[api] event created', {
        id: created?.id,
        title: created?.title ?? created?.name ?? null,
        feeCents: created?.feeCents,
      });
      return created;
    });
  }

  updateEvent(id, patch = {}) {
    const eid = encodeURIComponent(String(id).replace(/\s+/g, ''));
    return this.makeRequest(`/events/${eid}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  }

  deleteEvent(id) {
    const eid = encodeURIComponent(String(id).replace(/\s+/g, ''));
    return this.makeRequest(`/events/${eid}`, { method: 'DELETE' });
  }

  // ---------- registrations / join ----------
  isJoined(eventId, email) {
    const eid = encodeURIComponent(String(eventId).replace(/\s+/g, ''));
    const enc = encodeURIComponent(email);
    return this.makeRequest(`/events/${eid}/registration/${enc}`);
  }

  joinEventDemo(eventId, email, fee) {
    const eid = encodeURIComponent(String(eventId).replace(/\s+/g, ''));
    const payload = { email, fee };
    return this.makeRequest(`/events/${eid}/joinDemo`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async joinAndCharge(eventId, email) {
    const event = await this.getEvent(eventId);
    const feeCents = Number(event?.feeCents || 0);

    try {
      await this.joinEventDemo(eventId, email, feeCents);
      return { success: true, charged: feeCents, mode: 'server' };
    } catch (err1) {
      try {
        const dollars = Math.round(feeCents / 100);
        await this.joinEventDemo(eventId, email, dollars);
        return { success: true, charged: dollars * 100, mode: 'server-dollars' };
      } catch (_err2) {
        await this.applyCredits(email, -feeCents, `event:${String(eventId).replace(/\s+/g, '')}`);
        await this.joinEventDemo(eventId, email, 0);
        return { success: true, charged: feeCents, mode: 'client-fallback' };
      }
    }
  }

  // ---------- credits ----------
  getCredits(email) {
    const enc = encodeURIComponent(email);
    return this.makeRequest(`/credits/${enc}`);
  }

  applyCredits(email, delta, reason = '') {
    return this.makeRequest(`/credits/apply`, {
      method: 'POST',
      body: JSON.stringify({ email, delta, reason }),
    });
  }

  history(email) {
    const enc = encodeURIComponent(email);
    return this.makeRequest(`/credits/${enc}/history`);
  }
}

const api = new ApiService();
export const toDollars = (cents) => api.toDollars(cents);
export const toCents = (n) => api.toCents(n);
export default api;