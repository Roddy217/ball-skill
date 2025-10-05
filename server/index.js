import 'dotenv/config';
import express from 'express';
import { connectWebhook } from './stripe_webhooks.js';
import cors from 'cors';
import crypto from 'node:crypto';
import Stripe from 'stripe';
import attachSubmissions from './submissions.js';
import connectRouter from './stripeConnect.js';

const app = express();
app.post('/api/connect/webhook', ...connectWebhook);
// Stripe Connect webhook MUST be before JSON parser (needs raw body)
app.use(cors());
app.use(express.json());

// ---------------- Wallet v2 (authoritative) ----------------
const walletV2 = new Map();  // emailKey -> { dollars: number, skill: number }
const histV2 = new Map();    // emailKey -> Array<{ts, op, wallet, amount, note, after:{dollars,skill}}>

function emailKey(s) { return String(s || '').trim().toLowerCase(); }
function getOrInitWallet(email) {
  const k = emailKey(email);
  if (!walletV2.has(k)) walletV2.set(k, { dollars: 0, skill: 0 });
  return walletV2.get(k);
}
function pushHist(email, entry) {
  const k = emailKey(email);
  if (!histV2.has(k)) histV2.set(k, []);
  histV2.get(k).unshift({ ts: Date.now(), ...entry });
}

function addToWallet(email, wallet, amount, note) {
  if (wallet !== 'skill' && wallet !== 'dollars') throw new Error('invalid_wallet');
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) throw new Error('invalid_amount');
  const w = getOrInitWallet(email);
  w[wallet] = (w[wallet] || 0) + amt;
  pushHist(email, { op: 'add', wallet, amount: amt, note: note || null, after: { dollars: w.dollars || 0, skill: w.skill || 0 } });
  return { dollars: w.dollars || 0, skill: w.skill || 0 };
}
function deductFromWallet(email, wallet, amount, note) {
  if (wallet !== 'skill' && wallet !== 'dollars') throw new Error('invalid_wallet');
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) throw new Error('invalid_amount');
  const w = getOrInitWallet(email);
  const current = Number(w[wallet] || 0);
  if (amt > current) {
    const err = new Error('insufficient_funds');
    err.meta = { wallet, required: amt, available: current };
    throw err;
  }
  w[wallet] = current - amt;
  pushHist(email, { op: 'deduct', wallet, amount: amt, note: note || null, after: { dollars: w.dollars || 0, skill: w.skill || 0 } });
  return { dollars: w.dollars || 0, skill: w.skill || 0 };
}
function getWallets(email) {
  const w = getOrInitWallet(email);
  return { dollars: Number(w.dollars || 0), skill: Number(w.skill || 0) };
}
// -----------------------------------------------------------

// ---- Joins (in-memory, dev) — canonical block ----
// Persist across hot reloads using globalThis cache.
const joinsByEmail =
  globalThis.__joinsByEmail || (globalThis.__joinsByEmail = new Map());

function ensureJoinSet(email) {
  const key = k(email);
  if (!joinsByEmail.has(key)) joinsByEmail.set(key, new Set());
  return joinsByEmail.get(key);
}

function serializeJoined(set) {
  return Array.from(set || []).map(String);
}

// --- Read joins (three compat paths) ---
app.get('/api/joins/:email', (req, res) => {
  const email = req.params.email || '';
  const set = ensureJoinSet(email);
  return res.json({ success: true, joined: serializeJoined(set) });
});

app.get('/api/events/joins/:email', (req, res) => {
  const email = req.params.email || '';
  const set = ensureJoinSet(email);
  return res.json({ success: true, joined: serializeJoined(set) });
});

app.get('/api/user/:email/joins', (req, res) => {
  const email = req.params.email || '';
  const set = ensureJoinSet(email);
  return res.json({ success: true, joined: serializeJoined(set) });
});

