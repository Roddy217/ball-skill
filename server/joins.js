import { Router, json, urlencoded } from 'express';

export default function attachJoins(app) {
  // Reuse app.locals across reloads
  app.locals.joinsByEmail ??= new Map(); // email -> Set(eventId)
  app.locals.joinsByEvent ??= new Map(); // eventId -> Set(email)

  const router = Router();
  // Ensure body parsing for these routes even if app-level middleware is missing
  router.use(json());
  router.use(urlencoded({ extended: true }));

  function addJoin(rawEmail, rawEventId) {
    const email = String(rawEmail || '').toLowerCase().trim();
    const eventId = String(rawEventId || '').trim();
    if (!email || !eventId) return;
    if (!app.locals.joinsByEmail.has(email)) app.locals.joinsByEmail.set(email, new Set());
    if (!app.locals.joinsByEvent.has(eventId)) app.locals.joinsByEvent.set(eventId, new Set());
    app.locals.joinsByEmail.get(email).add(eventId);
    app.locals.joinsByEvent.get(eventId).add(email);
  }
  function removeJoin(rawEmail, rawEventId) {
    const email = String(rawEmail || '').toLowerCase().trim();
    const eventId = String(rawEventId || '').trim();
    if (!email || !eventId) return;
    const byEmail = app.locals.joinsByEmail.get(email);
    const byEvent = app.locals.joinsByEvent.get(eventId);
    if (byEmail) { byEmail.delete(eventId); if (byEmail.size === 0) app.locals.joinsByEmail.delete(email); }
    if (byEvent) { byEvent.delete(email); if (byEvent.size === 0) app.locals.joinsByEvent.delete(eventId); }
  }

  // POST /api/events/:id/join — record a join
  router.post('/api/events/:id/join', (req, res) => {
    console.log('[joins] POST /api/events/:id/join', {
      id: req.params.id,
      contentType: req.headers['content-type'],
      body: req.body,
    });
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    addJoin(email, req.params.id);
    return res.json({ success: true });
  });

  // DELETE /api/events/:id/join — remove a join
  router.delete('/api/events/:id/join', (req, res) => {
    console.log('[joins] DELETE /api/events/:id/join', {
      id: req.params.id,
      contentType: req.headers['content-type'],
      body: req.body,
    });
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    removeJoin(email, req.params.id);
    return res.json({ success: true });
  });

  // GET /api/users/:email/joins — list user joins
  router.get('/api/users/:email/joins', (req, res) => {
    const email = String(req.params.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email required' });
    const set = app.locals.joinsByEmail.get(email) || new Set();
    return res.json({ success: true, joins: Array.from(set) });
  });

  // GET /api/events/:id/joined?email=... — check joined state
  router.get('/api/events/:id/joined', (req, res) => {
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email required' });
    const id = String(req.params.id || '').trim();
    const set = app.locals.joinsByEvent.get(id) || new Set();
    return res.json({ success: true, joined: set.has(email) });
  });

  app.use(router);
}
