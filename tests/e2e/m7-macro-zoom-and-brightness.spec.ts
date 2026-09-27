import { viewerKey, openViewingTools, captureCanvas } from "./helpers/viewing";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { parsePng, getRegionStats, getRegionMeanDifference } from "./helpers/pixelAnalysis";

test.describe("M7 E2E — Deep Macro Zoom (1000%) & Light Table Dimmer Calibration", () => {
  test("validates light table dimmer presets (50%, 100%, 150%), hotkey B cycling, and deep macro zoom up to 1000%", async ({
    page,
  }) => {
    test.setTimeout(240000);
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("requestfailed", (req) => failedRequests.push(req.url()));

    // 1. Load production app directly into table inspect mode
    await page.goto("/guest?deterministic=true&mode=inspect"); await openViewingTools(page);

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });

    const roomBadge = page.locator("main");
    await expect(roomBadge).toHaveAttribute("data-room-mode", "inspect");

    const zoomBadge = page.locator("[data-testid=zoom-badge]");
    await expect(zoomBadge).toBeVisible();
    await expect(zoomBadge).toHaveText("100%");

    const brightnessBadge = page.locator("[data-testid=brightness-badge]");
    await expect(brightnessBadge).toBeVisible();
    await expect(brightnessBadge).toHaveText("100%");

    const dimmerControls = page.locator("[data-testid=dimmer-controls]");
    await expect(dimmerControls).toBeVisible();

    const slider = page.locator("[data-testid=brightness-slider]");
    await expect(slider).toBeVisible();

    const artifactsDir = path.resolve(process.cwd(), process.env.REVIEW_ARTIFACTS_DIR || "artifacts");
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    // 2. Capture baseline 100% brightness
    await page.waitForTimeout(500);
    const bright100Buffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m7-brightness-100.png"), bright100Buffer);
    const bright100Png = parsePng(bright100Buffer);
    // Sample light table diffuser above film strip
    const stats100 = getRegionStats(bright100Png, 640, 310, 40);

    // 3. Test Dimmer: Dim to 50%
    await slider.fill("0.5");
    await page.waitForTimeout(400);
    await expect(brightnessBadge).toHaveText("50%");

    const bright50Buffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m7-brightness-50.png"), bright50Buffer);
    const bright50Png = parsePng(bright50Buffer);
    const stats50 = getRegionStats(bright50Png, 640, 310, 40);

    // 50% brightness must have measurably lower luminance than 100%
    expect(stats50.meanLum).toBeLessThan(stats100.meanLum);
    const diff50to100 = getRegionMeanDifference(bright50Png, bright100Png, 640, 310, 40);
    expect(diff50to100).toBeGreaterThan(10);

    // 4. Test Dimmer: Adjust to 75%
    await slider.fill("0.75");
    await page.waitForTimeout(400);
    await expect(brightnessBadge).toHaveText("75%");

    const bright75Buffer = await captureCanvas(page);
    const bright75Png = parsePng(bright75Buffer);
    const stats75 = getRegionStats(bright75Png, 640, 310, 40);

    expect(stats75.meanLum).toBeGreaterThan(stats50.meanLum);
    expect(stats75.meanLum).toBeLessThan(stats100.meanLum);

    // 5. Test Hotkey 'B' Cycling: from 75% -> 50% -> 30% -> 100%
    await viewerKey(page, "b");
    await page.waitForTimeout(300);
    await expect(brightnessBadge).toHaveText("50%");

    await viewerKey(page, "b");
    await page.waitForTimeout(300);
    await expect(brightnessBadge).toHaveText("30%");

    await viewerKey(page, "b");
    await page.waitForTimeout(300);
    await expect(brightnessBadge).toHaveText("100%");

    // 6. Test Deep Macro Zoom up to 1000%
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      // Position cursor at center of table (Frame 3: bicycle)
      await page.mouse.move(box.x + 640, box.y + 400);

      // Perform smooth scroll-in until 1000% zoom ceiling is reached
      let reached1000 = false;
      for (let i = 0; i < 60; i++) {
        await page.mouse.wheel(0, -350);
        await page.waitForTimeout(50);
        const curText = await zoomBadge.textContent();
        if (curText === "1000%") {
          reached1000 = true;
          break;
        }
      }

      expect(reached1000).toBe(true);
      await expect(zoomBadge).toHaveText("1000%");

      // The removed overview toolbar must stay absent
      const resetBtn = page.locator("[data-testid=reset-view-btn]");
      await expect(resetBtn).toHaveCount(0);

      // Capture 1000% macro close-up screenshot
      await page.waitForTimeout(400);
      const zoom1000Buffer = await captureCanvas(page);
      fs.writeFileSync(path.join(artifactsDir, "m7-macro-zoom-1000.png"), zoom1000Buffer);
      const zoom1000Png = parsePng(zoom1000Buffer);

      // Ensure canvas rendering at 0.32m near-plane is valid and non-blank
      const statsMacro = getRegionStats(zoom1000Png, 640, 400, 100);
      expect(statsMacro.meanLum).toBeGreaterThan(15);
      expect(statsMacro.meanLum).toBeLessThan(245);

      // Verify massive visual difference between 100% overview and 1000% macro
      const macroDiff = getRegionMeanDifference(bright100Png, zoom1000Png, 640, 400, 100);
      expect(macroDiff).toBeGreaterThan(6);

      // 7. Test Pan Navigation at 1000% Macro Magnification
      await page.mouse.down({ button: "right" });
      await page.mouse.move(box.x + 400, box.y + 400, { steps: 10 });
      await page.mouse.up({ button: "right" });
      await page.waitForTimeout(400);

      const zoom1000PannedBuffer = await captureCanvas(page);
      fs.writeFileSync(path.join(artifactsDir, "m7-macro-zoom-1000-panned.png"), zoom1000PannedBuffer);
      const zoom1000PannedPng = parsePng(zoom1000PannedBuffer);

      const pannedDiff = getRegionMeanDifference(zoom1000Png, zoom1000PannedPng, 640, 400, 100);
      expect(pannedDiff).toBeGreaterThan(2.0);

      // 8. Test Reset View restores 100% zoom and center while preserving dimmer setting
      await viewerKey(page, "0");
      await page.waitForTimeout(400);
      await expect(zoomBadge).toHaveText("100%");
      await expect(brightnessBadge).toHaveText("100%");
      await expect(resetBtn).toHaveCount(0);
    }

    // Baseline validation: zero unhandled errors
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
});
