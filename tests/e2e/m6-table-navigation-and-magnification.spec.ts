import { placeLoupeAtScreenPoint, viewerKey, openViewingTools, captureCanvas } from "./helpers/viewing";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { parsePng, getRegionMeanDifference } from "./helpers/pixelAnalysis";

test.describe("M6 E2E — Table Inspection Zoom, Pan, and Loupe Magnification", () => {
  const FRAME_SCREEN_CENTERS = [
    { order: 1, name: "harbor", x: 233, y: 400 },
    { order: 2, name: "diner", x: 437, y: 400 },
    { order: 3, name: "bicycle", x: 640, y: 400 },
    { order: 4, name: "laundromat", x: 843, y: 400 },
    { order: 5, name: "road", x: 1047, y: 400 },
  ];

  test("validates scroll-to-zoom, table panning across frames, reset view, and loupe magnification presets", async ({
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

    // 1. Load production app directly into table inspection mode
    await page.goto("/?deterministic=true&mode=inspect"); await openViewingTools(page);

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });

    const roomBadge = page.locator("main");
    await expect(roomBadge).toHaveAttribute("data-room-mode", "inspect");

    const zoomBadge = page.locator("[data-testid=zoom-badge]");
    await expect(zoomBadge).toBeVisible();
    await expect(zoomBadge).toHaveText("100%");

    const loupeBadge = page.locator("[data-testid=loupe-badge]");
    await expect(loupeBadge).toHaveText("RESTING");

    const artifactsDir = path.resolve(process.cwd(), process.env.REVIEW_ARTIFACTS_DIR || "artifacts");
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    // Capture initial table overview
    await page.waitForTimeout(500);
    const overviewBuffer = await captureCanvas(page);
    fs.writeFileSync(path.join(artifactsDir, "m6-table-overview.png"), overviewBuffer);
    const overviewPng = parsePng(overviewBuffer);

    // 2. Test Scroll to Zoom in inspect mode
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      await page.mouse.move(box.x + 640, box.y + 400);

      // Scroll wheel up to zoom in
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(400);

      // Zoom badge should reflect increased zoom percentage
      const zoomText = await zoomBadge.textContent();
      const zoomVal = parseInt(zoomText?.replace("%", "") || "100", 10);
      expect(zoomVal).toBeGreaterThan(105);

      // Reset View button should now appear
      const resetBtn = page.locator("[data-testid=reset-view-btn]");
      await expect(resetBtn).toBeVisible();

      // Capture zoomed-in screenshot
      const zoomedBuffer = await captureCanvas(page);
      fs.writeFileSync(path.join(artifactsDir, "m6-table-zoomed-in.png"), zoomedBuffer);
      const zoomedPng = parsePng(zoomedBuffer);

      // Verify canvas region changed noticeably from zooming in
      const zoomDiff = getRegionMeanDifference(overviewPng, zoomedPng, 640, 400, 100);
      expect(zoomDiff).toBeGreaterThan(5);

      // 3. Test Table Pan (right-click drag across the illuminated table)
      await page.mouse.move(box.x + 640, box.y + 400);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(box.x + 360, box.y + 400, { steps: 12 });
      await page.mouse.up({ button: "right" });
      await page.waitForTimeout(400);

      // Capture panned screenshot
      const pannedBuffer = await captureCanvas(page);
      fs.writeFileSync(path.join(artifactsDir, "m6-table-panned.png"), pannedBuffer);
      const pannedPng = parsePng(pannedBuffer);

      const panDiff = getRegionMeanDifference(zoomedPng, pannedPng, 640, 400, 100);
      expect(panDiff).toBeGreaterThan(8);

      // 4. Test Reset View (click reset button)
      await resetBtn.click();
      await page.waitForTimeout(400);
      await expect(zoomBadge).toHaveText("100%");
      await expect(resetBtn).toBeVisible(); // M16 keeps Fit roll available.

      // 5. Test Configurable Loupe Magnification
      // Activate loupe
      const loupeToggle = page.locator("[data-testid=loupe-toggle]");
      await loupeToggle.click();
      await page.waitForTimeout(300);

      await page.getByTestId("mag-btn-2x").click();
      await expect(loupeBadge).toHaveText("ACTIVE (2×)");

      // Drag the physical loupe over Frame 3 (bicycle)
      await placeLoupeAtScreenPoint(page, box.x + FRAME_SCREEN_CENTERS[2].x, box.y + FRAME_SCREEN_CENTERS[2].y);
      await page.waitForTimeout(400);

      const magControls = page.locator("[data-testid=magnification-controls]");
      await expect(magControls).toBeVisible();

      const loupe2Buffer = await captureCanvas(page);
      fs.writeFileSync(path.join(artifactsDir, "m6-loupe-2x.png"), loupe2Buffer);
      const loupe2Png = parsePng(loupe2Buffer);

      // Switch to 4x preset
      const mag4Btn = page.locator("[data-testid=mag-btn-4x]");
      await expect(mag4Btn).toBeVisible();
      await mag4Btn.click();
      await page.waitForTimeout(400);
      await expect(loupeBadge).toHaveText("ACTIVE (4×)");

      const loupe4Buffer = await captureCanvas(page);
      fs.writeFileSync(path.join(artifactsDir, "m6-loupe-4x.png"), loupe4Buffer);

      // Switch to 8x preset
      const mag8Btn = page.locator("[data-testid=mag-btn-8x]");
      await expect(mag8Btn).toBeVisible();
      await mag8Btn.click();
      await page.waitForTimeout(400);
      await expect(loupeBadge).toHaveText("ACTIVE (8×)");

      const loupe8Buffer = await captureCanvas(page);
      fs.writeFileSync(path.join(artifactsDir, "m6-loupe-8x.png"), loupe8Buffer);
      const loupe8Png = parsePng(loupe8Buffer);

      // Lens region should show clear pixel difference between 2x and 8x optical enlargement
      const lensDiff = getRegionMeanDifference(
        loupe2Png,
        loupe8Png,
        FRAME_SCREEN_CENTERS[2].x,
        FRAME_SCREEN_CENTERS[2].y,
        35
      );
      expect(lensDiff).toBeGreaterThan(3.5);

      // Test keyboard shortcuts: press 2x preset
      const mag2Btn = page.locator("[data-testid=mag-btn-2x]");
      await mag2Btn.click();
      await page.waitForTimeout(200);
      await expect(loupeBadge).toHaveText("ACTIVE (2×)");

      // Test '+' shortcut to increase magnification
      await viewerKey(page, "+");
      await page.waitForTimeout(200);
      await expect(loupeBadge).toHaveText("ACTIVE (3×)");

      // Rest loupe
      await loupeToggle.click();
      await page.waitForTimeout(300);
      await expect(loupeBadge).toHaveText("RESTING");

      // 6. Test Return to Room and approach cycle preservation
      const returnBtn = page.locator("[data-testid=return-room-btn]");
      await returnBtn.click();
      await page.waitForTimeout(600);
      await expect(roomBadge).toHaveAttribute("data-room-mode", "room");

      const approachBtn = page.locator("[data-testid=approach-table-btn]");
      await expect(approachBtn).toBeVisible();
      await approachBtn.click(); await openViewingTools(page);
      await page.waitForTimeout(600);
      await expect(roomBadge).toHaveAttribute("data-room-mode", "inspect");
      await expect(zoomBadge).toHaveText("100%");
    }

    // Verify baseline zero errors
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
});