// --- Write joins ---
// Join an event — maps both ways; credits handled on client.
app.post('/api/events/:id/join', (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const email = String((req.body?.email || '')).trim().toLowerCase();
    const walletIn = String(req.body?.wallet || 'dollars').toLowerCase();
    const wallet = (walletIn === 'skill' || walletIn === 'dollars') ? walletIn : 'dollars';

    if (!email) return res.status(400).json({ success: false, error: 'missing_email' });

    // locate event (support array or map)
    const ev = events.find?.((e) => e.id === id) || (events[id] || null);
    if (!ev) return res.status(404).json({ success: false, error: 'event_not_found' });
    const feeCents = Number(ev.feeCents || 0);
    if (!Number.isInteger(feeCents) || feeCents < 0) return res.status(400).json({ success: false, error: 'bad_fee' });

    // Deduct from requested wallet
    let wallets;
    try {
      wallets = deductFromWallet(email, wallet, feeCents, `event:${id}:join:${wallet}`);
    } catch (e) {
      if (e && e.message === 'insufficient_funds') {
        return res.status(400).json({ success: false, error: 'insufficient_funds', wallet, ...(e.meta || {}) });
      }
      console.error('[events.join] wallet error', e);
      return res.status(500).json({ success: false, error: 'wallet_error' });
    }

    // Ensure registrants is a dictionary: email -> { wallet, ts }
    if (Array.isArray(ev.registrants)) {
      // migrate array to map (true -> assume dollars historical, but new joins store actual wallet)
      const map = {};
      for (const u of ev.registrants) map[String(u).toLowerCase()] = { wallet: 'dollars', ts: Date.now() };
      ev.registrants = map;
    } else if (!ev.registrants || typeof ev.registrants !== 'object') {
      ev.registrants = {};
    }

    ev.registrants[email] = { wallet, ts: Date.now() };
    ev.registered = Object.keys(ev.registrants || {}).length;

    return res.json({ success: true, event: { id: ev.id, registered: ev.registered, feeCents }, wallets, usedWallet: wallet });
  } catch (e) {
    console.error('[events.join] fatal', e);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
});

// Unjoin (DELETE with JSON body or query ?email=)
// and legacy aliases that some clients still call.
app.post('/api/events/:id/unjoin', (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const email = String((req.body?.email || '')).trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, error: 'missing_email' });

    const ev = events.find?.((e) => e.id === id) || (events[id] || null);
    if (!ev) return res.status(404).json({ success: false, error: 'event_not_found' });
    const feeCents = Number(ev.feeCents || 0);

    // derive previous wallet used to join
    let usedWallet = 'dollars';
    if (ev.registrants && typeof ev.registrants === 'object') {
      const ent = ev.registrants[email];
      if (ent && (ent.wallet === 'skill' || ent.wallet === 'dollars')) usedWallet = ent.wallet;
      // remove registration
      delete ev.registrants[email];
    } else if (Array.isArray(ev.registrants)) {
      // legacy array
      ev.registrants = ev.registrants.filter((u) => String(u).toLowerCase() !== email);
    } else {
      ev.registrants = {};
    }
    ev.registered = Object.keys(ev.registrants || {}).length;

    // Refund to the same wallet
    let wallets;
    try {
      wallets = addToWallet(email, usedWallet, feeCents, `event:${id}:refund:${usedWallet}`);
    } catch (e) {
      console.error('[events.unjoin] wallet error', e);
      return res.status(500).json({ success: false, error: 'wallet_error' });
    }

    return res.json({ success: true, event: { id: ev.id, registered: ev.registered, feeCents }, wallets, usedWallet });
  } catch (e) {
    console.error('[events.unjoin] fatal', e);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
});

const { PORT = 3001, STRIPE_SECRET_KEY = '' } = process.env;

// ---- In-memory stores ----
const events = []; // [{ id, name, dateISO, locationType, feeCents, drillsEnabled }]
const credits = new Map(); // email -> { dollars: number, skill: number }
const creditsHistory = new Map(); // email -> [{ ts, delta, note, balanceAfter }]
const registrationsByEvent = new Map(); // eventId -> Set<email>

// Stripe (optional in dev; endpoints return error if not configured)
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' }) : null;
// Map email -> Stripe Account ID (DEV-ONLY memory; we will move to Firestore later)
const stripeAccountsByEmail = new Map();

