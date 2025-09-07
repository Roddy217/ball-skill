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
const events = []; // [{ id, name, dateISO, locationType, feeCents, drillsEnabled }]
const credits = new Map(); // email -> { balance: number }
const creditsHistory = new Map(); // email -> [{ ts, delta, note, balanceAfter }]
const registrationsByEvent = new Map(); // eventId -> Set<email>

// Stripe (optional in dev; endpoints return error if not configured)
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' }) : null;
// Map email -> Stripe Account ID (DEV-ONLY memory; we will move to Firestore later)
const stripeAccountsByEmail = new Map();

function k(email) { return (email || '').toLowerCase(); }
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
  creditsHistory.get(key).push({
    ts: Date.now(),
    delta: Number(delta),
    note: note || null,
    balanceAfter: Number(balanceAfter),
  });
}

// ---------- Health / Dev ----------
app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok' }));
app.get('/api/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get('/api/admin/ping', (_req, res) => res.json({ ok: true, admin: false, ts: Date.now() }));

// ---------- Events ----------
app.get('/api/events', (_req, res) => res.json({ success: true, events }));

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
  };
  events.push(ev);
  return res.json({ success: true, event: ev });
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
  if (wallet.balance < fee) {
    return res.status(400).json({ success: false, error: 'insufficient credits', balance: wallet.balance, required: fee });
  }

  wallet.balance -= fee;
  pushHistory(email, -fee, `join:${id}`, wallet.balance);
  regSet.add(email);

  return res.json({ success: true, joined: true, already: false, fee, balance: wallet.balance, eventId: id });
});

// ---------- Credits ----------
app.get('/api/credits/:email', (req, res) => {
  const email = k(decodeURIComponent(req.params.email || ''));
  const wallet = getUserCredits(email);
  return res.json({ success: true, balance: wallet.balance });
});

// New: apply any delta with a note; logs history
app.post('/api/credits/apply', (req, res) => {
  const email = k(req.body?.email);
  const delta = Number(req.body?.delta);
  const note = req.body?.note;
  if (!email || !Number.isFinite(delta)) {
    return res.status(400).json({ success: false, error: 'email and numeric delta required' });
  }
  const wallet = getUserCredits(email);
  wallet.balance += delta;
  pushHistory(email, delta, note, wallet.balance);
  return res.json({ success: true, balance: wallet.balance });
});

// Keep: legacy grant; also logs history with a default note
app.post('/api/credits/grant', (req, res) => {
  const { email, delta } = req.body || {};
  if (!email || !Number.isFinite(delta)) {
    return res.status(400).json({ success: false, error: 'email and numeric delta required' });
  }
  const wallet = getUserCredits(email);
  wallet.balance += Number(delta);
  pushHistory(email, Number(delta), 'grant', wallet.balance);
  return res.json({ success: true, balance: wallet.balance });
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

    const refresh_url = req.body?.refreshUrl || 'https://dashboard.stripe.com/settings';
    const return_url  = req.body?.returnUrl  || 'https://dashboard.stripe.com/';
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

// ---------- Listen ----------
app.listen(PORT, () => {
  console.log(`Ball Skill server running on http://localhost:${PORT}`);
});
