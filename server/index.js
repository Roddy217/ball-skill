import 'dotenv/config';
import express from 'express';
import { connectWebhook } from './stripe_webhooks.js';
import cors from 'cors';
import crypto from 'node:crypto';
import Stripe from 'stripe';
import attachSubmissions from './submissions.js';
import attachJoins from './joins.js';
import connectRouter from './stripeConnect.js';

const app = express();
app.post('/api/connect/webhook', ...connectWebhook);
// Stripe Connect webhook MUST be before JSON parser (needs raw body)
attachJoins(app);
app.use(cors());
app.use(express.json());

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
  const id = req.params.id;
  const email = (req.body && req.body.email) || req.query.email || '';
  if (!id || !email) {
    return res.status(400).json({ success: false, error: 'missing id/email' });
  }
  ensureEventSet(id).add(k(email));
  ensureJoinSet(email).add(String(id));
  console.log('[joins][ADD]', { id, email });
  return res.json({ success: true });
});

// Unjoin (DELETE with JSON body or query ?email=)
// and legacy aliases that some clients still call.
function unjoinHandler(req, res) {
  const id = req.params.id;
  const email = (req.body && req.body.email) || req.query.email || '';
  if (!id || !email) {
    return res.status(400).json({ success: false, error: 'missing id/email' });
  }
  ensureEventSet(id).delete(k(email));
  ensureJoinSet(email).delete(String(id));
  console.log('[joins][DEL]', { id, email });
  return res.json({ success: true });
}

app.delete('/api/events/:id/join', unjoinHandler);
app.post('/api/events/:id/unjoin', unjoinHandler);
app.post('/api/events/:id/leave', unjoinHandler);
app.post('/api/events/:id/unregister', unjoinHandler);

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
  creditsHistory.get(key).push({
    ts: Date.now(),
    delta: Number(delta),
    note: note || null,
    balanceAfter: Number(balanceAfter),
    ...(wallet ? { wallet } : {}),
  });
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
app.get('/api/credits/:email', (req, res) => {
  const email = k(decodeURIComponent(req.params.email || ''));
  const wallet = getUserCredits(email);
  return res.json({ success: true, balance: (wallet.dollars || 0) + (wallet.skill || 0) });
});

// Wallet breakdown (dollars, skill, combined)
app.get('/api/credits/:email/detail', (req, res) => {
  const email = k(decodeURIComponent(req.params.email || ''));
  const w = getUserCredits(email);
  const dollars = Number(w.dollars || 0);
  const skill = Number(w.skill || 0);
  return res.json({ success: true, dollars, skill, combined: dollars + skill });
});

// New: apply any delta with a note; logs history
app.post('/api/credits/apply', (req, res) => {
  const email = k(req.body?.email);
  const delta = Number(req.body?.delta);
  const note = req.body?.note;
  const overrideWallet = (req.body?.wallet || '').toString().toLowerCase(); // optional: 'skill' | 'dollars'
  if (!email || !Number.isFinite(delta)) {
    return res.status(400).json({ success: false, error: 'email and numeric delta required' });
  }
  const w = getUserCredits(email);

  const isSkillCreditTag = (t) => /(^|\s)(promo|bonus|demo|skill\s*wallet|signup|referral)(\s|$)/i.test(String(t || ''));
  const isSkillDebitTag  = (t) => /refund:skill|deduct:skill/i.test(String(t || ''));

  let walletKey; // 'skill' | 'dollars'
  if (overrideWallet === 'skill' || overrideWallet === 'dollars') {
    walletKey = overrideWallet;
  } else if (delta >= 0) {
    walletKey = isSkillCreditTag(note) ? 'skill' : 'dollars';
  } else {
    walletKey = isSkillDebitTag(note) ? 'skill' : 'dollars';
  }
  console.log('[credits.apply]', { email, delta, note, overrideWallet, walletKey });

  const amt = Math.abs(delta);
  if (delta >= 0) {
    w[walletKey] = (w[walletKey] || 0) + amt;
  } else {
    w[walletKey] = Math.max(0, (w[walletKey] || 0) - amt);
  }

  const combined = (w.dollars || 0) + (w.skill || 0);
  pushHistory(email, delta, note, combined, walletKey);
  return res.json({ success: true, balance: combined, wallet: walletKey, walletBalances: { dollars: w.dollars || 0, skill: w.skill || 0 } });
});

// Keep: legacy grant; also logs history with a default note
app.post('/api/credits/grant', (req, res) => {
  const { email, delta } = req.body || {};
  if (!email || !Number.isFinite(delta)) {
    return res.status(400).json({ success: false, error: 'email and numeric delta required' });
  }
  const w = getUserCredits(email);
  w.dollars = (w.dollars || 0) + Number(delta);
  const combined = (w.dollars || 0) + (w.skill || 0);
  pushHistory(email, Number(delta), 'grant', combined, 'dollars');
  return res.json({ success: true, balance: combined });
});

// History feed (newest first). Optional query: limit, q (substring match on note)
app.get('/api/credits/:email/history', (req, res) => {
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
