// Tests the payment logic against the Firestore emulator, WITHOUT hitting the
// real Paystack API (the verify/grant/signature pieces are separated so they
// can be exercised with fake payloads).
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ||= 'demo-reading-streak';
process.env.GOOGLE_CLOUD_PROJECT ||= 'demo-reading-streak';

const { evaluateVerification, computePremiumExpiry, grantPremium, verifyPaystackSignature } =
  await import('./index.js');
const { getFirestore } = await import('firebase-admin/firestore');
const crypto = await import('node:crypto');
const db = getFirestore();

let failures = 0;
const check = (c, m) => { console.log(c ? `  ✅ ${m}` : `  ❌ ${m}`); if (!c) failures++; };

console.log('\nevaluateVerification:');
{
  check(evaluateVerification({ status: 'success', amount: 100000, currency: 'NGN' }).ok, 'valid ₦1,000 success accepted');
  check(!evaluateVerification({ status: 'success', amount: 50000, currency: 'NGN' }).ok, 'wrong amount rejected');
  check(!evaluateVerification({ status: 'failed', amount: 100000, currency: 'NGN' }).ok, 'non-success rejected');
  check(!evaluateVerification({ status: 'success', amount: 100000, currency: 'USD' }).ok, 'wrong currency rejected');
}

console.log('\ncomputePremiumExpiry:');
{
  process.env.SEMESTER_END = '2099-12-31';
  const far = computePremiumExpiry(new Date('2026-07-18'));
  check(far.getFullYear() === 2099, 'future semester-end date is used');
  process.env.SEMESTER_END = '2000-01-01'; // past
  const fb = computePremiumExpiry(new Date('2026-07-18'));
  const days = Math.round((fb - new Date('2026-07-18')) / 86400000);
  check(days === 120, 'past semester-end falls back to +120 days');
  delete process.env.SEMESTER_END;
}

console.log('\nverifyPaystackSignature (HMAC-SHA512):');
{
  const secret = 'sk_test_secret';
  const body = Buffer.from(JSON.stringify({ event: 'charge.success' }));
  const sig = crypto.createHmac('sha512', secret).update(body).digest('hex');
  check(verifyPaystackSignature(body, sig, secret), 'correct signature accepted');
  check(!verifyPaystackSignature(body, 'deadbeef', secret), 'bad signature rejected');
}

console.log('\ngrantPremium (DB): grants once, idempotent, email-guarded:');
{
  const uid = 'pay-user';
  await db.collection('users').doc(uid).set({ email: 'buyer@lasustech.edu.ng', isPremium: false, paystackRef: '', premiumExpiresAt: null });
  const data = { status: 'success', amount: 100000, currency: 'NGN', reference: 'REF-1', customer: { email: 'buyer@lasustech.edu.ng' } };

  const r1 = await grantPremium({ uid, email: 'buyer@lasustech.edu.ng', reference: 'REF-1', data });
  check(r1.granted === true, 'first redemption grants premium');
  let u = (await db.collection('users').doc(uid).get()).data();
  check(u.isPremium === true && u.paystackRef === 'REF-1' && !!u.premiumExpiresAt, 'user marked premium with ref + expiry');
  check((await db.collection('payments').doc('REF-1').get()).exists, 'payment record written');

  const r2 = await grantPremium({ uid, email: 'buyer@lasustech.edu.ng', reference: 'REF-1', data });
  check(r2.alreadyRedeemed === true && r2.granted === false, 'same reference is not redeemed twice');

  // Another user tries to claim a payment made under a different email.
  await db.collection('users').doc('other-user').set({ email: 'thief@x.com', isPremium: false });
  let threw = false;
  try {
    await grantPremium({ uid: 'other-user', email: 'thief@x.com', reference: 'REF-2', data: { ...data, reference: 'REF-2' } });
  } catch (e) {
    threw = e.code === 'permission-denied' || /different account/.test(e.message);
  }
  check(threw, 'cannot claim a payment made under another email');
}

console.log(`\n${failures === 0 ? '🎉 ALL PAYMENT TESTS PASSED' : `❌ ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
