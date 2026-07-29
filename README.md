# Reading Attendance

A small web app for a paid reading group. Members register, verify their
email, pay a one-time ₦500 unlock, then run timed reading sessions to earn
points and climb a leaderboard.

It is a static front-end (plain HTML/JS) backed by Firebase
(Authentication + Firestore) with Cloud Functions as the trusted backend for
anything a user must not be able to forge (points and payments).

## Pages

| Page                 | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `index.html`         | Login                                               |
| `register.html`      | Create account (sends email verification)           |
| `dashboard.html`     | Points, rank, and Start Session (gated on payment)  |
| `session.html`       | Active session timer + End Session                  |
| `simple-session.html`| Standalone session tracker (Firebase modular SDK)   |
| `payment.html`       | ₦500 unlock via Paystack                            |
| `leaderboard.html`   | Top members by points                               |

## Configuration

Every page loads `../firebase-config.js` (one level above this folder), which
must define your Firebase web config on `window`:

```js
// firebase-config.js
window.firebaseConfig = {
  apiKey: "…",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "…",
  appId: "…"
};
```

This file is intentionally not committed. (`simple-session.html` is
self-contained and carries its own config inside `simple-session.js`.)

## Running locally

Because the pages load ES modules and a sibling config file, serve them over
HTTP rather than opening the files directly:

```bash
# from the parent directory that also contains firebase-config.js
python3 -m http.server 8000
# then open http://localhost:8000/readingattendance/index.html
```

## Backend and security

Points and payment unlocks are written **only** by Cloud Functions, never by
the client — see [`SECURITY.md`](./SECURITY.md) for the model and the deploy
steps (`firestore.rules`, `firestore.indexes.json`, and `functions/`).
