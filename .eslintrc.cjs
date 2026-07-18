// Minimal but useful lint setup for a JS + React project.
// Catches the common mistakes (unused vars, bad hooks usage) without being
// noisy. We disable the "React must be in scope" rule because Vite's JSX
// transform doesn't require importing React.
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules'],
  rules: {
    'react/prop-types': 'off', // We're not using PropTypes in this project.
  },
};
