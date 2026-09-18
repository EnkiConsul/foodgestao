import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { integrationTests } from './scripts/test-suites.mjs';
import { validateTestEnvironment, assertNoProductionReferences } from './scripts/test-target-safety.mjs';

// Checked while loading config, before importing any test or creating a client.
validateTestEnvironment(process.env);
assertNoProductionReferences(path.resolve(__dirname, 'src/test'));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom', globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: integrationTests,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
