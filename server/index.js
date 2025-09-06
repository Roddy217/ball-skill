import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import crypto from 'node:crypto';

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  console.log('[HIT]', req.method, req.path);
  next();
});

// ---- Stripe (optional, not used in these endpoints directly) ----
const { STRIPE_SECRET_KEY, PORT = 3001 } = process.env;
if (!STRIPE_SECRET_KEY) {
  console.warn("Warning: STRIPE_SECRET_KEY not set. Stripe routes will be limited.");
}
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' }) : null;

// ---- In-memory store ----
// IMPORTANT: events is an ARRAY so Array.find works.
const events = []; // [{ id, name, dateISO, locationType, feeCents, drillsEnabled }]
// registrations: Map<eventId, Map<email, { firstFreeUsed:boolean, paid:boolean, creditsUsed:number }>>
const registrations = new Map();
// submissions: Map<eventId, Map<email, Map<drillType, { made, attempts, timeMs, verifiedBy?, createdAt }>>>
const submissions = new Map();
// credits: Map<email, { balance:number }>
const credits = new Map();

function getUserCredits(email) {
  if (!credits.has(email)) credits.set(email, { balance: 0 });
  return credits.get(email);
}

// Track credit history in-memory for demo
// credits: Map<email, { balance:number }>
// Add another map:
const creditsHistory = new Map(); // email -> [{delta, reason, at}]
function pushCreditHistory(email, delta, reason = 'manual') {
  if (!creditsHistory.has(email)) creditsHistory.set(email, []);
  creditsHistory.get(email).push({ delta, reason, at: Date.now() });
}

app.get('/api/health', (_req, res) => {
  res.json({ success: true, status: 'ok' });
});

// ---- Events ----
app.get('/api/events', (_req, res) => {
  res.json({ success: true, events });
});

app.post('/api/events', (req, res) => {
  try {
    const { name, feeCents = 0, drillsEnabled = [], locationType = 'in_person', dateISO = new Date().toISOString() } = req.body || {};
    if (!name) return res.status(400).json({ success:false, error:'name required' });
    const id = crypto.randomBytes(6).toString('hex');
    const ev = { id, name, dateISO, locationType, feeCents, drillsEnabled };
    events.push(ev);
    res.json({ success:true, event: ev });
  } catch (err) {
    res.status(500).json({ success:false, error: err.message });
  }
});

// ---- Drill submissions ----
app.post('/api/events/:id/submit', (req, res) => {
  try {
    const { id: eventId } = req.params;
    const ev = events.find(e => e.id === eventId);
    if (!ev) return res.status(404).json({ success:false, error:'Event not found' });

    const { email, drillType, made = 0, attempts = 0, timeMs = 0, verifiedBy = null } = req.body || {};
    if (!email || !drillType) return res.status(400).json({ success:false, error:'email and drillType required' });

    if (!submissions.has(eventId)) submissions.set(eventId, new Map());
    const byUser = submissions.get(eventId);

    if (!byUser.has(email)) byUser.set(email, new Map());
    const byDrill = byUser.get(email);

    const record = {
      made: Number(made) || 0,
      attempts: Number(attempts) || 0,
      timeMs: Number(timeMs) || 0,
      verifiedBy: verifiedBy || undefined,
      createdAt: Date.now(),
    };
    byDrill.set(drillType, record);

    res.json({ success:true, saved: { email, drillType, ...record } });
  } catch (err) {
    res.status(500).json({ success:false, error: err.message });
  }
});

