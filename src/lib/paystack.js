// Paystack Inline helper. Loads the checkout script on demand (keeping it out
// of the initial bundle) and opens the payment popup.
//
// The public key is safe to ship to the browser (that's its purpose). The
// SECRET key never touches client code — it lives only in Cloud Functions.

export const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';
export const PREMIUM_AMOUNT_KOBO = 100000; // ₦1,000

// True once you've configured a public key. Until then the UI shows a friendly
// "not available yet" state instead of a broken button.
export const paystackConfigured = Boolean(PAYSTACK_PUBLIC_KEY);

// A unique, traceable reference. Embedding the uid lets us tie a payment back
// to an account even from the webhook.
export function makeReference(uid) {
  return `RS-${uid}-${Date.now()}`;
}

// Lazy-load the Paystack Inline script once.
function loadPaystackScript() {
  if (window.PaystackPop) return Promise.resolve(window.PaystackPop);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-paystack]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.PaystackPop));
      existing.addEventListener('error', () => reject(new Error('paystack-load-failed')));
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://js.paystack.co/v1/inline.js';
    s.dataset.paystack = 'true';
    s.onload = () => resolve(window.PaystackPop);
    s.onerror = () => reject(new Error('paystack-load-failed'));
    document.body.appendChild(s);
  });
}

// Opens the checkout popup. `onSuccess(reference)` fires after the user pays;
// `onCancel()` fires if they close the popup. Verification still happens
// server-side — a client "success" is only a hint to go verify.
export async function openCheckout({ email, reference, onSuccess, onCancel }) {
  const Paystack = await loadPaystackScript();
  const handler = Paystack.setup({
    key: PAYSTACK_PUBLIC_KEY,
    email,
    amount: PREMIUM_AMOUNT_KOBO,
    currency: 'NGN',
    ref: reference,
    callback: (response) => onSuccess(response.reference),
    onClose: () => onCancel?.(),
  });
  handler.openIframe();
}
