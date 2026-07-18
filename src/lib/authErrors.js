// Turn raw Firebase Auth error codes into warm, plain-English messages.
//
// The brief is firm on this: users must NEVER see a raw code like
// "auth/invalid-credential". Every message here is written for a stressed
// student on a shaky connection, and suggests what to do next.

const MESSAGES = {
  'auth/invalid-email': 'That email address doesn’t look right. Please check it.',
  'auth/user-disabled': 'This account has been disabled. Contact support if you think this is a mistake.',
  'auth/user-not-found': 'We couldn’t find an account with that email. Want to register instead?',
  'auth/wrong-password': 'Wrong email or password. Please try again.',
  'auth/invalid-credential': 'Wrong email or password. Please try again.',
  'auth/email-already-in-use': 'That email is already registered. Try logging in instead.',
  'auth/weak-password': 'Please use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a minute and try again.',
  'auth/network-request-failed': 'Network problem. Check your connection and try again.',
  'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled. Please try again.',
  'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups and try again.',
};

export function friendlyAuthError(error) {
  const code = error?.code;
  if (code && MESSAGES[code]) return MESSAGES[code];
  // Fallback: never leak the raw code to the user.
  return 'Something went wrong. Please try again.';
}
