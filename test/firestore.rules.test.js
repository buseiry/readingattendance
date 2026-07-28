"use strict";

// Emulator-based tests for firestore.rules.
//
// Run via:  npm run test:rules   (starts the Firestore emulator, then runs)
// The emulator host is provided by `firebase emulators:exec`, which sets
// FIRESTORE_EMULATOR_HOST before invoking this file.

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");
const { test, before, after, beforeEach } = require("node:test");

const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} = require("firebase/firestore");

const RULES = fs.readFileSync(
  path.join(__dirname, "..", "firestore.rules"),
  "utf8"
);

let testEnv;

// A signed-in, email-verified user's Firestore handle.
function db(uid) {
  return testEnv
    .authenticatedContext(uid, { email_verified: true })
    .firestore();
}

// The unauthenticated (logged-out) Firestore handle.
function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-readingattendance",
    firestore: { rules: RULES },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// Seed documents bypassing the rules (for read/update/delete setups).
async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore());
  });
}

// ---------------------------------------------------------------- users

test("signed-in user can read another user's profile (leaderboard)", async () => {
  await seed((d) => setDoc(doc(d, "users/bob"), { points: 3, paymentStatus: true }));
  await assertSucceeds(getDoc(doc(db("alice"), "users/bob")));
});

test("logged-out user cannot read profiles", async () => {
  await seed((d) => setDoc(doc(d, "users/bob"), { points: 3 }));
  await assertFails(getDoc(doc(anonDb(), "users/bob")));
});

test("user can create their own profile with safe defaults", async () => {
  await assertSucceeds(
    setDoc(doc(db("alice"), "users/alice"), {
      email: "alice@example.com",
      points: 0,
      paymentStatus: false,
    })
  );
});

test("user cannot self-grant points at creation", async () => {
  await assertFails(
    setDoc(doc(db("alice"), "users/alice"), { points: 10, paymentStatus: false })
  );
});

test("user cannot self-grant payment at creation", async () => {
  await assertFails(
    setDoc(doc(db("alice"), "users/alice"), { points: 0, paymentStatus: true })
  );
});

test("user cannot create someone else's profile", async () => {
  await assertFails(
    setDoc(doc(db("alice"), "users/bob"), { points: 0, paymentStatus: false })
  );
});

test("user can update non-protected profile fields", async () => {
  await seed((d) =>
    setDoc(doc(d, "users/alice"), { points: 0, paymentStatus: false, displayName: "A" })
  );
  await assertSucceeds(updateDoc(doc(db("alice"), "users/alice"), { displayName: "Alice" }));
});

test("user cannot self-award points via update", async () => {
  await seed((d) => setDoc(doc(d, "users/alice"), { points: 0, paymentStatus: false }));
  await assertFails(updateDoc(doc(db("alice"), "users/alice"), { points: 99 }));
});

test("user cannot self-unlock payment via update", async () => {
  await seed((d) => setDoc(doc(d, "users/alice"), { points: 0, paymentStatus: false }));
  await assertFails(updateDoc(doc(db("alice"), "users/alice"), { paymentStatus: true }));
});

test("user cannot delete a profile", async () => {
  await seed((d) => setDoc(doc(d, "users/alice"), { points: 0, paymentStatus: false }));
  await assertFails(deleteDoc(doc(db("alice"), "users/alice")));
});

// -------------------------------------------------------------- sessions

test("user can open their own un-completed session", async () => {
  await assertSucceeds(
    setDoc(doc(db("alice"), "sessions/s1"), {
      userId: "alice",
      startTime: new Date(),
      completed: false,
      pointsAwarded: false,
    })
  );
});

test("user cannot open a session already marked completed", async () => {
  await assertFails(
    setDoc(doc(db("alice"), "sessions/s1"), {
      userId: "alice",
      startTime: new Date(),
      completed: true,
      pointsAwarded: false,
    })
  );
});

test("user cannot open a session that self-awards points", async () => {
  await assertFails(
    setDoc(doc(db("alice"), "sessions/s1"), {
      userId: "alice",
      startTime: new Date(),
      completed: false,
      pointsAwarded: true,
    })
  );
});

test("user cannot create a session for someone else", async () => {
  await assertFails(
    setDoc(doc(db("alice"), "sessions/s1"), {
      userId: "bob",
      startTime: new Date(),
      completed: false,
      pointsAwarded: false,
    })
  );
});

test("user can read their own session but not another user's", async () => {
  await seed((d) => {
    return Promise.all([
      setDoc(doc(d, "sessions/alice1"), { userId: "alice", completed: false }),
      setDoc(doc(d, "sessions/bob1"), { userId: "bob", completed: false }),
    ]);
  });
  await assertSucceeds(getDoc(doc(db("alice"), "sessions/alice1")));
  await assertFails(getDoc(doc(db("alice"), "sessions/bob1")));
});

test("user cannot finalize a session (that's the backend's job)", async () => {
  await seed((d) =>
    setDoc(doc(d, "sessions/s1"), {
      userId: "alice",
      completed: false,
      pointsAwarded: false,
    })
  );
  await assertFails(
    updateDoc(doc(db("alice"), "sessions/s1"), { completed: true, pointsAwarded: true })
  );
});

// -------------------------------------------------------------- payments

test("user can record a pending payment for themselves", async () => {
  await assertSucceeds(
    setDoc(doc(db("alice"), "payments/p1"), {
      userId: "alice",
      amount: 500,
      status: "pending",
    })
  );
});

test("user cannot record a payment as already successful", async () => {
  await assertFails(
    setDoc(doc(db("alice"), "payments/p1"), {
      userId: "alice",
      amount: 500,
      status: "success",
    })
  );
});

test("user cannot create a payment for someone else", async () => {
  await assertFails(
    setDoc(doc(db("alice"), "payments/p1"), {
      userId: "bob",
      amount: 500,
      status: "pending",
    })
  );
});

test("user cannot flip a payment to success via update", async () => {
  await seed((d) =>
    setDoc(doc(d, "payments/p1"), { userId: "alice", amount: 500, status: "pending" })
  );
  await assertFails(updateDoc(doc(db("alice"), "payments/p1"), { status: "success" }));
});
