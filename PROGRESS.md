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

## ⏳ Phase 2 — The session engine (next)

Server-authoritative timing, heartbeats, visibility-pause, random check-ins,
wake lock, offline tolerance, and accurate verified-minute counting. See the
brief. **Open design questions to settle before building:** how intrusive the
random check-ins should be, and the offline-resume vs. 3-minute-abandonment
reconciliation policy.

## Later phases

- **Phase 3** — Paystack payments + Firestore security lockdown (tested, proven).
- **Phase 4** — Leaderboards, streaks (Africa/Lagos day boundaries), groups, profile.
- **Phase 5** — PWA, push notifications, shareable cards, bundle optimisation.