// List submissions for an event (flattened)
app.get('/api/events/:id/submissions', (req, res) => {
  try {
    const { id: eventId } = req.params;
    const ev = events.find(e => e.id === eventId);
    if (!ev) return res.status(404).json({ success:false, error:'Event not found' });

    const byUser = submissions.get(eventId) || new Map();
    const rows = [];
    for (const [email, byDrill] of byUser.entries()) {
      for (const [drillType, record] of byDrill.entries()) {
        rows.push({
          email,
          drillType,
          made: record.made,
          attempts: record.attempts,
          timeMs: record.timeMs,
          verifiedBy: record.verifiedBy || null,
          createdAt: record.createdAt || null,
        });
      }
    }
    res.json({ success:true, submissions: rows });
  } catch (err) {
    res.status(500).json({ success:false, error: err.message });
  }
});

// ---- Head-to-head compare ----
app.post('/api/events/:id/compare', (req, res) => {
  try {
    const { id: eventId } = req.params;
    const ev = events.find(e => e.id === eventId);
    if (!ev) return res.status(404).json({ success:false, error:'Event not found' });

    const { userA, userB, drills = [] } = req.body || {};
    if (!userA || !userB || !Array.isArray(drills) || drills.length === 0) {
      return res.status(400).json({ success:false, error:'userA, userB, drills[] required' });
    }

    const byUser = submissions.get(eventId) || new Map();
    const getScore = (email) => {
      const drillMap = byUser.get(email) || new Map();
      let totalMade = 0, totalAttempts = 0, totalTime = 0;
      const details = [];
      for (const d of drills) {
        const r = drillMap.get(d);
        if (r) {
          totalMade += r.made;
          totalAttempts += r.attempts;
          totalTime += r.timeMs;
          details.push({ drillType: d, made: r.made, attempts: r.attempts, timeMs: r.timeMs });
        } else {
          details.push({ drillType: d, made: 0, attempts: 0, timeMs: 0 });
        }
      }
      return { totalMade, totalAttempts, totalTime, details };
    };

    const a = getScore(userA);
    const b = getScore(userB);

    let winner = 'tie';
    if (a.totalMade > b.totalMade) winner = userA;
    else if (a.totalMade < b.totalMade) winner = userB;
    else if (a.totalTime < b.totalTime) winner = userA;
    else if (a.totalTime > b.totalTime) winner = userB;

    res.json({ success:true, result: { eventId, userA: a, userB: b, winner } });
  } catch (err) {
    res.status(500).json({ success:false, error: err.message });
  }
});

// Has this user joined this event?
app.get('/api/events/:id/registration/:email', (req, res) => {
  try {
    const { id, email } = req.params;
    const ev = events.find(e => e.id === id);
    if (!ev) return res.status(404).json({ success:false, error:'event not found' });

    const regMap = registrations.get(id) || new Map();
    const rec = regMap.get(decodeURIComponent(email));
    res.json({ success: true, joined: !!rec, record: rec || null });
  } catch (err) {
    res.status(500).json({ success:false, error: err.message });
  }
});

// ---- Credits ----
app.get('/api/credits/:email', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const wallet = getUserCredits(email);
    res.json({ success:true, balance: wallet.balance });
  } catch (err) {
    res.status(500).json({ success:false, error: err.message });
  }
});

