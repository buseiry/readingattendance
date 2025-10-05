"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPayment = exports.createPayment = exports.endSession = exports.resumeSession = exports.pauseSession = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
// Wire in session controls implemented in a separate module
const sessionControls_1 = require("./sessionControls");
Object.defineProperty(exports, "pauseSession", { enumerable: true, get: function () { return sessionControls_1.pauseSessionSimple; } });
Object.defineProperty(exports, "resumeSession", { enumerable: true, get: function () { return sessionControls_1.resumeSessionSimple; } });
Object.defineProperty(exports, "endSession", { enumerable: true, get: function () { return sessionControls_1.endSessionSimple; } });
// Hardened payment functions
exports.createPayment = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    try {
        const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
        if (!PAYSTACK_SECRET_KEY) {
            console.error('createPayment: PAYSTACK_SECRET_KEY not set in environment');
            throw new functions.https.HttpsError('failed-precondition', 'Payment system not configured');
        }
        const userId = context.auth.uid;
        const { email, amount } = data;
        if (!email || !amount)
            throw new functions.https.HttpsError('invalid-argument', 'email and amount are required');
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
    }
    catch (err) {
        console.error('createPayment error:', err);
        if (err instanceof functions.https.HttpsError)
            throw err;
        throw new functions.https.HttpsError('internal', 'Failed to create payment');
    }
});
exports.verifyPayment = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    try {
        const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
        if (!PAYSTACK_SECRET_KEY) {
            console.error('verifyPayment: PAYSTACK_SECRET_KEY not set');
            throw new functions.https.HttpsError('failed-precondition', 'Payment backend not configured');
        }
        const userId = context.auth.uid;
        const { reference } = data;
        if (!reference)
            throw new functions.https.HttpsError('invalid-argument', 'reference is required');
        const paymentDoc = await db.collection('payments').doc(reference).get();
        if (!paymentDoc.exists)
            throw new functions.https.HttpsError('not-found', 'Payment not found');
        const paymentData = paymentDoc.data();
        if (paymentData.userId !== userId)
            throw new functions.https.HttpsError('permission-denied', 'Payment does not belong to user');
        // verify with Paystack
        // Using require for compatibility with CommonJS transpilation target
        const axios = require('axios');
        let response;
        try {
            response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
                headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
                timeout: 10000
            });
        }
        catch (err) {
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
        }
        else {
            console.warn('verifyPayment: not success:', paystackData.status);
            throw new functions.https.HttpsError('failed-precondition', 'Payment verification failed');
        }
    }
    catch (err) {
        console.error('verifyPayment error:', err);
        if (err instanceof functions.https.HttpsError)
            throw err;
        throw new functions.https.HttpsError('internal', 'Failed to verify payment');
    }
});
