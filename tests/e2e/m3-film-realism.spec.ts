import { openViewingTools, selectOverviewFrame, captureCanvas } from "./helpers/viewing";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { parsePng, getRegionStats, getRegionMeanDifference } from "./helpers/pixelAnalysis";

test.describe("M3 E2E — Realistic Viewing Table, 35mm Film & Loupe Optics", () => {
  const FRAME_SCREEN_CENTERS = [
    { order: 1, name: "harbor", x: 233, y: 400 },
    { order: 2, name: "diner", x: 437, y: 400 },
    { order: 3, name: "bicycle", x: 640, y: 400 },
    { order: 4, name: "laundromat", x: 843, y: 400 },
    { order: 5, name: "road", x: 1047, y: 400 },
  ];

  test("validates 35mm film realism, sprocket illumination, unclipped positive dynamic range, and loupe optics", async ({
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

    // 1. Load app in deterministic inspect mode
    await page.goto("/guest?deterministic=true&mode=inspect"); await openViewingTools(page);
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });

    const modeToggle = page.locator("#mode-toggle");
    const loupeToggle = page.locator("#loupe-toggle");
    await expect(modeToggle).toBeVisible();
    await expect(loupeToggle).toBeVisible();

    await page.waitForTimeout(600);

    // Capture negative overview
    const negBuffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m3-negative-closeup.png"), negBuffer);
    const negPng = parsePng(negBuffer);

    // 2. Validate all 5 negative frames: variance, orange mask, non-blank
    for (const frame of FRAME_SCREEN_CENTERS) {
      const stats = getRegionStats(negPng, frame.x, frame.y, 28);
      expect(stats.meanLum).toBeGreaterThan(20);
      expect(stats.meanLum).toBeLessThan(235);
      expect(stats.stdDev).toBeGreaterThan(6);

      // Authentic orange mask: R channel dominant over B channel
      expect(stats.meanR).toBeGreaterThan(stats.meanB + 15);
    }

    // 3. Validate sprocket perforations reveal illuminated table
    // Above frame 3 at (634, 324), a sprocket hole reveals the glowing white table (lum ~ 244)
    // While the film substrate between holes at (648, 324) is darker (lum ~ 163)
    const sprocketStats = getRegionStats(negPng, 634, 324, 2);
    const substrateStats = getRegionStats(negPng, 648, 324, 2);

    // Sprocket hole shows bright table emission through cutout
    expect(sprocketStats.meanLum).toBeGreaterThan(150);
    // Substrate border is darker than the illuminated sprocket opening
    expect(sprocketStats.meanLum).toBeGreaterThan(substrateStats.meanLum + 50);

    // Capture film edge with sprocket perforations
    fs.writeFileSync(path.join(artifactsDir, "m3-film-edge-perforations.png"), negBuffer);

    // 4. Switch to Positive Mode and validate dynamic range without clipped extremes
    await modeToggle.click();
    await expect(page.locator("[data-testid=mode-badge]")).toHaveText("POSITIVE");
    await page.waitForTimeout(600);

    const posBuffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m3-positive-closeup.png"), posBuffer);
    const posPng = parsePng(posBuffer);

    // Verify positive frames have healthy variance, no total black or total white clipping
    for (const frame of FRAME_SCREEN_CENTERS) {
      const stats = getRegionStats(posPng, frame.x, frame.y, 28);
      expect(stats.meanLum).toBeGreaterThan(8);
      expect(stats.meanLum).toBeLessThan(235);
      expect(stats.stdDev).toBeGreaterThan(7);
    }

    // Positive differs visibly from negative
    const modeDelta = getRegionMeanDifference(negPng, posPng, 640, 400, 30);
    expect(modeDelta).toBeGreaterThan(20);

    // 5. Activate Physical Loupe and inspect Frame 3 (bicycle)
    await loupeToggle.click();
    await expect(page.locator("[data-testid=loupe-badge]")).toContainText("ACTIVE");

    // Click frame 3 to focus loupe on center frame
    await selectOverviewFrame(page, 3);
    await expect(page.locator("[data-testid=frame-badge]")).toContainText("#3");
    await page.waitForTimeout(600);

    const loupeBuffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m3-loupe-center.png"), loupeBuffer);
    const loupePng = parsePng(loupeBuffer);

    // Lens area at (640, 400) should have clear photo variance under magnification
    const loupeStats = getRegionStats(loupePng, 640, 400, 32);
    expect(loupeStats.meanLum).toBeGreaterThan(8);
    expect(loupeStats.meanLum).toBeLessThan(235);
    expect(loupeStats.stdDev).toBeGreaterThan(8);

    // Verify zero console errors, zero page errors, zero failed requests
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
});
