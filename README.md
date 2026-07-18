# ReadingStreak

A reading-accountability tracker for Nigerian university students. Start a
reading session, and the app tracks how long you *actually* read (verified,
not just claimed), builds your streak, and ranks you on your school's
leaderboard.

Built mobile-first for cheap Android phones on patchy, expensive data.

> **Status:** under active rebuild, phase by phase. See [`PROGRESS.md`](./PROGRESS.md)
> for what's done and what's next.

## Tech stack

- **Vite + React 18** (JavaScript, not TypeScript)
- **Tailwind CSS** for styling
- **Firebase v10 (modular SDK only)** — Auth + Firestore now; Cloud Functions
  and Cloud Messaging in later phases
- **Firebase Emulator Suite** for local development (no billing, no real emails)

## Prerequisites

- **Node.js 18+** (built and tested on Node 22)
- **Java 11+** — required to run the Firebase Emulator Suite locally
- **Firebase CLI** — install once, globally:
  ```bash
  npm install -g firebase-tools
  ```

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file from the template
cp .env.example .env
```

The default `.env` is already set up for **emulator-first development**:
`VITE_USE_EMULATORS=true` and a `demo-` project ID, which keeps everything
offline and safe. You don't need a real Firebase project to develop Phase 1.

```bash
# 3. In one terminal, start the Firebase emulators (Auth + Firestore)
npm run emulators
#   Emulator UI:  http://127.0.0.1:4000

# 4. In a second terminal, start the app
npm run dev
#   App:  http://localhost:5173
```

Register an account, then open the **Auth emulator UI** at
<http://127.0.0.1:4000/auth> to see the "verification email" and mark the
account verified (the emulator doesn't send real email).

### Connecting to a real Firebase project (for deploy)

When you're ready to go live:

1. Create a Firebase project and add a **Web app** to it.
2. Copy that app's config values into `.env` (see `.env.example` for the keys).
3. Set `VITE_USE_EMULATORS=false`.
4. Enable **Email/Password** and **Google** sign-in in
   Firebase Console → Authentication → Sign-in method.

> **Note:** From Phase 2 onward the app uses Cloud Functions and needs the
> Firebase **Blaze (pay-as-you-go)** plan. Costs at small scale are near zero,
> but a card must be on file. The Firebase *web* config values are **not**
> secrets — your data is protected by Firestore security rules (Phase 3), not
> by hiding the config. The Paystack **secret** key is a real secret and will
> live only in Cloud Functions config.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Lint the source with ESLint |
| `npm run emulators` | Start the Firebase Emulator Suite |

## Project layout

```
src/
  components/   reusable UI (buttons, cards, guards, layout)
  context/      AuthContext — the single source of "who's logged in"
  hooks/        useAuth (re-exported from context)
  lib/          firebase.js, constants, error helpers
  pages/        one component per route
firestore.rules          security rules (dev-permissive for now; locked in Phase 3)
firestore.indexes.json   composite indexes (added as queries are built)
firebase.json            emulator + Firestore config
.env.example             template for your local .env
```
