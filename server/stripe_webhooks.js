import express from 'express';
import Stripe from 'stripe';

/**
 * Webhook handler for Stripe Connect events.
 * This module:
 *  - Verifies webhook signatures using STRIPE_CONNECT_WEBHOOK_SECRET
 *  - Processes `account.*` events and caches latest status by account id
 *  - Exports `connectWebhook` as an array of middlewares (raw body + handler)
 *  - Exports a getter for the last-known status by account id (optional)
 */

const {
  STRIPE_SECRET_KEY = '',
  STRIPE_CONNECT_WEBHOOK_SECRET = '',
} = process.env;

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

// In-memory cache: acct_123 -> { chargesEnabled, payoutsEnabled, detailsSubmitted, requirementsDue, ts }
const accountStatusById = new Map();

/** Optional: read back from the cache elsewhere (e.g., your connect router) */
export function getAccountStatusById(acctId) {
  return accountStatusById.get(acctId) || null;
}

/** Utility: build a compact status snapshot from a Stripe Account object */
function snapshotFromAccount(obj = {}) {
  return {
    id: obj.id || null,
    chargesEnabled: !!obj.charges_enabled,
    payoutsEnabled: !!obj.payouts_enabled,
    detailsSubmitted: !!obj.details_submitted,
    requirementsDue: Array.isArray(obj.requirements?.currently_due)
      ? obj.requirements.currently_due
      : [],
    ts: Date.now(),
  };
}

/** Main webhook handler (after raw body) */
async function handleWebhook(req, res) {
  try {
    if (!stripe) {
      console.log('[connect.webhook] Stripe not configured; accepting payload without verification.');
      // Best-effort parse (dev only)
      const unsafe = JSON.parse(req.body?.toString('utf8') || '{}');
      console.log('[connect.webhook][unsafe]', unsafe?.type || 'unknown');
      return res.status(200).json({ received: true, dev: true });
    }

    const sig = req.headers['stripe-signature'];
    if (!sig || !STRIPE_CONNECT_WEBHOOK_SECRET) {
      console.log('[connect.webhook] Missing signature or webhook secret; refusing.');
      return res.status(400).json({ error: 'Missing signature or webhook secret' });
    }

    // Verify signature with raw body
    const event = await stripe.webhooks.constructEventAsync(
      req.body,                 // raw Buffer from express.raw()
      sig,
      STRIPE_CONNECT_WEBHOOK_SECRET
    );

    const type = event.type || 'unknown';
    const acct = event.account || event.data?.object?.id || null;

    console.log('[connect.webhook] type=', type, 'account=', acct);

    // Process account lifecycle events
    if (type.startsWith('account.')) {
      const accountObj = event.data?.object || {};
      const snap = snapshotFromAccount(accountObj);
      if (snap.id) {
        accountStatusById.set(snap.id, snap);
        console.log('[connect.webhook] cached status for', snap.id, snap);
      } else {
        console.log('[connect.webhook] account object missing id; ignoring cache update');
      }
    }

    // You can add more event types as needed
    // e.g. 'account.application.authorized', 'account.application.deauthorized'

    return res.status(200).json({ received: true });
  } catch (err) {
    console.log('[connect.webhook][error]', err?.message || err);
    return res.status(400).json({ error: String(err?.message || err) });
  }
}

/**
 * Exported as an array so you can spread it in app.post:
 *   app.post('/api/connect/webhook', ...connectWebhook);
 *
 * IMPORTANT: This must be registered BEFORE any app.use(express.json()).
 */
export const connectWebhook = [
  // 1) raw body parser (required for signature verification)
  express.raw({ type: 'application/json' }),
  // 2) handler
  handleWebhook,
];
