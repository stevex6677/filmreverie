import { defineConfig } from "@playwright/test";

// Keep M10 review candidates separate from historical accepted captures.
process.env.REVIEW_ARTIFACTS_DIR ??= "artifacts/m9-m10-candidates/regressions";

const port = Number(process.env.PLAYWRIGHT_PORT || 5178);
const baseURL = `http://127.0.0.1:${port}`;

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
    baseURL,
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
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
