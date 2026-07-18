// App-wide constants live here so there is a single source of truth.

// Route paths. Using constants (instead of typing '/dashboard' everywhere)
// means a typo fails loudly and renaming a route is a one-line change.
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  ONBOARDING: '/onboarding',
  DASHBOARD: '/dashboard',
  SESSION: '/session',
  LEADERBOARD: '/leaderboard',
  PROFILE: '/profile',
  PREMIUM: '/premium',
  GROUPS: '/groups',
};

// Seed list of major Nigerian universities for the onboarding dropdown.
// Users who don't see their school pick "Other" and type it in.
// This is intentionally not exhaustive — it just covers the big ones so most
// students get a one-tap choice.
export const NIGERIAN_UNIVERSITIES = [
  'LASUSTECH — Lagos State University of Science and Technology',
  'UNILAG — University of Lagos',
  'LASU — Lagos State University',
  'UI — University of Ibadan',
  'OAU — Obafemi Awolowo University',
  'UNN — University of Nigeria, Nsukka',
  'ABU — Ahmadu Bello University',
  'UNIBEN — University of Benin',
  'UNILORIN — University of Ilorin',
  'FUTA — Federal University of Technology, Akure',
  'FUTMINNA — Federal University of Technology, Minna',
  'UNIPORT — University of Port Harcourt',
  'BUK — Bayero University Kano',
  'COVENANT — Covenant University',
  'FUNAAB — Federal University of Agriculture, Abeokuta',
  'RSU — Rivers State University',
  'DELSU — Delta State University',
  'EKSU — Ekiti State University',
  'OOU — Olabisi Onabanjo University',
  'UNIABUJA — University of Abuja',
  'Other',
];

// Academic levels used in Nigerian universities (100 Level … 700 Level).
export const ACADEMIC_LEVELS = [
  '100 Level',
  '200 Level',
  '300 Level',
  '400 Level',
  '500 Level',
  '600 Level',
  '700 Level',
  'Postgraduate',
];
