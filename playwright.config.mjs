import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL || "https://localhost:3443", channel: process.env.E2E_BROWSER_CHANNEL || undefined, ignoreHTTPSErrors: true },
  reporter: "list",
});
