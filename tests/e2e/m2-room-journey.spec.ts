import { approachTable, faceTable } from "./helpers/room";
import { viewerKey, openViewingTools, selectOverviewFrame, captureCanvas } from "./helpers/viewing";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { parsePng, getRegionStats, getRegionMeanDifference } from "./helpers/pixelAnalysis";

test.describe("M2 E2E — Room and Camera Journey", () => {
  const FRAME_SCREEN_CENTERS = [
    { order: 1, name: "harbor", x: 233, y: 400 },
    { order: 2, name: "diner", x: 437, y: 400 },
    { order: 3, name: "bicycle", x: 640, y: 400 },
    { order: 4, name: "laundromat", x: 843, y: 400 },
    { order: 5, name: "road", x: 1047, y: 400 },
  ];

  test("validates fixed-eye room look, table approach transition, pose restoration, repeated cycles, and M1 journey", async ({
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

    // 1. Load production app in room mode
    await page.goto("/guest?deterministic=true&mode=room");

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });

    const roomBadge = page.locator("main");
    await expect(roomBadge).toHaveAttribute("data-room-mode", "room");

    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();

    await page.waitForTimeout(600);

    const artifactsDir = path.resolve(process.cwd(), process.env.REVIEW_ARTIFACTS_DIR || "artifacts");
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    // Capture initial room view
    const roomInitialBuffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m2-room-initial.png"), roomInitialBuffer);
    const roomInitialPng = parsePng(roomInitialBuffer);

    // Assert room is rendered (dark ambient with illuminated viewing table)
    const initialCenterStats = getRegionStats(roomInitialPng, 640, 400, 50);
    expect(initialCenterStats.meanLum).toBeGreaterThan(40); // Table glows in the darkroom

    // 2. Real pointer drag produces a fixed-eye camera/canvas change
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      // Smoothly drag to look horizontally horizontally and vertically
      await page.mouse.move(box.x + 640, box.y + 400);
      await page.mouse.down();
      await page.mouse.move(box.x + 820, box.y + 360, { steps: 15 });
      await page.mouse.up();
      await page.waitForTimeout(600);

      const roomDraggedBuffer = await captureCanvas(page);
      fs.writeFileSync(path.join(artifactsDir, "m2-room-dragged.png"), roomDraggedBuffer);
      const roomDraggedPng = parsePng(roomDraggedBuffer);

      // Verify canvas changed visibly from the changed viewing direction
      const dragDiff = getRegionMeanDifference(roomInitialPng, roomDraggedPng, 500, 400, 80);
      expect(dragDiff).toBeGreaterThan(8);
    }

    // 3. Selecting the table completes the approach transition
    await approachTable(page); await openViewingTools(page);

    // Verify transition into inspect mode completes
    await expect(page.locator("[data-room-mode=inspect]")).toBeAttached({ timeout: 5000 });
    await expect(page.locator("[data-is-transitioning=false]")).toBeAttached({ timeout: 5000 });
    await expect(roomBadge).toHaveAttribute("data-room-mode", "inspect");

    const returnBtn = page.locator("[data-testid=return-room-btn]");
    await expect(returnBtn).toBeVisible();

    await page.waitForTimeout(600);
    const inspectBuffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m2-inspect-arrived.png"), inspectBuffer);

    // 4. Back / Escape restores room mode and exact prior pose
    await viewerKey(page, "Escape");
    await expect(page.locator("[data-room-mode=room]")).toBeAttached({ timeout: 5000 });
    await expect(page.locator("[data-is-transitioning=false]")).toBeAttached({ timeout: 5000 });
    await expect(roomBadge).toHaveAttribute("data-room-mode", "room");

    await page.waitForTimeout(600);
    const restoredBuffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m2-room-restored-1.png"), restoredBuffer);
    const restoredPng = parsePng(restoredBuffer);

    // M13 allows looking away from the table; exact image restoration below
    // replaces the obsolete assumption that the center must remain illuminated.

    // Verify EXACT POSE RESTORATION: restored view exactly matches the dragged view
    const roomDraggedPng = parsePng(fs.readFileSync(path.join(artifactsDir, "m2-room-dragged.png")));
    const poseRestorationDiff = getRegionMeanDifference(roomDraggedPng, restoredPng, 500, 400, 100);
    expect(poseRestorationDiff).toBeLessThan(1.5);

    // 5. Repeat approach / return twice
    // Cycle 1: Click approach button, click return button
    await approachTable(page); await openViewingTools(page);
    await expect(page.locator("[data-room-mode=inspect]")).toBeAttached();
    await page.waitForTimeout(600);

    await returnBtn.click();
    await expect(page.locator("[data-room-mode=room]")).toBeAttached();
    await page.waitForTimeout(600);

    // Cycle 2: Face the table before testing spatial selection from a known view.
    await faceTable(page);
    await page.waitForTimeout(200);
    if (box) {
      await page.mouse.click(box.x + 640, box.y + 400);
    } else {
      await approachTable(page); await openViewingTools(page);
    }
    await expect(page.locator("[data-room-mode=inspect]")).toBeAttached({ timeout: 5000 });
    await page.waitForTimeout(600);

    // 6. Run full accepted M1 journey in inspect mode
    await openViewingTools(page);
    const modeToggle = page.locator("#mode-toggle");
    const loupeToggle = page.locator("#loupe-toggle");
    await expect(modeToggle).toBeVisible();
    await expect(loupeToggle).toBeVisible();

    const m1NegBuffer = await captureCanvas(page);
    const m1NegPng = parsePng(m1NegBuffer);

    // Verify all 5 frames are readable
    for (const frame of FRAME_SCREEN_CENTERS) {
      const stats = getRegionStats(m1NegPng, frame.x, frame.y, 28);
      expect(stats.meanLum).toBeGreaterThan(15);
      expect(stats.meanLum).toBeLessThan(235);
      expect(stats.stdDev).toBeGreaterThan(5);
    }

    // Toggle to positive
    await modeToggle.click();
    await expect(page.locator("[data-testid=mode-badge]")).toHaveText("POSITIVE");
    await page.waitForTimeout(600);

    const m1PosBuffer = await captureCanvas(page);
    const m1PosPng = parsePng(m1PosBuffer);
    const pixelDelta = getRegionMeanDifference(m1NegPng, m1PosPng, 640, 400, 30);
    expect(pixelDelta).toBeGreaterThan(20);

    // Toggle back to negative
    await modeToggle.click();
    await expect(page.locator("[data-testid=mode-badge]")).toHaveText("NEGATIVE");
    await page.waitForTimeout(600);

    // Activate loupe and inspect frames
    await loupeToggle.click();
    await expect(page.locator("[data-testid=loupe-badge]")).toContainText("ACTIVE");

    await selectOverviewFrame(page, 1);
    await expect(page.locator("[data-testid=frame-badge]")).toContainText("#1");
    await page.waitForTimeout(500);

    await selectOverviewFrame(page, 3);
    await expect(page.locator("[data-testid=frame-badge]")).toContainText("#3");
    await page.waitForTimeout(500);

    await selectOverviewFrame(page, 5);
    await expect(page.locator("[data-testid=frame-badge]")).toContainText("#5");
    await page.waitForTimeout(600);

    // Verify zero console errors, zero page errors, zero failed requests
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);

    // 7. Finalize and export interaction recording
    const video = page.video();
    if (video) {
      await page.close();
      const videoPath = await video.path();
      const destWebm = path.join(artifactsDir, "m2-interaction-recording.webm");
      if (fs.existsSync(videoPath)) {
        fs.copyFileSync(videoPath, destWebm);
      }
    }
  });
});
