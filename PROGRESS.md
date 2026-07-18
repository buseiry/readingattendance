# Progress

A running log of what's built, what's next, and known issues. Updated at the
end of each phase.

---

## ✅ Phase 1 — Foundation (complete)

**Goal:** register → verify email → complete onboarding → land on the dashboard
→ log out.

### What was built

- **Tooling:** Vite + React 18 + Tailwind CSS, ESLint, clean project scaffold.
- **Firebase (modular SDK only):** `src/lib/firebase.js` initialises Auth and
  Firestore from `VITE_*` env vars and auto-connects to the local Emulator
  Suite when `VITE_USE_EMULATORS=true`.
- **Auth:** `AuthContext` + `useAuth` with:
  - Google sign-in (offered first, least friction)
  - Email/password register + login
  - Email verification sent on signup; a dashboard banner lets users resend and
    re-check. Google accounts are treated as already verified.
  - A `users/{uid}` profile document is created on first sign-in with the
    data-model defaults.
- **Routing (React Router):** `/`, `/login`, `/register`, `/onboarding`,
  `/dashboard`, `/session`, `/leaderboard`, `/profile`, `/premium`, `/groups`,
  plus a 404.
- **Route guards:** `RequireAuth` (must be logged in) and `RequireOnboarding`
  (must have chosen a school), composed via nested routes.
- **Onboarding:** school dropdown seeded with major Nigerian universities +
  "Other" free-text, plus department and level.
- **Shared UI:** buttons, inputs, cards, and the loading / empty / error states
  the design direction requires — with accessibility baked in (labels, roles,
  `prefers-reduced-motion`, ≥44px touch targets).
- **Docs:** `README.md` (setup) and `.env.example`.

### Verified (not just written)

Ran the full flow in a real headless browser (Playwright) against the live
Firebase emulators. All 11 checks passed with **zero console errors**:
register → onboarding → dashboard (greets by name, shows school, shows
verify-email banner) → navigate guarded routes → logout → protected again →
log back in (skips onboarding). `npm run build` and `npm run lint` are clean.

### Notable decision / bug fixed during the phase

- **Fixed an onboarding redirect race.** The first version navigated to the
  dashboard immediately after saving the profile, but the route guard sometimes
  read the not-yet-updated profile snapshot and bounced back to onboarding. Fix:
  `AuthContext` now treats "logged in but profile not yet loaded" as `loading`
  so guards wait for real data, and `Onboarding` redirects reactively when
  `onboardingComplete` flips true instead of racing with a manual navigate.

### Known issues / deferred

- **Firestore rules are dev-permissive** (`allow read, write: if request.auth != null`).
  Hardening the scoring fields is the core of Phase 3. **Do not deploy as-is.**
- **Route-level code splitting** (React.lazy) is deferred to Phase 5. Current
  initial load is ~168KB gzipped (app 60KB + Firebase 105KB), already under the
  200KB target, but Phase 5 will trim it further by lazy-loading Firestore.
- Cloud Functions / Blaze plan not needed yet — first required in Phase 2.

---

## ✅ Phase 2 — The session engine (complete)

**Goal:** run a real reading session that survives locking the phone and
refreshing the page, and end with an accurate, un-fakeable verified-minute count.

### What was built

- **Cloud Functions (`/functions`, Node 20) — the trust boundary:**
  - `startSession` (callable) — server-authoritative start; stamps `startTime`
    with server time and enforces cooldown + "one active session" in a
    transaction.
  - `endSession` (callable) — computes
    `verifiedMinutes = min(clientActiveSeconds, serverWallClock)`, then applies
    the 10-min floor, 180-min ceiling, and 480-min/day cap (Africa/Lagos day),
    crediting the user atomically and idempotently.
  - `sweepAbandonedSessions` (scheduled, every 2 min) — closes sessions with no
    heartbeat past a 12-min threshold, crediting only up to the last heartbeat.
  - `flagAnomalies` (scheduled, daily) — flags sessions whose reported active
    time wildly exceeds wall-clock.
- **Client session engine (`useSession` hook):** 1-second accrual that only
  counts while the tab is visible and un-paused; Firestore sync + heartbeat
  every 30s; Page Visibility pause/resume; **gentle non-blocking check-ins**
  (prompt keeps counting; ignored for 90s → pause accrual, not the session);
  Screen Wake Lock with graceful fallback; **grace-window offline resume** via
  Firestore offline persistence + an IndexedDB mirror.
- **Session screen:** calm, dark, large timer; optional "what are you reading?";
  paused/check-in states; clear counted/didn't-count result. Runs full-screen
  outside the light nav shell.

### Decisions & deviations (your call was applied)

- **Check-ins: gentle & non-blocking** (not the strict blocking modal in the
  brief) — better for deep reading; the server caps are the real anti-cheat.
- **Offline: grace-window resume** — keep timing locally and rejoin the same
  session within 10 min; abandonment threshold is 12 min so a reconnecting
  client still finds its session open.
- **Session start is now a Cloud Function** (brief had the client create it) —
  server-stamped `startTime` closes a forged-timestamp hole and centralises the
  cooldown/limit checks. Flagged for your awareness.

### Verified (not just written)

- **Functions test** (`functions/test-functions.mjs`, against the emulator):
  proves the ceiling and caps — a tampered client claiming 999999 seconds is
  capped to the real 30-min wall-clock; 180-min max; sub-10-min doesn't count;
  daily cap; and the abandon-sweep credits only up to the last heartbeat and is
  idempotent. All pass.
- **Engine E2E** (Playwright against the production build + live emulators):
  start → server flags user → timer accrues → hide tab pauses → return resumes
  → **refresh resumes the same session** → end shows the correct result →
  cooldown blocks an immediate restart. All pass, and Phase 1's flow still
  passes (no regression).

### Bug fixed during the phase

- Fixed a **route-guard timing bug** (surfaced by the engine E2E): on a fresh
  page load, `onAuthStateChanged` set `user` one render before the profile
  effect reset its flag, so `loading` briefly read `false` with an empty
  profile and the onboarding guard bounced `/session` → `/onboarding`. Now
  `loading` is derived by comparing the loaded profile's `id` to the current
  `uid`, which can't lag.

### Known issues / deferred

- **Firestore rules still dev-permissive** — the client can currently write
  session fields freely. Locking `verifiedMinutes`/`status`/scoring fields to
  server-only is Phase 3. (The endSession ceiling already neutralises inflated
  `activeSeconds`, so the leaderboard maths is safe today; the rules make the
  whole database tamper-proof.)
- Data model gained server-managed `dailyMinutes` + `dailyDate` (for the daily
  cap) and `activeSessionId` (for resume).
- Scheduled functions are written but only run on a real deploy / with the
  pubsub emulator; their logic is unit-tested directly.

## Later phases

- **Phase 3** — Paystack payments + Firestore security lockdown (tested, proven).
- **Phase 4** — Leaderboards, streaks (Africa/Lagos day boundaries), groups, profile.
- **Phase 5** — PWA, push notifications, shareable cards, bundle optimisation.
