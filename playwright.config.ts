import { defineConfig } from "@playwright/test";

// Keep M10 review candidates separate from historical accepted captures.
process.env.REVIEW_ARTIFACTS_DIR ??= "artifacts/m9-m10-candidates/regressions";

const port = Number(process.env.PLAYWRIGHT_PORT || 5178);
const baseURL = `http://127.0.0.1:${port}`;

// Routine checks use assertions and screenshots. Record only selected review
// or diagnostic runs, e.g. PLAYWRIGHT_VIDEO=on npm run test:e2e -- m16-table-view.
const video = process.env.PLAYWRIGHT_VIDEO ?? "off";
if (video !== "off" && video !== "on") {
  throw new Error("PLAYWRIGHT_VIDEO must be off or on.");
}

// Chrome's software WebGL renderer uses multiple CPU threads per worker.
// Four browsers are a starting point on the 64-logical-CPU remote host;
// override for the available capacity, including through npm run validate:mN.
const workerSetting = (process.env.PLAYWRIGHT_WORKERS ?? "4").trim();
if (!/^[1-9]\d*%?$/.test(workerSetting)) {
  throw new Error("PLAYWRIGHT_WORKERS must be a positive integer or CPU percentage (for example 4 or 50%).");
}
const workers = workerSetting.endsWith("%")
  ? workerSetting as `${number}%`
  : Number(workerSetting);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || "test-results",
  timeout: 240000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: true,
  workers,
  reporter: [["list"]],
  projects: [
    { name: 'desktop', testIgnore: /m15-.*\.spec\.ts/, use:{channel:'chrome'} },
    { name: 'mobile-chrome', testMatch: /m(?:15|16)-.*\.spec\.ts/, use: { channel:'chrome', viewport: {width:390,height:844}, hasTouch:true, isMobile:true, deviceScaleFactor:1 } },
    { name: 'mobile-webkit', testMatch: /m(?:15|16)-.*\.spec\.ts/, testIgnore: /m15-touch-input\.spec\.ts/, use: { browserName:'webkit', channel:undefined, launchOptions:{args:[]}, viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1 } },
  ],
  use: {
    baseURL,
    viewport: { width: 1280, height: 800 },
    headless: true,
    launchOptions: {
      args: [
        "--use-gl=angle",
        ...(process.platform === "linux" ? ["--use-angle=vulkan"] : []),
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--enable-gpu-rasterization",
      ],
    },
    video,
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
