import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import Stripe from 'stripe';

const app = express();
app.use(cors());
app.use(express.json());

const { PORT = 3001, STRIPE_SECRET_KEY = '' } = process.env;

// ---- In-memory stores ----
const events = []; // [{ id, name, dateISO, locationType, feeCents, drillsEnabled, capacity, prizePoolCents, potentialPayoutCents }]
const credits = new Map(); // email -> { balance: number }
const creditsHistory = new Map(); // email -> [{ ts, delta, note, balanceAfter }]
const registrationsByEvent = new Map(); // eventId -> Set<email>
const userRegistrations = new Map(); // email -> [{ eventId, ts }]
const profiles = new Map(); // email -> { email, displayName, avatarUrl, verified, team, position, league, jersey, rank, rankDelta, type, skillPercents }
const eventPlayerTypeCounts = new Map(); // eventId -> { [type]: count }

// Stripe (optional in dev)
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' }) : null;
const stripeAccountsByEmail = new Map();

const k = (email) => (email || '').toLowerCase();
function getUserCredits(email) {
  const key = k(email);
  if (!credits.has(key)) credits.set(key, { balance: 0 });
  return credits.get(key);
}
function ensureEventSet(eventId) {
  if (!registrationsByEvent.has(eventId)) registrationsByEvent.set(eventId, new Set());
  return registrationsByEvent.get(eventId);
}
function pushHistory(email, delta, note, balanceAfter) {
  const key = k(email);
  if (!creditsHistory.has(key)) creditsHistory.set(key, []);
  creditsHistory.get(key).push({ ts: Date.now(), delta: Number(delta), note: note || null, balanceAfter: Number(balanceAfter) });
}
function addUserRegistration(email, eventId) {
  const key = k(email);
  if (!userRegistrations.has(key)) userRegistrations.set(key, []);
  const arr = userRegistrations.get(key);
  if (!arr.find(r => r.eventId === eventId)) {
    arr.push({ eventId, ts: Date.now() });
  }
}
function touchTypeCount(eventId, typeKey) {
  if (!eventPlayerTypeCounts.has(eventId)) eventPlayerTypeCounts.set(eventId, {});
  const bag = eventPlayerTypeCounts.get(eventId);
  const t = (typeKey || 'adult').toLowerCase();
  bag[t] = (bag[t] || 0) + 1;
}
function typeMixFromCounts(counts) {
  const out = {};
  const vals = Object.values(counts || {});
  const total = vals.reduce((s, n) => s + n, 0);
  if (!total) return out;
  for (const [key, n] of Object.entries(counts)) out[key] = n / total;
  return out;
}

