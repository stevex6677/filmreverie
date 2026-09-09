import { defineConfig } from "@playwright/test";

// Isolated worktrees can validate concurrently without reusing another build.
const port = Number(process.env.PLAYWRIGHT_PORT || 5178);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 240000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: "chrome",
    viewport: { width: 1280, height: 800 },
    headless: true,
    launchOptions: {
      args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"],
    },
    video: "on",
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
