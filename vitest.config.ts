import { defineConfig, configDefaults } from "vitest/config";
import { integrationTests } from './scripts/test-suites.mjs';
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [...configDefaults.exclude, ...integrationTests],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