function k(email) { return (email || '').toLowerCase(); }
function getUserCredits(email) {
  const key = k(email);
  if (!credits.has(key)) credits.set(key, { dollars: 0, skill: 0 });
  return credits.get(key);
}
function ensureEventSet(eventId) {
  if (!registrationsByEvent.has(eventId)) registrationsByEvent.set(eventId, new Set());
  return registrationsByEvent.get(eventId);
}
function pushHistory(email, delta, note, balanceAfter, wallet) {
  const key = k(email);
  if (!creditsHistory.has(key)) creditsHistory.set(key, []);
  // derive walletBalanceAfter from current wallet values
  const w = getUserCredits(email);
  const walletBalanceAfter = wallet === 'skill' ? Number(w.skill || 0) : Number(w.dollars || 0);
  creditsHistory.get(key).push({
    ts: Date.now(),
    delta: Number(delta),
    note: note || null,
    balanceAfter: Number(balanceAfter),
    ...(wallet ? { wallet } : {}),
    walletBalanceAfter,
  });
}

// --- wallet routing helper (centralized) ---
function chooseWalletByNote(note = '', delta = 0, overrideWallet = '') {
  const ov = String(overrideWallet || '').toLowerCase();
  if (ov === 'skill' || ov === 'dollars') return ov;

  const n = String(note || '').toLowerCase().trim();

  // Explicit directives always win
  if (/(refund:skill|deduct:skill)\b/.test(n)) return 'skill';
  if (/(refund:dollars|deduct:dollars)\b/.test(n)) return 'dollars';

  // Promo-ish keywords go to SKILL regardless of delta sign
  if (/(^|\b)(promo|bonus|demo|signup|referral|skill)(\b|$)/i.test(n)) return 'skill';

  // Fallback: everything else → dollars
  return 'dollars';
}

