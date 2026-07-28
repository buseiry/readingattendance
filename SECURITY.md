# Security model

The web client is untrusted — it runs on the user's device, where anyone can
open the console and call Firestore directly. So the client is **not** allowed
to write the fields that matter for fairness and money:

| Field                        | Who may write it            |
| ---------------------------- | --------------------------- |
| `users.points`               | `completeSession` function  |
| `users.paymentStatus`        | `paystackWebhook` function  |
| `users.paymentDate`          | `paystackWebhook` function  |
| `users.rank`                 | backend only                |
| `users.lastSessionCompleted` | `completeSession` function  |
| `sessions.completed`         | `completeSession` function  |
| `sessions.pointsAwarded`     | `completeSession` function  |
| `payments.status` (`success`)| `paystackWebhook` function  |

These rules are enforced in [`firestore.rules`](./firestore.rules). Cloud
Functions use the Admin SDK, which bypasses the rules, so they are the only
code that can touch the protected fields.

## What each function does

- **`completeSession({ sessionId })`** — the only place a point is awarded.
  It verifies the session belongs to the caller, computes the duration
  **server-side** from the stored `startTime` (so the client can't fake it),
  enforces the minimum session length, requires the user to have paid, and is
  idempotent (a session can never be awarded twice).
- **`initializePayment({ callbackUrl })`** — starts a Paystack transaction for
  the ₦500 unlock and returns the hosted checkout URL. It does **not** grant
  access.
- **`paystackWebhook`** — called by Paystack after a successful charge. It
  verifies the `x-paystack-signature` HMAC before setting `paymentStatus`, so a
  forged request can't unlock an account.

## Deploying

```bash
# 1. Install function deps
cd functions && npm install && cd ..

# 2. Deploy the rules and indexes
firebase deploy --only firestore:rules,firestore:indexes

# 3. Configure the Paystack secret, then deploy functions
firebase functions:secrets:set PAYSTACK_SECRET_KEY
firebase deploy --only functions
```

Finally, in the Paystack dashboard set the webhook URL to the deployed
`paystackWebhook` endpoint (shown at the end of `firebase deploy`).

> **Note:** with these rules in place, points and payment unlocks only work
> once the Cloud Functions are deployed and `PAYSTACK_SECRET_KEY` is set. That
> is by design — before this change the client could grant itself both.
