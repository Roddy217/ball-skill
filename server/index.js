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

// ---------------- Centralized Transaction Log (v2) ----------------
// Tx: { id, ts, email, delta, wallet, note, balanceAfter, walletBalanceAfter, actor?, meta? }
const txLog = []; // append-only, newest last

function makeId() {
  return Math.random().toString(16).slice(2, 10) + '-' + Date.now();
}

/**
 * pushTx: append a finalized transaction entry to txLog and return it.
 * @param {Object} p
 * @param {string} p.email
 * @param {number} p.delta           // signed cents
 * @param {'skill'|'dollars'} p.wallet
 * @param {string=} p.note
 * @param {string=} p.actor          // admin/system email
 * @param {Object=} p.meta           // e.g. { eventId, reversalOf }
 * @param {number} p.balanceAfter    // combined balance after
 * @param {number} p.walletBalanceAfter // per-wallet balance after
 */
function pushTx(p) {
  const tx = {
    id: makeId(),
    ts: Date.now(),
    email: String(p.email || '').toLowerCase(),
    delta: Number(p.delta || 0),
    wallet: p.wallet === 'skill' ? 'skill' : 'dollars',
    note: p.note || null,
    balanceAfter: Number(p.balanceAfter || 0),
    walletBalanceAfter: Number(p.walletBalanceAfter || 0),
    actor: p.actor || null,
    meta: p.meta || null,
  };
  txLog.push(tx);
  return tx;
}
// ------------------------------------------------------------------

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

    // log transaction for join (debit)
    try {
      const userWallet = getOrInitWallet(email);
      pushTx({
        email,
        delta: -feeCents,
        wallet,
        note: `Event Entry: ${ev?.name || id}`,
        balanceAfter: (getWallets(email).skill + getWallets(email).dollars),
        walletBalanceAfter: getWallets(email)[wallet],
        actor: null,
        meta: {
          type: 'join',
          eventId: id,
          eventName: ev?.name || null,
          feeCents,
          usedWallet: wallet,
        }
      });
    } catch {}

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

    // log transaction for unjoin (credit)
    try {
      const userWallet = getOrInitWallet(email);
      pushTx({
        email,
        delta: feeCents,
        wallet: usedWallet,
        note: `Refund (Event): ${ev?.name || id}`,
        balanceAfter: (getWallets(email).skill + getWallets(email).dollars),
        walletBalanceAfter: getWallets(email)[usedWallet],
        actor: null,
        meta: {
          type: 'unjoin',
          eventId: id,
          eventName: ev?.name || null,
          feeCents,
          usedWallet,
        }
      });
    } catch {}

    return res.json({ success: true, event: { id: ev.id, registered: ev.registered, feeCents }, wallets, usedWallet });
  } catch (e) {
    console.error('[events.unjoin] fatal', e);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
});

