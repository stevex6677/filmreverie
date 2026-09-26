import { viewerKey, openViewingTools, captureCanvas } from "./helpers/viewing";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { parsePng, getRegionStats } from "./helpers/pixelAnalysis";

test.describe("M4 E2E — Darkroom Realism & Production Hardening", () => {
  test("validates error recovery, reduced motion, keyboard controls, viewports, and darkroom atmosphere", async ({
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

    const artifactsDir = path.resolve(process.cwd(), process.env.REVIEW_ARTIFACTS_DIR || "artifacts");
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    // 1. Error boundary & retry recovery journey
    await page.goto("/guest?test_error=1");
    const errorBanner = page.locator("[data-testid=error-banner]");
    await expect(errorBanner).toBeVisible({ timeout: 10000 });
    await expect(errorBanner).toContainText("Darkroom Emulsion Failure");

    const errorScreenshot = await page.screenshot();
    fs.writeFileSync(path.join(artifactsDir, "m4-darkroom-error-recovery.png"), errorScreenshot);

    const retryBtn = page.locator("#retry-btn");
    await expect(retryBtn).toBeVisible();
    await retryBtn.click();

    // Verify recovery: error banner disappears, canvas becomes visible
    await expect(errorBanner).toBeHidden({ timeout: 15000 });
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });

    // 2. Reduced motion path
    await page.goto("/guest?reduced_motion=true&mode=room");
    await expect(canvas).toBeVisible({ timeout: 15000 });
    const appContainer = page.locator(".darkroom-app-container");
    await expect(appContainer).toHaveAttribute("data-reduced-motion", "true");
    await expect(appContainer).toHaveAttribute("data-room-mode", "room");

    // Capture M4 darkroom overview in room mode (showing safelight, timer, chemical jugs, enlarger, workbench)
    await page.waitForTimeout(600);
    const roomBuffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m4-darkroom-room-overview.png"), roomBuffer);
    const roomPng = parsePng(roomBuffer);

    // Verify darkroom has rich lighting atmosphere: illuminated table center, red safelight cast, dark perimeter
    const tableCenterStats = getRegionStats(roomPng, 640, 430, 20);
    expect(tableCenterStats.meanLum).toBeGreaterThan(150);

    // Approach table with reduced motion -> should instantly transition without long interpolation
    const approachBtn = page.locator("#approach-btn");
    await approachBtn.click(); await openViewingTools(page);
    await expect(appContainer).toHaveAttribute("data-room-mode", "inspect", { timeout: 3000 });
    await expect(appContainer).toHaveAttribute("data-is-transitioning", "false", { timeout: 3000 });

    // 3. Comprehensive keyboard navigation journey
    // Test Escape to return to room
    await viewerKey(page, "Escape");
    await expect(appContainer).toHaveAttribute("data-room-mode", "room", { timeout: 3000 });
    await expect(appContainer).toHaveAttribute("data-is-transitioning", "false", { timeout: 3000 });

    // Test Enter to approach table
    await viewerKey(page, "Enter");
    await expect(appContainer).toHaveAttribute("data-room-mode", "inspect", { timeout: 3000 });
    await expect(appContainer).toHaveAttribute("data-is-transitioning", "false", { timeout: 3000 });

    // Test number keys 1-5 to navigate frames
    const frameBadge = page.locator("[data-testid=frame-badge]");
    for (let f = 1; f <= 5; f++) {
      await viewerKey(page, String(f));
      await expect(frameBadge).toContainText(`#${f}`);
    }

    // Test ArrowLeft and ArrowRight keys
    await viewerKey(page, "ArrowLeft");
    await expect(frameBadge).toContainText("#4");
    await viewerKey(page, "ArrowRight");
    await expect(frameBadge).toContainText("#5");

    // Test m key to toggle film mode
    const modeBadge = page.locator("[data-testid=mode-badge]");
    await expect(modeBadge).toHaveText("NEGATIVE");
    await viewerKey(page, "m");
    await expect(modeBadge).toHaveText("POSITIVE");

    // Test l key to toggle loupe
    const loupeBadge = page.locator("[data-testid=loupe-badge]");
    await expect(loupeBadge).toContainText("RESTING");
    await viewerKey(page, "l");
    await expect(loupeBadge).toContainText("ACTIVE");

    // 4. Desktop viewport handling: resize to 1920x1080 and 1280x800
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(400);
    await expect(canvas).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(400);
    await expect(canvas).toBeVisible();

    // Capture final inspected state
    const inspectBuffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m4-darkroom-inspect-final.png"), inspectBuffer);

    // 5. Zero error baseline
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
});