// ---------- Health / Dev ----------
app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok' }));
app.get('/api/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get('/api/admin/ping', (_req, res) => res.json({ ok: true, admin: false, ts: Date.now() }));

// ---------- Events ----------
// List all events (includes participantCounts & computed registered)
app.get('/api/events', (_req, res) => {
  const list = (events || []).map(ev => {
    const counts = ev.participantCounts || { teen: 0, adult: 0, pro: 0, celebrity: 0 };
    const registered = counts.teen + counts.adult + counts.pro + counts.celebrity;
    return { ...ev, registered };
  });
  return res.json({ success: true, events: list });
});

app.post('/api/events', (req, res) => {
  const { name, feeCents = 0, locationType = 'online', drillsEnabled = [] } = req.body || {};
  if (!name) return res.status(400).json({ success: false, error: 'name required' });
  const id = crypto.randomBytes(6).toString('hex');
  const ev = {
    id,
    name,
    dateISO: new Date().toISOString(),
    locationType,
    feeCents: Number(feeCents) || 0,
    drillsEnabled: Array.isArray(drillsEnabled) ? drillsEnabled : [],
    totalSpots: Number(req.body?.totalSpots) || 100,
    participantCounts: { teen: 0, adult: 0, pro: 0, celebrity: 0 },
  };
  events.push(ev);
  return res.json({ success: true, event: ev });
});

// Get one event by id (includes computed registered)
app.get('/api/events/:id', (req, res) => {
  const { id } = req.params;
  const ev = events.find(e => e.id === id);
  if (!ev) return res.status(404).json({ success: false, error: 'event_not_found' });
  const counts = ev.participantCounts || { teen: 0, adult: 0, pro: 0, celebrity: 0 };
  const registered = counts.teen + counts.adult + counts.pro + counts.celebrity;
  return res.json({ success: true, event: { ...ev, registered } });
});

// Upsert participant counts (admin/dev). Body: { teen?, adult?, pro?, celebrity?, totalSpots? }
app.post('/api/events/:id/participants', (req, res) => {
  const { id } = req.params;
  const ev = events.find(e => e.id === id);
  if (!ev) return res.status(404).json({ success: false, error: 'event_not_found' });
  const counts = ev.participantCounts || (ev.participantCounts = { teen: 0, adult: 0, pro: 0, celebrity: 0 });
  const toInt = (v) => Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : undefined;
  const teen = toInt(req.body?.teen);
  const adult = toInt(req.body?.adult);
  const pro = toInt(req.body?.pro);
  const celebrity = toInt(req.body?.celebrity);
  if (typeof teen === 'number') counts.teen = teen;
  if (typeof adult === 'number') counts.adult = adult;
  if (typeof pro === 'number') counts.pro = pro;
  if (typeof celebrity === 'number') counts.celebrity = celebrity;
  if (Number.isFinite(Number(req.body?.totalSpots))) ev.totalSpots = Math.max(0, Math.floor(Number(req.body.totalSpots)));
  const registered = counts.teen + counts.adult + counts.pro + counts.celebrity;
  return res.json({ success: true, event: { ...ev, registered } });
});

// Registration status (idempotent check)
app.get('/api/events/:id/registration/:email', (req, res) => {
  const { id, email } = req.params;
  const set = registrationsByEvent.get(id);
  const joined = !!(set && set.has(k(email)));
  res.json({ joined });
});

// Join via demo credits (idempotent)
app.post('/api/events/:id/joinDemo', (req, res) => {
  const { id } = req.params;
  const email = k(req.body?.email);
  const fee = Number(req.body?.fee ?? 10);

  if (!email) return res.status(400).json({ success: false, error: 'email required' });
  if (!Number.isFinite(fee) || fee < 0) return res.status(400).json({ success: false, error: 'invalid fee' });

  const regSet = ensureEventSet(id);

  // already joined → no deduction
  if (regSet.has(email)) {
    return res.json({ success: true, joined: true, already: true });
  }

  const wallet = getUserCredits(email);
  const combinedBefore = (wallet.dollars || 0) + (wallet.skill || 0);
  if (combinedBefore < fee) {
    return res.status(400).json({ success: false, error: 'insufficient credits', balance: combinedBefore, required: fee });
  }

  let remaining = fee;
  if ((wallet.dollars || 0) > 0) {
    const use = Math.min(wallet.dollars, remaining);
    wallet.dollars -= use;
    remaining -= use;
    const after = (wallet.dollars || 0) + (wallet.skill || 0);
    pushHistory(email, -use, `join:${id}`, after, 'dollars');
    console.log('[joinDemo][dollars]', { email, used: use, remaining, after });
  }
  if (remaining > 0) {
    const use = Math.min(wallet.skill || 0, remaining);
    wallet.skill -= use;
    remaining -= use;
    const after = (wallet.dollars || 0) + (wallet.skill || 0);
    pushHistory(email, -use, `join:${id}`, after, 'skill');
    console.log('[joinDemo][skill]', { email, used: use, remaining, after });
  }

  const combinedAfter = (wallet.dollars || 0) + (wallet.skill || 0);
  regSet.add(email);
  return res.json({ success: true, joined: true, already: false, fee, balance: combinedAfter, eventId: id });
});

// ---------- Credits ----------
// --------------- Wallet v2 Endpoints ----------------
app.get('/api/credits/:email/wallets', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || '');
    const out = getWallets(email);
    return res.json({ success: true, email: emailKey(email), skill: out.skill, dollars: out.dollars });
  } catch (e) {
    console.error('[wallets.get]', e);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
});

app.post('/api/credits/:email/skill/add', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || '');
    const { amount, note } = req.body || {};
    const out = addToWallet(email, 'skill', amount, note);
    return res.json({ success: true, email: emailKey(email), skill: out.skill, dollars: out.dollars });
  } catch (e) {
    if (e.message === 'invalid_amount') return res.status(400).json({ success: false, error: 'invalid_amount' });
    if (e.message === 'invalid_wallet') return res.status(400).json({ success: false, error: 'invalid_wallet' });
    console.error('[skill.add]', e);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
});

app.post('/api/credits/:email/skill/deduct', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || '');
    const { amount, note } = req.body || {};
    const out = deductFromWallet(email, 'skill', amount, note);
    return res.json({ success: true, email: emailKey(email), skill: out.skill, dollars: out.dollars });
  } catch (e) {
    if (e.message === 'invalid_amount') return res.status(400).json({ success: false, error: 'invalid_amount' });
    if (e.message === 'invalid_wallet') return res.status(400).json({ success: false, error: 'invalid_wallet' });
    if (e.message === 'insufficient_funds') {
      return res.status(400).json({ success: false, error: 'insufficient_funds', ...(e.meta || {}) });
    }
    console.error('[skill.deduct]', e);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
});

