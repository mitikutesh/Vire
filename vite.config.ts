// `defineConfig` from vitest/config re-exports Vite's own and adds typing for
// the `test` block, so the config stays a single file.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // Pure static output: S3 + CloudFront serve this directly, and the same
    // bundle is what Capacitor wraps in M6. No server rendering anywhere.
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Vitest stubs CSS imports to empty by default; the design-token test
    // reads index.css via `?raw` to assert the locked palette is present and
    // the retired green accent is not.
    css: true,
    // Playwright owns e2e/; vitest must not try to run those specs.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', '.sst/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.test.{ts,tsx}', 'src/main.tsx'],
    },
  },
});