// Submit drill results for a user and event
app.post('/api/events/:eventId/drillResults', async (req, res) => {
  const { eventId } = req.params;
  const { userEmail, drillResults } = req.body;  // e.g., { '3PT': 12, 'FT': 15 }

  if (!userEmail || !drillResults) {
    return res.status(400).json({ success: false, message: 'Missing userEmail or drillResults.' });
  }

  try {
    // Verify if the event exists
    const event = await getEventById(eventId);  // Implement getEventById function
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    // Verify if the user joined the event
    const joined = await isUserJoined(eventId, userEmail);  // Implement isUserJoined
    if (!joined) return res.status(400).json({ success: false, message: 'User not joined to this event.' });

    // Save drill results (implement logic to store them)
    const result = await saveDrillResults(userEmail, eventId, drillResults);  // Implement saveDrillResults
    res.status(200).json({ success: true, result });
  } catch (err) {
    console.error('[Drill Results Error]', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get event by ID
async function getEventById(eventId) {
  // Look up the event by eventId, return null if not found
  const event = events.find(e => e.id === eventId);  // Example of an event list lookup
  return event || null;
}

// Check if a user has joined the event
async function isUserJoined(eventId, userEmail) {
  const event = await getEventById(eventId);
  return event?.registrants?.[userEmail] || false;
}

// Save drill results (implement storage logic)
async function saveDrillResults(userEmail, eventId, drillResults) {
  // You may store results in a database or in-memory; here's an example:
  const event = await getEventById(eventId);
  if (!event) throw new Error('Event not found');
  
  // If drillResults is valid, save them:
  event.drillResults = event.drillResults || {};
  event.drillResults[userEmail] = drillResults;

  // Return saved drill results for the user
  return event.drillResults[userEmail];
}

const { PORT = 3001, STRIPE_SECRET_KEY = '' } = process.env;

// ---- In-memory stores ----
const events = []; // [{ id, name, dateISO, locationType, feeCents, drillsEnabled }]

// --- Events: helpers for parsing/normalizing (Step 6) ---
function toBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'on';
}
function parsePrizes(input) {
  // accepts array of cents or comma string like "50000,20000,10000"
  if (Array.isArray(input)) {
    return input
      .map(n => Number(n))
      .filter(n => Number.isFinite(n) && n >= 0);
  }
  const s = String(input || '').trim();
  if (!s) return [];
  return s.split(',')
    .map(x => Number(x.trim()))
    .filter(n => Number.isFinite(n) && n >= 0);
}
function parseGuests(input) {
  if (Array.isArray(input)) return input.map(x => String(x || '').trim()).filter(Boolean);
  const s = String(input || '').trim();
  if (!s) return [];
  return s.split(',').map(x => x.trim()).filter(Boolean);
}
function safeDateIso(v) {
  // allow caller to pass ISO or ms; fallback to dateISO if missing
  if (!v && v !== 0) return null;
  const n = Number(v);
  if (Number.isFinite(n)) return new Date(n).toISOString();
  try { return new Date(v).toISOString(); } catch { return null; }
}

// Stripe (optional in dev; endpoints return error if not configured)
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' }) : null;
// Map email -> Stripe Account ID (DEV-ONLY memory; we will move to Firestore later)
const stripeAccountsByEmail = new Map();

function k(email) { return (email || '').toLowerCase(); }

// ---------- Health / Dev ----------
app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok' }));
app.get('/api/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get('/api/admin/ping', (_req, res) => res.json({ ok: true, admin: false, ts: Date.now() }));

// ---------- Events ----------
// List all events (with participantCounts, computed registered, and Step 6 sorting/filter)
app.get('/api/events', (req, res) => {
  // query params:
  //   featured=1           → only featured events
  //   sort=pinned,startsAt → pinned first (desc), then startsAt ascending
  //   sort=startsAt        → startsAt ascending only
  //   (default → no special sort)
  const onlyFeatured = toBool(req.query.featured);
  const sortParam = String(req.query.sort || '').trim().toLowerCase();
  const sortKeys = sortParam ? sortParam.split(',').map(s => s.trim()) : [];

  // project & compute registered
  let list = (events || []).map(ev => {
    const counts = ev.participantCounts || { teen: 0, adult: 0, pro: 0, celebrity: 0 };
    const registered = counts.teen + counts.adult + counts.pro + counts.celebrity;

    // ensure defaults surfaced for new fields
    const startsAt = ev.startsAt || ev.dateISO || new Date().toISOString();
    const prizes = Array.isArray(ev.prizes) ? ev.prizes : [];
    const featured = !!ev.featured;
    const pinned = !!ev.pinned;
    const celebrityGuests = Array.isArray(ev.celebrityGuests) ? ev.celebrityGuests : [];

    return { ...ev, registered, startsAt, prizes, featured, pinned, celebrityGuests };
  });

  if (onlyFeatured) {
    list = list.filter(e => !!e.featured);
  }

  // sorting
  if (sortKeys.length) {
    list.sort((a, b) => {
      for (const key of sortKeys) {
        if (key === 'pinned') {
          // pinned first (true before false)
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        } else if (key === 'startsat' || key === 'starts_at' || key === 'startsat') {
          const ta = Number(new Date(a.startsAt).getTime());
          const tb = Number(new Date(b.startsAt).getTime());
          if (ta !== tb) return ta - tb; // earlier first
        }
      }
      return 0;
    });
  }

  return res.json({ success: true, events: list });
});

app.post('/api/events', (req, res) => {
  const {
    name,
    feeCents = 0,
    locationType = 'online',
    drillsEnabled = [],
    totalSpots = 100,

    // NEW fields
    startsAt,             // ISO or ms
    prizes,               // array of cents OR comma string ("50000,20000,10000")
    featured,             // boolean-like
    pinned,               // boolean-like
    celebrityGuests,      // array of strings OR comma string
  } = req.body || {};

  if (!name) return res.status(400).json({ success: false, error: 'name required' });

  const id = crypto.randomBytes(6).toString('hex');

  // normalize inputs
  const fee = Number(feeCents) || 0;
  const drills = Array.isArray(drillsEnabled) ? drillsEnabled : [];
  const tsIso = safeDateIso(startsAt) || new Date().toISOString();
  const prizeList = parsePrizes(prizes);
  const guests = parseGuests(celebrityGuests);
  const isFeatured = toBool(featured);
  const isPinned = toBool(pinned);
  const spots = Number(totalSpots) || 100;

  const ev = {
    id,
    name,
    dateISO: new Date().toISOString(),
    locationType,
    feeCents: fee,
    drillsEnabled: drills,
    totalSpots: spots,
    participantCounts: { teen: 0, adult: 0, pro: 0, celebrity: 0 },

    // NEW fields surfaced on the model
    startsAt: tsIso,          // ISO string
    prizes: prizeList,        // number[] (cents)
    featured: isFeatured,     // boolean
    pinned: isPinned,         // boolean
    celebrityGuests: guests,  // string[]
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
  const em = k(email);
  const ev = events.find(e => e.id === id);
  let joined = false;
  if (ev && ev.registrants && typeof ev.registrants === 'object') {
    joined = !!ev.registrants[em];
  }
  res.json({ joined });
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
    try {
      const w = getOrInitWallet(email);
      pushTx({
        email,
        delta: Number(amount || 0),
        wallet: 'skill',
        note: note || 'skill:add',
        balanceAfter: (w.dollars || 0) + (w.skill || 0),
        walletBalanceAfter: w.skill || 0,
        actor: null,
      });
    } catch {}
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
    try {
      const w = getOrInitWallet(email);
      pushTx({
        email,
        delta: -Number(amount || 0),
        wallet: 'skill',
        note: note || 'skill:deduct',
        balanceAfter: (w.dollars || 0) + (w.skill || 0),
        walletBalanceAfter: w.skill || 0,
        actor: null,
      });
    } catch {}
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
    try {
      const w = getOrInitWallet(email);
      pushTx({
        email,
        delta: Number(amount || 0),
        wallet: 'dollars',
        note: note || 'dollars:add',
        balanceAfter: (w.dollars || 0) + (w.skill || 0),
        walletBalanceAfter: w.dollars || 0,
        actor: null,
      });
    } catch {}
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
    try {
      const w = getOrInitWallet(email);
      pushTx({
        email,
        delta: -Number(amount || 0),
        wallet: 'dollars',
        note: note || 'dollars:deduct',
        balanceAfter: (w.dollars || 0) + (w.skill || 0),
        walletBalanceAfter: w.dollars || 0,
        actor: null,
      });
    } catch {}
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

// ---------------- Transactions API ----------------
// Admin/system feed
app.get('/api/transactions', (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const wallet = String(req.query.wallet || '').toLowerCase(); // 'skill' | 'dollars' | ''
    const q = String(req.query.q || '').toLowerCase();
    const sort = (req.query.sort || 'desc') === 'asc' ? 'asc' : 'desc';
    const since = Number(req.query.since || 0);           // unix ms
    const until = Number(req.query.until || Date.now());  // unix ms

    console.log('[tx:list]', req.path, { wallet, q, since, until, limit, offset, sort });

    let list = txLog.slice();

    if (wallet === 'skill' || wallet === 'dollars') {
      list = list.filter(t => String(t.wallet || '').toLowerCase() === wallet);
    }

    if (q) {
      list = list.filter(t => {
        const note = String(t.note || '').toLowerCase();
        const email = String(t.email || '').toLowerCase();
        const id = String(t.id || '').toLowerCase();
        return note.includes(q) || email.includes(q) || id.includes(q);
      });
    }

    // date window (inclusive since, exclusive until)
    if (since || until) {
      list = list.filter(t => {
        const ts = Number(t.ts || 0);
        return ts >= (since || 0) && ts < (until || Number.MAX_SAFE_INTEGER);
      });
    }

    list.sort((a, b) => sort === 'asc' ? (a.ts - b.ts) : (b.ts - a.ts));

    const total = list.length;
    const items = list.slice(offset, offset + limit);
    res.json({ success: true, total, items });
  } catch (e) {
    console.error('[tx:list] error', e);
    res.status(500).json({ success: false, error: 'server_error' });
  }
});

// User-safe feed
app.get('/api/transactions/:email', (req, res) => {
  try {
    const email = String((req.params.email || '').toLowerCase());
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const wallet = String(req.query.wallet || '').toLowerCase();
    const q = String(req.query.q || '').toLowerCase();
    const sort = (req.query.sort || 'desc') === 'asc' ? 'asc' : 'desc';
    const since = Number(req.query.since || 0);
    const until = Number(req.query.until || Date.now());

    console.log('[tx:user]', req.path, { email, wallet, q, since, until, limit, offset, sort });

    let list = txLog.filter(t => String(t.email || '').toLowerCase() === email);

    if (wallet === 'skill' || wallet === 'dollars') {
      list = list.filter(t => String(t.wallet || '').toLowerCase() === wallet);
    }

    if (q) {
      list = list.filter(t => {
        const note = String(t.note || '').toLowerCase();
        const id = String(t.id || '').toLowerCase();
        return note.includes(q) || id.includes(q);
      });
    }

    if (since || until) {
      list = list.filter(t => {
        const ts = Number(t.ts || 0);
        return ts >= (since || 0) && ts < (until || Number.MAX_SAFE_INTEGER);
      });
    }

    list.sort((a, b) => sort === 'asc' ? (a.ts - b.ts) : (b.ts - a.ts));

    const total = list.length;
    const items = list.slice(offset, offset + limit);
    res.json({ success: true, total, items });
  } catch (e) {
    console.error('[tx:user] error', e);
    res.status(500).json({ success: false, error: 'server_error' });
  }
});

// Admin reversal
app.post('/api/transactions/:id/reverse', (req, res) => {
  try {
    const { id } = req.params;
    const { actor, note } = req.body || {};
    const original = txLog.find(t => t.id === id);
    if (!original) return res.status(404).json({ success: false, error: 'tx_not_found' });
    if (original.meta && original.meta.reversedBy) {
      return res.status(400).json({ success: false, error: 'already_reversed' });
    }

    const email = original.email;
    const wallet = original.wallet;
    const delta = -original.delta; // invert

    const w = getOrInitWallet(email);
    if (wallet === 'skill') w.skill += delta; else w.dollars += delta;
    const combined = (w.dollars || 0) + (w.skill || 0);
    const after = wallet === 'skill' ? (w.skill || 0) : (w.dollars || 0);

    const reversal = pushTx({
      email,
      delta,
      wallet,
      note: note || `reversal_of:${id}`,
      balanceAfter: combined,
      walletBalanceAfter: after,
      actor: actor || null,
      meta: { reversalOf: id },
    });
    original.meta = { ...(original.meta || {}), reversedBy: reversal.id };

    return res.json({ success: true, tx: reversal, wallets: { dollars: w.dollars || 0, skill: w.skill || 0 } });
  } catch (e) {
    console.error('[tx][reverse] error', e);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
});
// --------------------------------------------------
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