app.post('/api/credits/:email/dollars/add', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || '');
    const { amount, note } = req.body || {};
    const out = addToWallet(email, 'dollars', amount, note);
    return res.json({ success: true, email: emailKey(email), skill: out.skill, dollars: out.dollars });
  } catch (e) {
    if (e.message === 'invalid_amount') return res.status(400).json({ success: false, error: 'invalid_amount' });
    if (e.message === 'invalid_wallet') return res.status(400).json({ success: false, error: 'invalid_wallet' });
    console.error('[dollars.add]', e);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
});

app.post('/api/credits/:email/dollars/deduct', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email || '');
    const { amount, note } = req.body || {};
    const out = deductFromWallet(email, 'dollars', amount, note);
    return res.json({ success: true, email: emailKey(email), skill: out.skill, dollars: out.dollars });
  } catch (e) {
    if (e.message === 'invalid_amount') return res.status(400).json({ success: false, error: 'invalid_amount' });
    if (e.message === 'invalid_wallet') return res.status(400).json({ success: false, error: 'invalid_wallet' });
    if (e.message === 'insufficient_funds') {
      return res.status(400).json({ success: false, error: 'insufficient_funds', ...(e.meta || {}) });
    }
    console.error('[dollars.deduct]', e);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
});
// ----------------------------------------------------

app.get('/api/credits/:email', (req, res) => {
  console.warn('[DEPRECATED] legacy credits route in use — migrate to /api/credits/:email/{skill|dollars}/{add|deduct} and /wallets');
  const email = k(decodeURIComponent(req.params.email || ''));
  const wallet = getUserCredits(email);
  return res.json({ success: true, balance: (wallet.dollars || 0) + (wallet.skill || 0) });
});

// Wallet breakdown (dollars, skill, combined)
app.get('/api/credits/:email/detail', (req, res) => {
  console.warn('[DEPRECATED] legacy credits route in use — migrate to /api/credits/:email/{skill|dollars}/{add|deduct} and /wallets');
  const email = k(decodeURIComponent(req.params.email || ''));
  const w = getUserCredits(email);
  const dollars = Number(w.dollars || 0);
  const skill = Number(w.skill || 0);
  return res.json({ success: true, dollars, skill, combined: dollars + skill });
});

// New: apply any delta with a note; logs history
app.post('/api/credits/apply', (req, res) => {
  console.warn('[DEPRECATED] legacy credits route in use — migrate to /api/credits/:email/{skill|dollars}/{add|deduct} and /wallets');
  const email = k(req.body?.email);
  const delta = Number(req.body?.delta);
  const note = req.body?.note;
  const overrideWallet = (req.body?.wallet || '').toString().toLowerCase(); // optional: 'skill' | 'dollars'
  if (!email || !Number.isFinite(delta)) {
    return res.status(400).json({ success: false, error: 'email and numeric delta required' });
  }
  const w = getUserCredits(email);

  const walletKey = chooseWalletByNote(note, delta, overrideWallet);
  console.log('[credits.apply]', { email, delta, note, overrideWallet, walletKey });

  const amt = Math.abs(delta);
  if (delta >= 0) {
    w[walletKey] = (w[walletKey] || 0) + amt;
  } else {
    const current = Number(w[walletKey] || 0);
    if (amt > current) {
      return res.status(400).json({ success: false, error: 'insufficient_funds_in_wallet', wallet: walletKey, required: amt, available: current });
    }
    w[walletKey] = current - amt;
  }

  const combined = (w.dollars || 0) + (w.skill || 0);
  pushHistory(email, delta, note, combined, walletKey);
  return res.json({ success: true, balance: combined, wallet: walletKey, walletBalances: { dollars: w.dollars || 0, skill: w.skill || 0 } });
});

