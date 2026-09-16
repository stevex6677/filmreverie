import { dragLoupeTo, openViewingTools, captureCanvas } from "./helpers/viewing";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { parsePng, getRegionStats, getRegionMeanDifference } from "./helpers/pixelAnalysis";

test.describe("M8 E2E — Continuous Light Table Dimmer & Physical Optical Loupe", () => {
  test("validates continuous 30%–100% brightness slider and physical optical magnification over photos, rebates, sprockets, and table", async ({
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

    // 1. Load production application directly into table inspection mode
    await page.goto("/?deterministic=true&mode=inspect"); await openViewingTools(page);

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });

    const roomBadge = page.locator("main");
    await expect(roomBadge).toHaveAttribute("data-room-mode", "inspect");

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

    // 2. Test Continuous Brightness Dimmer (30% to 100%)
    await page.waitForTimeout(500);
    const bright100Buffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m8-brightness-100.png"), bright100Buffer);
    const bright100Png = parsePng(bright100Buffer);
    const stats100 = getRegionStats(bright100Png, 640, 220, 30);

    // Smoothly drag / set slider down to 40%
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = "0.40";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(400);
    await expect(brightnessBadge).toHaveText("40%");

    const bright40Buffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m8-brightness-40.png"), bright40Buffer);
    const bright40Png = parsePng(bright40Buffer);
    const stats40 = getRegionStats(bright40Png, 640, 220, 30);

    // 40% brightness must have measurably lower luminance than 100%
    expect(stats40.meanLum).toBeLessThan(stats100.meanLum);
    const dimDiff = getRegionMeanDifference(bright40Png, bright100Png, 640, 220, 30);
    expect(dimDiff).toBeGreaterThan(12);

    // Restore brightness to 100% for loupe inspection tests
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = "1.00";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(300);
    await expect(brightnessBadge).toHaveText("100%");

    // 3. Test Physical Optical Loupe
    const loupeToggle = page.locator("[data-testid=loupe-toggle]");
    await expect(loupeToggle).toBeVisible();
    await loupeToggle.click();
    await page.waitForTimeout(400);

    const loupeBadge = page.locator("[data-testid=loupe-badge]");
    await expect(loupeBadge).toContainText("ACTIVE");

    // Select 4x magnification
    const mag4Btn = page.locator("[data-testid=mag-btn-4x]");
    await expect(mag4Btn).toBeVisible();
    await mag4Btn.click();
    await page.waitForTimeout(300);
    await expect(loupeBadge).toHaveText("ACTIVE (4×)");

    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      // A. Move Loupe over Frame 3 (bicycle photograph)
      await dragLoupeTo(page, 640, 400);
      await page.waitForTimeout(400);
      const photoBuffer = await captureCanvas(page);
      fs.writeFileSync(path.join(artifactsDir, "m8-loupe-photo.png"), photoBuffer);
      const photoPng = parsePng(photoBuffer);

      // Verify nonblank photo rendering inside the optical lens
      const photoStats = getRegionStats(photoPng, 640, 400, 30);
      expect(photoStats.meanLum).toBeGreaterThan(20);
      expect(photoStats.variance).toBeGreaterThan(5);

      // B. Move Loupe over Sprocket Hole (perforation showing glowing table underneath)
      await dragLoupeTo(page, 640, 350);
      await page.waitForTimeout(400);
      const sprocketBuffer = await captureCanvas(page);
      fs.writeFileSync(path.join(artifactsDir, "m8-loupe-sprocket.png"), sprocketBuffer);
      const sprocketPng = parsePng(sprocketBuffer);

      // Sprocket region has high visual contrast against solid photo
      const sprocketDiff = getRegionMeanDifference(photoPng, sprocketPng, 640, 375, 40);
      expect(sprocketDiff).toBeGreaterThan(5);

      // C. Move Loupe over Film Rebate Border (edge marking & frame numbers)
      await dragLoupeTo(page, 640, 336);
      await page.waitForTimeout(400);
      const rebateBuffer = await captureCanvas(page);
      fs.writeFileSync(path.join(artifactsDir, "m8-loupe-rebate.png"), rebateBuffer);
      const rebatePng = parsePng(rebateBuffer);

      const rebateDiff = getRegionMeanDifference(sprocketPng, rebatePng, 640, 340, 30);
      expect(rebateDiff).toBeGreaterThan(3);

      // D. Move Loupe off-strip onto light table acrylic surface
      await dragLoupeTo(page, 640, 200);
      await page.waitForTimeout(400);
      const tableBuffer = await captureCanvas(page);
      fs.writeFileSync(path.join(artifactsDir, "m8-loupe-table.png"), tableBuffer);
      const tablePng = parsePng(tableBuffer);

      // Illuminated table through lens has high luminance and neutral color
      const tableStats = getRegionStats(tablePng, 640, 200, 30);
      expect(tableStats.meanLum).toBeGreaterThan(120);
      expect(Math.abs(tableStats.meanR - tableStats.meanB)).toBeLessThan(12);

      // Rest the loupe
      await loupeToggle.click();
      await page.waitForTimeout(300);
      await expect(loupeBadge).toHaveText("RESTING");
    }

    // Baseline validation: zero unhandled errors
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
});
