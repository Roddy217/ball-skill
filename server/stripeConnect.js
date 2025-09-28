import express from 'express';
import Stripe from 'stripe';

const {
  STRIPE_SECRET_KEY = '',
  STRIPE_CONNECT_WEBHOOK_SECRET = '',
} = process.env;

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

// Exported as an array so index.js can do:
//   app.post('/api/connect/webhook', ...connectWebhook)
// IMPORTANT: express.raw() must be used and this route must be mounted
// BEFORE app.use(express.json()) in index.js
export const connectWebhook = [
  express.raw({ type: 'application/json' }),
  (req, res) => {
    try {
      if (!stripe) {
        console.error('[connect][webhook] Stripe not configured');
        return res.status(500).json({ error: 'stripe_not_configured' });
      }
      if (!STRIPE_CONNECT_WEBHOOK_SECRET) {
        console.error('[connect][webhook] Missing STRIPE_CONNECT_WEBHOOK_SECRET');
        return res.status(500).json({ error: 'missing_webhook_secret' });
      }

      const sig = req.headers['stripe-signature'];
      const event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_CONNECT_WEBHOOK_SECRET);

      console.log('[connect][webhook]', event.type, event.id, 'acct:', event.account || '(platform)');

      // (Optional) Handle some common events:
      // if (event.type === 'account.updated') { ... }

      res.json({ received: true });
    } catch (err) {
      console.error('[connect][webhook][error]', String(err));
      res.status(400).send(`Webhook Error: ${String(err)}`);
    }
  },
];

// Optional router for /api/connect/* extras
const router = express.Router();
router.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));
export default router;
