import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';

const app = express();
app.use(cors());
app.use(express.json());

const { PORT = 3001 } = process.env;

// ---- In-memory store ----
const events = []; // [{ id, name, dateISO, locationType, feeCents, drillsEnabled }]
const credits = new Map(); // email -> { balance: number }
const registrations = new Map(); // eventId -> Map<email,{paid:true,creditsUsed:number,at:number}>

function getUserCredits(email) {
  const key = (email || '').toLowerCase();
  if (!credits.has(key)) credits.set(key, { balance: 0 });
  return credits.get(key);
}

// Health
app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok' }));

// Events
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

// Join with demo credits
app.post('/api/events/:id/joinDemo', (req, res) => {
  const { id } = req.params;
  const { email, fee = 10 } = req.body || {};
  if (!email) return res.status(400).json({ success: false, error: 'email required' });
  const ev = events.find(e => e.id === id);
  if (!ev) return res.status(404).json({ success: false, error: 'event not found' });

  const wallet = getUserCredits(email);
  if (wallet.balance < fee) return res.status(400).json({ success: false, error: 'insufficient credits' });

  wallet.balance -= Number(fee);

  if (!registrations.has(id)) registrations.set(id, new Map());
  registrations.get(id).set(email.toLowerCase(), { paid: true, creditsUsed: Number(fee), at: Date.now() });

  return res.json({ success: true, balance: wallet.balance, fee: Number(fee), eventId: id });
});

// Credits
app.get('/api/credits/:email', (req, res) => {
  const email = decodeURIComponent(req.params.email || '').toLowerCase();
  const wallet = getUserCredits(email);
  return res.json({ success: true, balance: wallet.balance });
});

app.post('/api/credits/grant', (req, res) => {
  const { email, delta } = req.body || {};
  if (!email || !Number.isFinite(delta)) return res.status(400).json({ success: false, error: 'email and numeric delta required' });
  const wallet = getUserCredits(email);
  wallet.balance += Number(delta);
  return res.json({ success: true, balance: wallet.balance });
});

app.listen(PORT, () => {
  console.log(`Ball Skill server running on http://localhost:${PORT}`);
});
