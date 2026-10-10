import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    host: true,
    // Overridable so two checkouts can run their test suites side by side without one
    // quietly reusing the other's dev server.
    port: Number(process.env.PORT) || 3000,
    strictPort: true,
  },
});
