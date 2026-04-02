import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.js'],
    include: [
      'src/__tests__/**/*.test.{js,jsx}',
      'hub/tests/**/*.test.js',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: [
        'src/utils/**',
        'hub/app.js',
        'server.js',
      ],
      exclude: ['node_modules', 'dist'],
    },
  },
});
