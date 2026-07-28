// Trusted backend for the reading-attendance app.
//
// These functions run with the Admin SDK, which bypasses Firestore security
// rules. They are the ONLY code allowed to write the privileged fields
// (users.points, users.paymentStatus, sessions.pointsAwarded, …). The client
// can never set those directly — see ../firestore.rules.

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

// Set with:  firebase functions:secrets:set PAYSTACK_SECRET_KEY
const PAYSTACK_SECRET_KEY = defineSecret("PAYSTACK_SECRET_KEY");

const MIN_SESSION_MINUTES = 60; // a valid reading session must last this long
const POINTS_PER_SESSION = 1;
const PAYMENT_AMOUNT_KOBO = 50000; // ₦500, expressed in kobo for Paystack

// completeSession — finalize a reading session and award its point.
// This is the ONLY place points are written, so a user cannot self-award.
exports.completeSession = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  if (!request.auth.token.email_verified) {
    throw new HttpsError("permission-denied", "Verify your email first.");
  }

  const sessionId = request.data && request.data.sessionId;
  if (!sessionId || typeof sessionId !== "string") {
    throw new HttpsError("invalid-argument", "sessionId is required.");
  }

  const sessionRef = db.collection("sessions").doc(sessionId);
  const userRef = db.collection("users").doc(uid);

  return db.runTransaction(async (tx) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) {
      throw new HttpsError("not-found", "Session not found.");
    }
    const session = sessionSnap.data();

    if (session.userId !== uid) {
      throw new HttpsError("permission-denied", "Not your session.");
    }
    // Idempotent: never award the same session twice.
    if (session.pointsAwarded === true || session.completed === true) {
      throw new HttpsError("failed-precondition", "Session already completed.");
    }

    const startMs = session.startTime && session.startTime.toMillis
      ? session.startTime.toMillis()
      : null;
    if (!startMs) {
      throw new HttpsError("failed-precondition", "Session has no start time.");
    }

    // Duration is computed server-side from the stored start time, so the
    // client cannot fake it.
    const durationMinutes = (Date.now() - startMs) / 60000;
    if (durationMinutes < MIN_SESSION_MINUTES) {
      throw new HttpsError(
        "failed-precondition",
        `Session must last at least ${MIN_SESSION_MINUTES} minutes ` +
          `(current: ${Math.floor(durationMinutes)}).`
      );
    }

    // Only paying users earn points.
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists || userSnap.data().paymentStatus !== true) {
      throw new HttpsError("permission-denied", "Payment required.");
    }

    tx.update(sessionRef, {
      endTime: admin.firestore.FieldValue.serverTimestamp(),
      completed: true,
      pointsAwarded: true,
      durationMinutes: Math.round(durationMinutes),
    });
    tx.update(userRef, {
      points: admin.firestore.FieldValue.increment(POINTS_PER_SESSION),
      activeSession: false,
      lastSessionCompleted: admin.firestore.FieldValue.serverTimestamp(),
      lastActive: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      pointsAwarded: POINTS_PER_SESSION,
      durationMinutes: Math.round(durationMinutes),
    };
  });
});

// initializePayment — start a Paystack transaction for the ₦500 unlock and
// return the hosted checkout URL. paymentStatus is NOT set here; it is set by
// the webhook below only after Paystack confirms the charge.
exports.initializePayment = onCall(
  { secrets: [PAYSTACK_SECRET_KEY] },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    const email = request.auth.token.email;
    if (!email) {
      throw new HttpsError("failed-precondition", "No email on this account.");
    }
    const callbackUrl = request.data && request.data.callbackUrl;

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY.value()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: PAYMENT_AMOUNT_KOBO,
        currency: "NGN",
        callback_url: callbackUrl,
        metadata: { uid },
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.status) {
      throw new HttpsError("internal", (body && body.message) || "Paystack init failed.");
    }

    // Record the pending intent, keyed by Paystack reference.
    await db.collection("payments").doc(body.data.reference).set({
      userId: uid,
      email,
      amount: PAYMENT_AMOUNT_KOBO / 100,
      currency: "NGN",
      status: "pending",
      reference: body.data.reference,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      authorizationUrl: body.data.authorization_url,
      reference: body.data.reference,
    };
  }
);

// paystackWebhook — called by Paystack when a charge succeeds. Verifies the
// signature, then flips paymentStatus on the user. This is the ONLY place
// paymentStatus is set to true.
exports.paystackWebhook = onRequest(
  { secrets: [PAYSTACK_SECRET_KEY] },
  async (req, res) => {
    const signature = req.headers["x-paystack-signature"];
    const expected = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY.value())
      .update(req.rawBody)
      .digest("hex");
    if (!signature || signature !== expected) {
      res.status(401).send("Invalid signature");
      return;
    }

    const event = req.body;
    if (event && event.event === "charge.success") {
      const data = event.data;
      const reference = data.reference;
      const uid = data.metadata && data.metadata.uid;
      const paymentRef = db.collection("payments").doc(reference);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(paymentRef);
        // Idempotent: ignore duplicate webhook deliveries.
        if (snap.exists && snap.data().status === "success") return;

        tx.set(
          paymentRef,
          {
            status: "success",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        if (uid) {
          tx.set(
            db.collection("users").doc(uid),
            {
              paymentStatus: true,
              paymentDate: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }
      });
    }

    res.status(200).send("ok");
  }
);
