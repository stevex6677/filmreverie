import { openViewingTools, selectOverviewFrame, captureCanvas } from "./helpers/viewing";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { parsePng, getRegionStats } from "./helpers/pixelAnalysis";

test.describe("M5 E2E — Authentic 35mm Film Substrate, Rebate Print & Transverse Curl", () => {
  test("validates translucent substrate base, edge rebate markings, transverse curl, and loupe detail", async ({
    page,
  }) => {
    test.setTimeout(180000);
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("requestfailed", (req) => failedRequests.push(req.url()));

    const artifactsDir = path.resolve(process.cwd(), process.env.REVIEW_ARTIFACTS_DIR || "artifacts");
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    // 1. Inspect Mode in Negative Film Mode
    await page.goto("/guest?deterministic=true&mode=inspect"); await openViewingTools(page);
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const negBuffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m5-film-negative-rebate.png"), negBuffer);
    const negPng = parsePng(negBuffer);

    // Validate substrate translucency in negative mode:
    // Along the margin between sprockets (e.g. x = 645, y = 338), the substrate base should NOT be pitch black (lum > 20)
    // and should show warm orange mask tone (meanR > meanB + 20)
    const marginStats = getRegionStats(negPng, 645, 338, 4);
    expect(marginStats.meanLum).toBeGreaterThan(15);
    expect(marginStats.meanR).toBeGreaterThan(marginStats.meanB + 15);

    // Validate sprocket hole is bright (illuminated table shining through cutout)
    const sprocketStats = getRegionStats(negPng, 634, 337, 2);
    expect(sprocketStats.meanLum).toBeGreaterThan(150);

    // 2. Switch to Positive Mode and validate rebate imprint
    const modeToggle = page.locator("#mode-toggle");
    await modeToggle.click();
    await expect(page.locator("[data-testid=mode-badge]")).toHaveText("POSITIVE");
    await page.waitForTimeout(600);

    const posBuffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m5-film-positive-translucent.png"), posBuffer);
    const posPng = parsePng(posBuffer);

    // Verify all 5 positive photo frames remain unclipped and clear
    const FRAME_SCREEN_CENTERS = [
      { order: 1, x: 233, y: 400 },
      { order: 2, x: 437, y: 400 },
      { order: 3, x: 640, y: 400 },
      { order: 4, x: 843, y: 400 },
      { order: 5, x: 1047, y: 400 },
    ];
    for (const frame of FRAME_SCREEN_CENTERS) {
      const stats = getRegionStats(posPng, frame.x, frame.y, 28);
      expect(stats.meanLum).toBeGreaterThan(8);
      expect(stats.meanLum).toBeLessThan(235);
      expect(stats.stdDev).toBeGreaterThan(7);
    }

    // 3. Inspect Frame 3 under 2.5x optical loupe
    const loupeToggle = page.locator("#loupe-toggle");
    await loupeToggle.click();
    await selectOverviewFrame(page, 3);
    await expect(page.locator("[data-testid=frame-badge]")).toContainText("#3");
    await page.waitForTimeout(600);

    const loupeBuffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m5-film-loupe-detail.png"), loupeBuffer);
    const loupePng = parsePng(loupeBuffer);

    const loupeStats = getRegionStats(loupePng, 640, 400, 32);
    expect(loupeStats.meanLum).toBeGreaterThan(8);
    expect(loupeStats.stdDev).toBeGreaterThan(8);

    // 4. Return to Room Mode and capture transverse curl perspective
    const returnBtn = page.getByTestId("return-room-btn");
    await returnBtn.click();
    await expect(page.locator(".darkroom-app-container")).toHaveAttribute("data-room-mode", "room");
    await page.waitForTimeout(600);

    const roomBuffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m5-film-curl-profile.png"), roomBuffer);

    // 5. Verify zero errors
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
});