app.post('/api/credits/grant', (req, res) => {
  try {
    const { email, delta } = req.body;
    if (!email || !Number.isFinite(delta)) return res.status(400).json({ error: 'email and numeric delta required' });
    const wallet = getUserCredits(email);
    wallet.balance += delta;
    pushCreditHistory(email, delta, 'grant');
    res.json({ success: true, balance: wallet.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Join Event (demo credits) ----
app.post('/api/events/:id/joinDemo', (req, res) => {
  console.log('[joinDemo] route active');
  try {
    const { id } = req.params;
    const { email, fee = 10 } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });

    const ev = events.find(e => e.id === id);
    if (!ev) return res.status(404).json({ error: 'event not found' });

    const wallet = getUserCredits(email);
    if (wallet.balance < fee) return res.status(400).json({ error: 'insufficient credits' });

    wallet.balance -= fee;

    if (!registrations.has(id)) registrations.set(id, new Map());
    const regMap = registrations.get(id);
    regMap.set(email, { paid: true, creditsUsed: fee, at: Date.now() });

    return res.json({ success: true, balance: wallet.balance, fee, eventId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Apply signed delta with optional reason (add or deduct)
app.post('/api/credits/apply', (req, res) => {
  try {
    const { email, delta, reason } = req.body;
    if (!email || !Number.isFinite(delta)) return res.status(400).json({ error: 'email and numeric delta required' });
    const wallet = getUserCredits(email);
    wallet.balance += delta;
    pushCreditHistory(email, delta, reason || (delta >= 0 ? 'add' : 'deduct'));
    res.json({ success: true, balance: wallet.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// History for a user
app.get('/api/credits/:email/history', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const rows = creditsHistory.get(email) || [];
    res.json({ success: true, history: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Ball Skill server running on http://localhost:${PORT}`);
});

// Aggregate submissions by user across all events
app.get('/api/user/:email/submissions', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const rows = [];
    for (const ev of events) {
      const byUser = submissions.get(ev.id) || new Map();
      const drillMap = byUser.get(email);
      if (!drillMap) continue;
      for (const [drillType, record] of drillMap.entries()) {
        rows.push({
          eventId: ev.id,
          eventName: ev.name,
          dateISO: ev.dateISO,
          drillType,
          made: record.made,
          attempts: record.attempts,
          timeMs: record.timeMs,
          createdAt: record.createdAt || null,
        });
      }
    }
    res.json({ success:true, submissions: rows });
  } catch (err) {
    res.status(500).json({ success:false, error: err.message });
  }
});

app.get('/api/user/:email/registrations', (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const rows = [];
    for (const ev of events) {
      const regMap = registrations.get(ev.id) || new Map();
      if (regMap.has(email)) {
        rows.push({
          eventId: ev.id,
          eventName: ev.name,
          dateISO: ev.dateISO,
          creditsUsed: regMap.get(email)?.creditsUsed ?? 0,
          at: regMap.get(email)?.at ?? null,
        });
      }
    }
    res.json({ success:true, registrations: rows });
  } catch (err) {
    res.status(500).json({ success:false, error: err.message });
  }
});


// Update an event (name, feeCents, locationType, drillsEnabled, dateISO)
app.put('/api/events/:id', (req, res) => {
  try {
    const { id } = req.params;
    const ev = events.find(e => e.id === id);
    if (!ev) return res.status(404).json({ success:false, error:'Event not found' });

    const { name, feeCents, locationType, drillsEnabled, dateISO } = req.body || {};
    if (typeof name === 'string' && name.trim()) ev.name = name.trim();
    if (Number.isFinite(feeCents)) ev.feeCents = Number(feeCents);
    if (locationType === 'in_person' || locationType === 'online') ev.locationType = locationType;
    if (Array.isArray(drillsEnabled)) ev.drillsEnabled = drillsEnabled;
    if (typeof dateISO === 'string' && dateISO) ev.dateISO = dateISO;

    return res.json({ success:true, event: ev });
  } catch (err) {
    res.status(500).json({ success:false, error: err.message });
  }
});

// Delete an event
app.delete('/api/events/:id', (req, res) => {
  try {
    const { id } = req.params;
    const idx = events.findIndex(e => e.id === id);
    if (idx === -1) return res.status(404).json({ success:false, error:'Event not found' });

    const [removed] = events.splice(idx, 1);
    registrations.delete(id);
    submissions.delete(id);

    return res.json({ success:true, removed: removed?.id });
  } catch (err) {
    res.status(500).json({ success:false, error: err.message });
  }

  function dumpRoutes() {
    console.log('--- ROUTES ---');
    app._router.stack
      .filter(l => l.route)
      .forEach(l => {
        const methods = Object.keys(l.route.methods).join(',').toUpperCase();
        console.log(methods.padEnd(6), l.route.path);
      });
    console.log('--------------');
  }
  dumpRoutes();

});