// ---------- Health / Dev ----------
app.get('/api/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Seed demo events (clear + seed richer)
app.post('/api/dev/seed-events', (_req, res) => {
  events.splice(0, events.length);
  registrationsByEvent.clear();
  userRegistrations.clear();
  eventPlayerTypeCounts.clear();

  const now = Date.now(), day = 24 * 60 * 60 * 1000;
  const newEvent = (o) => {
    const id = crypto.randomBytes(6).toString('hex');
    return {
      id,
      name: o.name,
      dateISO: new Date(now + o.offsetDays * day).toISOString(),
      locationType: o.locationType,
      feeCents: Number(o.feeCents)||0,
      drillsEnabled: o.drillsEnabled || [],
      capacity: Number(o.capacity)||10,
      prizePoolCents: Number(o.prizePoolCents)||0,
      potentialPayoutCents: Number(o.potentialPayoutCents)||0,
    };
  };

  const demo = [
    newEvent({ name: '3-Point Shootout – East', offsetDays: 2, feeCents: 1500, locationType: 'in_person', drillsEnabled: ['3PT'], capacity: 12, prizePoolCents: 75000, potentialPayoutCents: 25000 }),
    newEvent({ name: 'Free Throw Frenzy', offsetDays: 4, feeCents: 500, locationType: 'in_person', drillsEnabled: ['FT'], capacity: 20, prizePoolCents: 20000, potentialPayoutCents: 5000 }),
    newEvent({ name: 'Handle & Finish (Online)', offsetDays: 1, feeCents: 900, locationType: 'online', drillsEnabled: ['DRIBBLE','LAYUP'], capacity: 15, prizePoolCents: 30000, potentialPayoutCents: 10000 }),
    newEvent({ name: 'Speed Ladder Combine', offsetDays: 7, feeCents: 1200, locationType: 'in_person', drillsEnabled: ['AGILITY'], capacity: 10, prizePoolCents: 40000, potentialPayoutCents: 12000 }),
    newEvent({ name: 'Holiday Skills Jam (Online)', offsetDays: 12, feeCents: 0, locationType: 'online', drillsEnabled: ['DRIBBLE','SHOOT'], capacity: 30, prizePoolCents: 0, potentialPayoutCents: 0 }),
  ];

  for (const e of demo) events.push(e);
  return res.json({ success: true, count: events.length, events });
});

// ---------- Profiles ----------
app.get('/api/profile/:email', (req, res) => {
  const email = k(decodeURIComponent(req.params.email||''));
  const prof = profiles.get(email) || null;
  return res.json({ success: true, profile: prof });
});

app.put('/api/profile', (req, res) => {
  const body = req.body || {};
  const email = k(body.email);
  if (!email) return res.status(400).json({ success: false, error: 'email required' });

  const prev = profiles.get(email) || {};
  const merged = {
    email,
    displayName: body.displayName ?? prev.displayName ?? email,
    avatarUrl: body.avatarUrl ?? prev.avatarUrl ?? '',
    verified: !!(body.verified ?? prev.verified ?? false),
    team: body.team ?? prev.team ?? '',
    position: body.position ?? prev.position ?? '',
    league: body.league ?? prev.league ?? '',
    jersey: body.jersey ?? prev.jersey ?? '',
    rank: Number(body.rank ?? prev.rank ?? 1000),
    rankDelta: Number(body.rankDelta ?? prev.rankDelta ?? 0),
    type: (body.type ?? prev.type ?? 'adult').toLowerCase(),
    skillPercents: body.skillPercents ?? prev.skillPercents ?? {},
  };
  profiles.set(email, merged);
  return res.json({ success: true, profile: merged });
});

// Simple search by email or displayName
app.get('/api/profile/search', (req, res) => {
  const q = (req.query?.q || '').toString().toLowerCase().trim();
  if (!q) {
    const bag = new Set();
    for (const email of profiles.keys()) bag.add(email);
    for (const email of credits.keys()) bag.add(email);
    for (const email of userRegistrations.keys()) bag.add(email);
    const list = Array.from(bag).slice(0, 20).map(e => ({ email: e, displayName: profiles.get(e)?.displayName || e }));
    return res.json({ success: true, results: list });
  }
  const results = [];
  for (const [email, prof] of profiles.entries()) {
    const dn = (prof?.displayName || '').toLowerCase();
    if (email.includes(q) || dn.includes(q)) results.push({ email, displayName: prof.displayName || email });
    if (results.length >= 20) break;
  }
  if (results.length < 20) {
    for (const email of credits.keys()) {
      if (results.find(r => r.email === email)) continue;
      if (email.includes(q)) results.push({ email, displayName: profiles.get(email)?.displayName || email });
      if (results.length >= 20) break;
    }
  }
  return res.json({ success: true, results });
});

// Admin/dev: seed sample profiles + grant credits
app.post('/api/dev/seed-profiles', (req, res) => {
  const samples = [
    { email: 'youth1@ballskill.app',  displayName: 'Youth One',  type: 'youth',  team: 'Rockets', position: 'G', league: 'AAU', jersey: '1', rank: 980,  rankDelta: +5 },
    { email: 'teens1@ballskill.app',  displayName: 'Teens Ace',  type: 'teens',  team: 'Falcons', position: 'F', league: 'HS',  jersey: '12', rank: 1020, rankDelta: +2 },
    { email: 'adult1@ballskill.app',  displayName: 'Adult Pro',  type: 'adult',  team: 'City',    position: 'C', league: 'Rec', jersey: '33', rank: 1100, rankDelta: -3 },
    { email: 'elite1@ballskill.app',  displayName: 'Elite Fox',  type: 'elite',  team: 'Legends', position: 'G', league: 'Open', jersey: '7', rank: 1250, rankDelta: +10 },
    { email: 'pro1@ballskill.app',    displayName: 'Pro Star',   type: 'pro',    team: 'Kings',   position: 'F', league: 'D1',  jersey: '22', rank: 1400, rankDelta: +1 },
  ];
  for (const s of samples) {
    const key = k(s.email);
    const prev = profiles.get(key) || {};
    profiles.set(key, {
      email: key,
      displayName: s.displayName,
      avatarUrl: '',
      verified: true,
      team: s.team,
      position: s.position,
      league: s.league,
      jersey: s.jersey,
      rank: s.rank,
      rankDelta: s.rankDelta,
      type: s.type,
      skillPercents: prev.skillPercents || {},
    });
    const wallet = getUserCredits(key);
    wallet.balance += 100; // grant 100 credits each
    pushHistory(key, +100, 'admin_seed', wallet.balance);
  }
  return res.json({ success: true, count: samples.length });
});

// ---------- Events ----------
app.get('/api/events', (_req, res) => {
  const rows = events.map(e => {
    const set = registrationsByEvent.get(e.id);
    const joinedCount = set ? set.size : 0;
    const counts = eventPlayerTypeCounts.get(e.id) || {};
    const mix = typeMixFromCounts(counts);
    return { ...e, joinedCount, playerTypeMix: mix };
  });
  res.json({ success: true, events: rows });
});

app.post('/api/events', (req, res) => {
  const {
    name, feeCents = 0, locationType = 'online', drillsEnabled = [],
    dateISO, capacity = 10, prizePoolCents = 0, potentialPayoutCents = 0
  } = req.body || {};
  if (!name) return res.status(400).json({ success: false, error: 'name required' });
  const id = crypto.randomBytes(6).toString('hex');
  const ev = {
    id,
    name,
    dateISO: dateISO || new Date().toISOString(),
    locationType,
    feeCents: Number(feeCents) || 0,
    drillsEnabled: Array.isArray(drillsEnabled) ? drillsEnabled : [],
    capacity: Number(capacity) || 10,
    prizePoolCents: Number(prizePoolCents) || 0,
    potentialPayoutCents: Number(potentialPayoutCents) || 0,
  };
  events.push(ev);
  return res.json({ success: true, event: ev });
});

// Registration status
app.get('/api/events/:id/registration/:email', (req, res) => {
  const { id, email } = req.params;
  const set = registrationsByEvent.get(id);
  const joined = !!(set && set.has(k(email)));
  res.json({ joined });
});

// Join via demo credits (idempotent) — evolves playerTypeMix from user profile
app.post('/api/events/:id/joinDemo', (req, res) => {
  const { id } = req.params;
  const email = k(req.body?.email);
  const fee = Number(req.body?.fee ?? 10);
  if (!email) return res.status(400).json({ success: false, error: 'email required' });
  if (!Number.isFinite(fee) || fee < 0) return res.status(400).json({ success: false, error: 'invalid_fee' });

  const regSet = ensureEventSet(id);
  if (regSet.has(email)) return res.json({ success: true, joined: true, already: true });

  const ev = events.find(e => e.id === id);
  const cap = ev?.capacity ?? 9999;
  if (regSet.size >= cap) return res.status(400).json({ success: false, error: 'event_full' });

  const wallet = getUserCredits(email);
  if (wallet.balance < fee) return res.status(400).json({ success: false, error: 'insufficient_credits', balance: wallet.balance, required: fee });

  wallet.balance -= fee;
  pushHistory(email, -fee, `join:${id}`, wallet.balance);
  regSet.add(email);
  addUserRegistration(email, id);

  // evolve type mix
  const prof = profiles.get(email) || { type: 'adult' };
  touchTypeCount(id, prof.type);

  const counts = eventPlayerTypeCounts.get(id) || {};
  const mix = typeMixFromCounts(counts);

  return res.json({ success: true, joined: true, already: false, fee, balance: wallet.balance, eventId: id, playerTypeMix: mix });
});

// Per-user registrations (merged with event details)
app.get('/api/user/:email/registrations', (req, res) => {
  const email = k(decodeURIComponent(req.params.email || ''));
  const regs = userRegistrations.get(email) || [];
  const byId = new Map(events.map(e => [e.id, e]));
  const merged = regs.map(r => ({ ...r, event: byId.get(r.eventId) || null })).filter(r => !!r.event);
  res.json({ success: true, registrations: merged });
});

// ---------- Credits ----------
app.get('/api/credits/:email', (req, res) => {
  const email = k(decodeURIComponent(req.params.email || ''));
  const wallet = getUserCredits(email);
  return res.json({ success: true, balance: wallet.balance });
});

app.post('/api/credits/apply', (req, res) => {
  const email = k(req.body?.email);
  const delta = Number(req.body?.delta);
  const note = req.body?.note;
  if (!email || !Number.isFinite(delta)) return res.status(400).json({ success: false, error: 'email and numeric delta required' });
  const wallet = getUserCredits(email);
  wallet.balance += delta;
  pushHistory(email, delta, note, wallet.balance);
  return res.json({ success: true, balance: wallet.balance });
});

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
const stripeOk = !!STRIPE_SECRET_KEY;
app.post('/api/stripe/connect/onboard', async (req, res) => {
  try {
    if (!stripeOk) return res.status(500).json({ success: false, error: 'stripe_not_configured' });
    const email = k(req.body?.email);
    if (!email) return res.status(400).json({ success: false, error: 'email required' });

    let acctId = stripeAccountsByEmail.get(email);
    if (!acctId) {
      const acct = await stripe.accounts.create({ type: 'express', email, capabilities: { transfers: { requested: true } }, business_type: 'individual' });
      acctId = acct.id;
      stripeAccountsByEmail.set(email, acctId);
    }

    const refresh_url = req.body?.refreshUrl || 'https://dashboard.stripe.com/settings';
    const return_url  = req.body?.returnUrl  || 'https://dashboard.stripe.com/';
    const link = await stripe.accountLinks.create({ account: acctId, refresh_url, return_url, type: 'account_onboarding' });

    res.json({ success: true, accountId: acctId, url: link.url });
  } catch (e) {
    console.error('connect/onboard error', e);
    res.status(500).json({ success: false, error: 'stripe_error' });
  }
});

app.get('/api/stripe/connect/status/:email', async (req, res) => {
  try {
    if (!stripeOk) return res.status(500).json({ success: false, error: 'stripe_not_configured' });
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

app.listen(PORT, () => {
  console.log(`Ball Skill server running on http://localhost:${PORT}`);
});
