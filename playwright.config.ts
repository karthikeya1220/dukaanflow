import { defineConfig } from "@playwright/test";

// M0: config sanity only — E2E specs and webServer wiring land in M8.
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
});
