import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { parsePng, getRegionStats, getRegionMeanDifference } from "./helpers/pixelAnalysis";

test.describe("M1 E2E — Five-Photo Darkroom Film Viewer", () => {
  const FRAME_SCREEN_CENTERS = [
    { order: 1, name: "harbor", x: 233, y: 400 },
    { order: 2, name: "diner", x: 437, y: 400 },
    { order: 3, name: "bicycle", x: 640, y: 400 },
    { order: 4, name: "laundromat", x: 843, y: 400 },
    { order: 5, name: "road", x: 1047, y: 400 },
  ];
  const TABLE_BG_POINT = { x: 640, y: 200 };

  test("loads production app and all 5 assets with zero errors", async ({ page }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    const loadedImages: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("requestfailed", (req) => failedRequests.push(req.url()));
    page.on("response", (res) => {
      if (res.url().includes("/assets/photos/") && res.status() === 200) {
        loadedImages.push(res.url());
      }
    });

    await page.goto("/?deterministic=true");

    const modeToggle = page.locator("#mode-toggle");
    await expect(modeToggle).toBeVisible({ timeout: 15000 });
    await expect(modeToggle).toHaveText("Switch to Positive");

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();

    // Verify all 5 photo assets loaded successfully
    await expect.poll(() => loadedImages.length, { timeout: 10000 }).toBeGreaterThanOrEqual(5);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test("validates nonblank frames, variance, table contrast, mode toggle, and loupe journey", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("requestfailed", (req) => failedRequests.push(req.url()));

    await page.goto("/?deterministic=true");

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();

    const modeToggle = page.locator("#mode-toggle");
    const loupeToggle = page.locator("#loupe-toggle");
    await expect(modeToggle).toBeVisible();
    await expect(loupeToggle).toBeVisible();

    // Wait a brief moment for WebGL initial draw
    await page.waitForTimeout(600);

    // 1. Capture initial negative state
    const artifactsDir = path.resolve(process.cwd(), "artifacts");
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    const negBuffer = await canvas.screenshot();
    fs.writeFileSync(path.join(artifactsDir, "m1-negative-overview.png"), negBuffer);
    const negPng = parsePng(negBuffer);

    // Measure table background
    const bgStats = getRegionStats(negPng, TABLE_BG_POINT.x, TABLE_BG_POINT.y, 24);
    expect(bgStats.meanLum).toBeGreaterThan(150); // Illuminated surface

    // Verify all 5 frames are nonblank, have variance, and differ from background
    for (const frame of FRAME_SCREEN_CENTERS) {
      const stats = getRegionStats(negPng, frame.x, frame.y, 28);

      // Nonblank check (not solid black or clipped white)
      expect(stats.meanLum).toBeGreaterThan(15);
      expect(stats.meanLum).toBeLessThan(235);

      // Variance check: genuine photo content, not a uniform color patch
      expect(stats.stdDev).toBeGreaterThan(5);

      // Contrast with illuminated table
      const diffFromBg = Math.abs(stats.meanLum - bgStats.meanLum);
      expect(diffFromBg).toBeGreaterThan(20);

      // Orange mask check in negative mode (R > B by significant margin)
      expect(stats.meanR).toBeGreaterThan(stats.meanB + 15);
    }

    // 2. Switch to Positive Mode
    await modeToggle.click();
    await expect(page.locator("[data-testid=mode-badge]")).toHaveText("POSITIVE");
    await expect(modeToggle).toHaveText("Switch to Negative");
    await page.waitForTimeout(600);

    const posBuffer = await canvas.screenshot();
    fs.writeFileSync(path.join(artifactsDir, "m1-positive-overview.png"), posBuffer);
    const posPng = parsePng(posBuffer);

    // Verify meaningful pixel change inside each frame
    for (const frame of FRAME_SCREEN_CENTERS) {
      const pixelDelta = getRegionMeanDifference(negPng, posPng, frame.x, frame.y, 30);
      expect(pixelDelta).toBeGreaterThan(20); // Substantial visual reveal
    }

    // Switch back to Negative Mode
    await modeToggle.click();
    await expect(page.locator("[data-testid=mode-badge]")).toHaveText("NEGATIVE");
    await page.waitForTimeout(600);

    // 3. Activate Loupe and inspect frames 1, 3, and 5
    await loupeToggle.click();
    await expect(page.locator("[data-testid=loupe-badge]")).toContainText("ACTIVE");
    await expect(loupeToggle).toHaveText("Rest Loupe");

    // Move loupe to Frame 1
    const frame1Btn = page.locator("[data-testid=frame-btn-1]");
    await frame1Btn.click();
    await expect(page.locator("[data-testid=frame-badge]")).toContainText("#1");
    await page.waitForTimeout(500);

    const frame1Buffer = await canvas.screenshot();
    fs.writeFileSync(path.join(artifactsDir, "m1-loupe-frame1.png"), frame1Buffer);
    const frame1Png = parsePng(frame1Buffer);
    const frame1LensStats = getRegionStats(frame1Png, FRAME_SCREEN_CENTERS[0].x, FRAME_SCREEN_CENTERS[0].y, 30);
    expect(frame1LensStats.meanLum).toBeGreaterThan(30);
    expect(frame1LensStats.meanLum).toBeLessThan(230);
    expect(frame1LensStats.stdDev).toBeGreaterThan(1.0);
    const diffOverviewFrame1 = getRegionMeanDifference(negPng, frame1Png, FRAME_SCREEN_CENTERS[0].x, FRAME_SCREEN_CENTERS[0].y, 60);
    expect(diffOverviewFrame1).toBeGreaterThan(8);

    // Move loupe to Frame 3
    const frame3Btn = page.locator("[data-testid=frame-btn-3]");
    await frame3Btn.click();
    await expect(page.locator("[data-testid=frame-badge]")).toContainText("#3");
    await page.waitForTimeout(500);

    const frame3Buffer = await canvas.screenshot();
    fs.writeFileSync(path.join(artifactsDir, "m1-loupe-frame3.png"), frame3Buffer);
    const frame3Png = parsePng(frame3Buffer);
    const frame3LensStats = getRegionStats(frame3Png, FRAME_SCREEN_CENTERS[2].x, FRAME_SCREEN_CENTERS[2].y, 30);
    expect(frame3LensStats.meanLum).toBeGreaterThan(30);
    expect(frame3LensStats.meanLum).toBeLessThan(230);
    expect(frame3LensStats.stdDev).toBeGreaterThan(1.0);
    const diffOverviewFrame3 = getRegionMeanDifference(negPng, frame3Png, FRAME_SCREEN_CENTERS[2].x, FRAME_SCREEN_CENTERS[2].y, 60);
    expect(diffOverviewFrame3).toBeGreaterThan(4);

    // Move loupe to Frame 5
    const frame5Btn = page.locator("[data-testid=frame-btn-5]");
    await frame5Btn.click();
    await expect(page.locator("[data-testid=frame-badge]")).toContainText("#5");
    await page.waitForTimeout(500);

    const frame5Buffer = await canvas.screenshot();
    fs.writeFileSync(path.join(artifactsDir, "m1-loupe-frame5.png"), frame5Buffer);
    const frame5Png = parsePng(frame5Buffer);
    const frame5LensStats = getRegionStats(frame5Png, FRAME_SCREEN_CENTERS[4].x, FRAME_SCREEN_CENTERS[4].y, 30);
    expect(frame5LensStats.meanLum).toBeGreaterThan(30);
    expect(frame5LensStats.meanLum).toBeLessThan(230);
    expect(frame5LensStats.stdDev).toBeGreaterThan(1.0);
    const diffOverviewFrame5 = getRegionMeanDifference(negPng, frame5Png, FRAME_SCREEN_CENTERS[4].x, FRAME_SCREEN_CENTERS[4].y, 60);
    expect(diffOverviewFrame5).toBeGreaterThan(8);

    // Assert visible lens changes across frames
    const diff13 = getRegionMeanDifference(frame1Png, frame3Png, FRAME_SCREEN_CENTERS[0].x, FRAME_SCREEN_CENTERS[0].y, 60);
    expect(diff13).toBeGreaterThan(8);
    const diff35 = getRegionMeanDifference(frame3Png, frame5Png, FRAME_SCREEN_CENTERS[4].x, FRAME_SCREEN_CENTERS[4].y, 60);
    expect(diff35).toBeGreaterThan(8);

    // 4. Test pointer canvas interaction directly
    const box = await canvas.boundingBox();
    if (box) {
      // Hover over Frame 2 coordinates on canvas
      await page.mouse.move(box.x + FRAME_SCREEN_CENTERS[1].x, box.y + FRAME_SCREEN_CENTERS[1].y);
      await page.waitForTimeout(300);
      await expect(page.locator("[data-testid=frame-badge]")).toContainText("#2");
    }

    // Confirm no errors
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test("reloads and repeats the core journey successfully", async ({ page }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("requestfailed", (req) => failedRequests.push(req.url()));

    await page.goto("/?deterministic=true");

    const modeToggle = page.locator("#mode-toggle");
    const loupeToggle = page.locator("#loupe-toggle");
    await expect(modeToggle).toBeVisible();

    // Reload page
    await page.reload();
    await expect(modeToggle).toBeVisible();
    await expect(page.locator("[data-testid=mode-badge]")).toHaveText("NEGATIVE");

    // Perform journey again
    await modeToggle.click();
    await expect(page.locator("[data-testid=mode-badge]")).toHaveText("POSITIVE");

    await loupeToggle.click();
    await expect(page.locator("[data-testid=loupe-badge]")).toContainText("ACTIVE");

    await page.locator("[data-testid=frame-btn-4]").click();
    await expect(page.locator("[data-testid=frame-badge]")).toContainText("#4");

    // Switch back to negative
    await modeToggle.click();
    await expect(page.locator("[data-testid=mode-badge]")).toHaveText("NEGATIVE");

    // Zero errors
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
});
