import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],

  // Bake VITE_BRIDGE_URL into the bundle at build time.
  // • dev  → '' — Vite's proxy forwards /api/* to localhost:3001 transparently
  // • prod → '' — bridge routes are on the SAME origin (hub-server mounts them)
  // Override via env var only if you run the bridge on a separate host/port.
  define: {
    'import.meta.env.VITE_BRIDGE_URL': JSON.stringify(
      process.env.VITE_BRIDGE_URL ?? ''
    ),
    // Base URL for the Community Hub API. '' = same origin (default).
    // Set to point at a hosted hub when running the frontend standalone.
    'import.meta.env.VITE_HUB_URL': JSON.stringify(
      process.env.VITE_HUB_URL ?? ''
    ),
  },

  server: {
    proxy: {
      // Community hub API (port 3002) — must be matched first
      '/api/hub': { target: 'http://localhost:3002', changeOrigin: true },
      // Local MSSQL bridge API (port 3001)
      '/api':     { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('reactflow'))      return 'reactflow';
          if (id.includes('react-dom') ||
              id.includes('react/') ||
              id.includes('framer-motion')) return 'vendor';
        },
      },
    },
  },
}));
