import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config. We keep it minimal for now.
//
// The `manualChunks` split below is a head start on the Phase 5 bundle-size
// goal (<200KB gzipped initial load): it pushes the heavy Firebase SDK into its
// own chunk so the browser can cache it separately and so route-level code
// splitting (React.lazy) can keep the first paint small. This does not hurt
// anything today and saves us re-architecting later.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
