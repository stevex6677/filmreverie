import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5178",
    channel: "chrome",
    viewport: { width: 1280, height: 800 },
    headless: true,
    launchOptions: {
      args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"],
    },
    video: "on",
  },
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:5178",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
