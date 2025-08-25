import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import crypto from 'node:crypto';

const app = express();
app.use(cors());
app.use(express.json());

// ---- Stripe setup (kept from earlier) ----
const { STRIPE_SECRET_KEY, PORT = 3001 } = process.env;
if (!STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY in .env");
  process.exit(1);
}
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

// ---- In-memory data store (reset on server restart) ----
/**
 * events: { id, name, dateISO, locationType, feeCents, drillsEnabled: string[] }
 * registrations: Map<eventId, Map<uid/email, { firstFreeUsed:boolean, paid:boolean, creditsUsed:number }>>
 * submissions: Map<eventId, Map<uid/email, Map<drillType, {made:number, attempts:number, timeMs:number, verifiedBy?:string, createdAt:number}>>>
 * credits: Map<email, { balance:number }>
 */
const events = new Map();
const registrations = new Map();
const submissions = new Map();
const credits = new Map();

function id() { return crypto.randomBytes(6).toString('hex'); }

function getEventRegs(eventId) {
  if (!registrations.has(eventId)) registrations.set(eventId, new Map());
  return registrations.get(eventId);
}
function getEventSubs(eventId) {
  if (!submissions.has(eventId)) submissions.set(eventId, new Map());
  return submissions.get(eventId);
}
function getUserCredits(email) {
  if (!credits.has(email)) credits.set(email, { balance: 0 });
  return credits.get(email);
}

// ---- Health ----
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---- Stripe PaymentIntent (kept) ----
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', description } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'amount (in cents) is required and must be > 0' });
    }
    const pi = await stripe.paymentIntents.create({
      amount,
      currency,
      description,
      automatic_payment_methods: { enabled: true },
    });
    res.json({ success: true, clientSecret: pi.client_secret });
  } catch (err) {
    console.error('create-payment-intent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Events ----
app.post('/api/events', (req, res) => {
  try {
    const { name, dateISO, locationType = 'in_person', feeCents = 0, drillsEnabled = ['3PT','FT','2PT','LAYUP'] } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const eventId = id();
    const event = { id: eventId, name, dateISO: dateISO || new Date().toISOString(), locationType, feeCents, drillsEnabled };
    events.set(eventId, event);
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events', (_req, res) => {
  res.json({ success: true, events: Array.from(events.values()).sort((a,b) => (a.dateISO > b.dateISO ? -1 : 1)) });
});

// ---- Registration ----
app.post('/api/events/:eventId/register', (req, res) => {
  try {
    const { eventId } = req.params;
    const event = events.get(eventId);
    if (!event) return res.status(404).json({ error: 'event not found' });

    const { email, firstQualifierFree = true } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const regs = getEventRegs(eventId);
    const existing = regs.get(email) || { firstFreeUsed: false, paid: false, creditsUsed: 0 };

    // apply "first qualifier free" only once per event for demo
    if (firstQualifierFree && !existing.firstFreeUsed && event.feeCents === 0) {
      existing.firstFreeUsed = true;
    }
    regs.set(email, existing);
    res.json({ success: true, registration: existing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Submissions (drill results) ----
app.post('/api/events/:eventId/submit', (req, res) => {
  try {
    const { eventId } = req.params;
    const event = events.get(eventId);
    if (!event) return res.status(404).json({ error: 'event not found' });

    const { email, drillType, made, attempts = 10, timeMs, verifiedBy } = req.body;
    if (!email || !drillType) return res.status(400).json({ error: 'email and drillType are required' });
    if (typeof made !== 'number' || made < 0 || made > attempts) return res.status(400).json({ error: 'invalid made/attempts' });

    const subsForEvent = getEventSubs(eventId);
    if (!subsForEvent.has(email)) subsForEvent.set(email, new Map());
    const byDrill = subsForEvent.get(email);

    byDrill.set(drillType, {
      made,
      attempts,
      timeMs: Number.isFinite(timeMs) ? timeMs : null,
      verifiedBy,
      createdAt: Date.now(),
    });

    res.json({ success: true, submission: Object.fromEntries(byDrill.entries()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Leaderboard ----
// Sort by total made across drills in that event; tie-break = lowest total timeMs
app.get('/api/events/:eventId/leaderboard', (req, res) => {
  try {
    const { eventId } = req.params;
    const event = events.get(eventId);
    if (!event) return res.status(404).json({ error: 'event not found' });

    const subsForEvent = getEventSubs(eventId); // Map<email, Map<drill, result>>
    const rows = [];

    for (const [email, drillMap] of subsForEvent.entries()) {
      let totalMade = 0;
      let totalTime = 0;
      for (const [, r] of drillMap.entries()) {
        totalMade += r.made || 0;
        if (Number.isFinite(r.timeMs)) totalTime += r.timeMs;
      }
      rows.push({ email, totalMade, totalTime });
    }

    rows.sort((a, b) => {
      if (b.totalMade !== a.totalMade) return b.totalMade - a.totalMade;
      return a.totalTime - b.totalTime; // lower time wins tie
    });

    res.json({ success: true, leaderboard: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Credits (demo grant) ----
app.post('/api/credits/grant', (req, res) => {
  try {
    const { email, delta } = req.body;
    if (!email || !Number.isFinite(delta)) return res.status(400).json({ error: 'email and numeric delta required' });
    const wallet = getUserCredits(email);
    wallet.balance += delta;
    res.json({ success: true, balance: wallet.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Ball Skill server running on http://localhost:${PORT}`);
});