// Keep: legacy grant; also logs history with a default note
app.post('/api/credits/grant', (req, res) => {
  console.warn('[DEPRECATED] legacy credits route in use — migrate to /api/credits/:email/{skill|dollars}/{add|deduct} and /wallets');
  const { email, delta, note } = req.body || {};
  if (!email || !Number.isFinite(Number(delta))) {
    return res.status(400).json({ success: false, error: 'email and numeric delta required' });
  }
  const w = getUserCredits(email);
  const amt = Number(delta);
  const walletKey = chooseWalletByNote(note, amt, (req.body?.wallet || '').toString().toLowerCase());

  if (amt >= 0) {
    w[walletKey] = (w[walletKey] || 0) + amt;
  } else {
    const need = Math.abs(amt);
    const current = Number(w[walletKey] || 0);
    if (need > current) {
      return res.status(400).json({ success: false, error: 'insufficient_funds_in_wallet', wallet: walletKey, required: need, available: current });
    }
    w[walletKey] = current - need;
  }

  const combined = (w.dollars || 0) + (w.skill || 0);
  pushHistory(email, amt, note || 'grant', combined, walletKey);
  console.log('[credits.grant]', { email, delta: amt, note, wallet: walletKey, after: { dollars: w.dollars || 0, skill: w.skill || 0 } });
  return res.json({ success: true, balance: combined, wallet: walletKey, walletBalances: { dollars: w.dollars || 0, skill: w.skill || 0 } });
});

// History feed (newest first). Optional query: limit, q (substring match on note)
app.get('/api/credits/:email/history', (req, res) => {
  console.warn('[DEPRECATED] legacy credits route in use — migrate to /api/credits/:email/{skill|dollars}/{add|deduct} and /wallets');
  const email = k(decodeURIComponent(req.params.email || ''));
  const q = (req.query?.q || '').toString().toLowerCase();
  const limit = Math.max(1, Math.min(200, Number(req.query?.limit || 100)));
  const list = (creditsHistory.get(email) || [])
    .filter(it => (q ? (it.note || '').toLowerCase().includes(q) : true))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);
  return res.json({ success: true, history: list });
});

// ---------- Stripe Connect ----------
// helper to ensure http(s) URL
function isHttpUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch {
    return false;
  }
}

app.post('/api/stripe/connect/onboard', async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ success: false, error: 'stripe_not_configured' });
    const email = k(req.body?.email);
    if (!email) return res.status(400).json({ success: false, error: 'email required' });

    // Reuse existing account id for this email if present
    let acctId = stripeAccountsByEmail.get(email);
    if (!acctId) {
      const acct = await stripe.accounts.create({
        type: 'express',
        email,
        capabilities: { transfers: { requested: true } },
        business_type: 'individual',
      });
      acctId = acct.id;
      stripeAccountsByEmail.set(email, acctId);
    }

    // derive server origin so defaults are always valid http(s)
    const origin = `${req.protocol}://${req.get('host')}`;
    const refresh_url = isHttpUrl(req.body?.refreshUrl) ? req.body.refreshUrl : `${origin}/connect/refresh`;
    const return_url  = isHttpUrl(req.body?.returnUrl)  ? req.body.returnUrl  : `${origin}/connect/return`;

    const link = await stripe.accountLinks.create({
      account: acctId,
      refresh_url,
      return_url,
      type: 'account_onboarding',
    });

    res.json({ success: true, accountId: acctId, url: link.url });
  } catch (e) {
    console.error('connect/onboard error', e);
    res.status(500).json({ success: false, error: 'stripe_error' });
  }
});

app.get('/api/stripe/connect/status/:email', async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ success: false, error: 'stripe_not_configured' });
    const email = k(req.params?.email);
    const acctId = stripeAccountsByEmail.get(email);
    if (!acctId) return res.json({ success: true, hasAccount: false });

    const acct = await stripe.accounts.retrieve(acctId);
    res.json({
      success: true,
      hasAccount: true,
      accountId: acctId,
      payouts_enabled: acct.payouts_enabled,
      charges_enabled: acct.charges_enabled,
      requirements_due: acct.requirements?.currently_due || [],
    });
  } catch (e) {
    console.error('connect/status error', e);
    res.status(500).json({ success: false, error: 'stripe_error' });
  }
});

// Simple landing pages used for refresh/return (ok in dev)
app.get('/connect/refresh', (_req, res) => {
  res.send('Stripe onboarding: refresh/continue from the app.');
});
app.get('/connect/return', (_req, res) => {
  res.send('Stripe onboarding complete. You can return to the app.');
});

attachSubmissions(app);

// ---------- Listen ----------
app.listen(PORT, () => {
  console.log(`Ball Skill server running on http://localhost:${PORT}`);
});
