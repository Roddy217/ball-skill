export default function attachSubmissions(app) {
  app.locals.submissions = app.locals.submissions || new Map();

  app.post('/api/events/:id/submit', (req, res) => {
    const id = String(req.params.id || '').trim();
    const { email, drillType, made, attempts, timeMs } = req.body || {};
    if (!id)    return res.status(400).json({ error: 'Missing event id' });
    if (!email) return res.status(400).json({ error: 'Missing email' });

    const sub = {
      email: String(email).toLowerCase(),
      drillType: String(drillType || ''),
      made: Number(made) || 0,
      attempts: Number(attempts) || 0,
      timeMs: Number(timeMs) || 0,
      ts: Date.now(),
    };

    const map = app.locals.submissions;
    const arr = map.get(id) || [];
    arr.push(sub);
    map.set(id, arr);

    res.json({ success: true, submission: sub, count: arr.length });
  });

  app.get('/api/events/:id/submissions', (req, res) => {
    const id = String(req.params.id || '').trim();
    const arr = app.locals.submissions.get(id) || [];
    res.json({ success: true, submissions: arr });
  });
}
