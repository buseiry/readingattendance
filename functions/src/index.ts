import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();

// Wire in session controls implemented in a separate module
import { pauseSessionSimple, resumeSessionSimple, endSessionSimple } from './sessionControls';
export { pauseSessionSimple as pauseSession, resumeSessionSimple as resumeSession, endSessionSimple as endSession };

// Hardened payment functions
export const createPayment = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');

  try {
    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET_KEY) {
      console.error('createPayment: PAYSTACK_SECRET_KEY not set in environment');
      throw new functions.https.HttpsError('failed-precondition', 'Payment system not configured');
    }

    const userId = context.auth.uid;
    const { email, amount } = data;
    if (!email || !amount) throw new functions.https.HttpsError('invalid-argument', 'email and amount are required');

    const reference = `reading_tracker_${userId}_${Date.now()}`;

    await db.collection('payments').doc(reference).set({
      userId,
      email,
      amount,
      currency: 'NGN',
      reference,
      status: 'pending',
      provider: 'paystack',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('createPayment: created payment record', reference, userId);
    return { success: true, reference };
  } catch (err: any) {
    console.error('createPayment error:', err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('internal', 'Failed to create payment');
  }
});

export const verifyPayment = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');

  try {
    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET_KEY) {
      console.error('verifyPayment: PAYSTACK_SECRET_KEY not set');
      throw new functions.https.HttpsError('failed-precondition', 'Payment backend not configured');
    }

    const userId = context.auth.uid;
    const { reference } = data;
    if (!reference) throw new functions.https.HttpsError('invalid-argument', 'reference is required');

    const paymentDoc = await db.collection('payments').doc(reference).get();
    if (!paymentDoc.exists) throw new functions.https.HttpsError('not-found', 'Payment not found');
    const paymentData = paymentDoc.data() as any;
    if (paymentData.userId !== userId) throw new functions.https.HttpsError('permission-denied', 'Payment does not belong to user');

    // verify with Paystack
    // Using require for compatibility with CommonJS transpilation target
    const axios = require('axios');
    let response;
    try {
      response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
        timeout: 10000
      });
    } catch (err: any) {
      console.error('verifyPayment: axios error', err?.message || err);
      throw new functions.https.HttpsError('internal', 'Failed to verify payment with provider');
    }

    const paystackData = response.data?.data;
    if (!paystackData) {
      console.error('verifyPayment: unexpected response', response.data);
      throw new functions.https.HttpsError('internal', 'Invalid response from payment provider');
    }

    if (paystackData.status === 'success') {
      await db.collection('payments').doc(reference).update({
        status: 'success',
        paystackReference: paystackData.reference,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        amountPaid: paystackData.amount,
        currency: paystackData.currency
      });

      await db.collection('users').doc(userId).update({
        paymentStatus: true,
        paymentReference: reference,
        paymentVerifiedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log('verifyPayment: success', reference, userId);
      return { success: true, amount: paystackData.amount, currency: paystackData.currency };
    } else {
      console.warn('verifyPayment: not success:', paystackData.status);
      throw new functions.https.HttpsError('failed-precondition', 'Payment verification failed');
    }
  } catch (err: any) {
    console.error('verifyPayment error:', err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('internal', 'Failed to verify payment');
  }
});
