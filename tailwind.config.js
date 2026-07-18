/** @type {import('tailwindcss').Config} */
//
// Design commitment (see the brief's "Design direction"):
//   - Typeface: a native system-font stack. On cheap Android phones over
//     expensive data, shipping zero font bytes is the single biggest, cheapest
//     performance win we can make. It still looks clean and modern.
//   - Accent: one calm emerald. It reads as "growth / streaks" without the
//     aggressive gradients the brief asks us to avoid.
//   - Neutrals: slate. Works for both the light UI and the dark session screen.
//
// `darkMode: 'class'` lets us force dark mode on the session screen later
// (Phase 2) by toggling a class, while everything else respects the user's
// system preference.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Our single accent colour, from muted to deep.
        accent: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
