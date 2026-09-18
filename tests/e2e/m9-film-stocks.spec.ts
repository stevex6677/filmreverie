import { placeLoupeAtScreenPoint, viewerKey, openViewingTools, captureCanvas } from "./helpers/viewing";
import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { FILM_STOCKS } from "../../src/data/filmStocks";
import { parsePng, getRegionStats, getRegionMeanDifference } from "./helpers/pixelAnalysis";

const candidates = path.resolve(process.env.M9_CANDIDATE_DIR || "artifacts/m9-m10-candidates/stocks");
function observeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", (request) => errors.push(request.url()));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  return errors;
}
async function waitForFilm(page: Page) {
  // The canvas element exists before Suspense finishes loading scene assets.
  // Wait for actual photo pixels, not just the DOM surface, before pointer input.
  await expect.poll(async () => {
    const png = parsePng(await captureCanvas(page));
    return [233, 437, 640, 843, 1047].every((x) => {
      const stats = getRegionStats(png, x, 400, 28);
      return stats.meanLum > 15 && stats.meanLum < 235 && stats.stdDev > 5;
    });
  }, {timeout: 30000, message: "All five actual photos must render before interaction"}).toBe(true);
}
async function capture(page: Page, name: string) {
  await page.waitForTimeout(450);
  fs.mkdirSync(candidates, {recursive: true});
  const buffer = await captureCanvas(page, {path: path.join(candidates, `${name}.png`)});
  return parsePng(buffer);
}
function readablePhotos(png: ReturnType<typeof parsePng>) {
  for (const x of [233, 437, 640, 843, 1047]) {
    const stats = getRegionStats(png, x, 400, 28);
    expect(stats.meanLum).toBeGreaterThan(8);
    expect(stats.meanLum).toBeLessThan(235);
    expect(stats.stdDev).toBeGreaterThan(7);
  }
}

test("M9: every stock, physical borders, allowed views and keyboard restrictions", async ({page}) => {
  test.setTimeout(600000);
  const errors = observeErrors(page);
  await page.goto("/?deterministic=true&mode=inspect"); await openViewingTools(page);
  await expect(page.locator("canvas")).toBeVisible();
  await waitForFilm(page);
  const selector = page.getByLabel("Film stock", {exact: true});
  const app = page.locator("main");
  await expect(selector).toHaveValue("portra-400");
  await page.getByTestId("film-strength-slider").focus();
  await page.getByTestId("film-strength-slider").press("Home");
  let lastEdge: ReturnType<typeof parsePng> | undefined;
  let positiveMaster: ReturnType<typeof parsePng> | undefined;
  for (const stock of FILM_STOCKS) {
    // Go through E100 each time to verify returning to every negative starts negative.
    await selector.selectOption("ektachrome-e100");
    await selector.selectOption(stock.id);
    await expect(app).toHaveAttribute("data-film-stock", stock.id);
    const initial = await capture(page, `${stock.id}-${stock.type === "negative" ? "negative" : "positive"}`);
    if (lastEdge) expect(getRegionMeanDifference(lastEdge, initial, 640, 320, 18)).toBeGreaterThan(1);
    lastEdge = initial;
    if (stock.type === "reversal") {
      await expect(page.getByTestId("mode-toggle")).toHaveCount(0);
      await expect(page.getByTestId("mode-badge")).toHaveText("POSITIVE · E-6");
      await selector.press("Tab");
      await viewerKey(page, "m");
      await expect(app).toHaveAttribute("data-film-mode", "positive");
      const afterShortcut = await capture(page, "e100-after-mode-shortcut");
      expect(getRegionMeanDifference(initial, afterShortcut, 640, 400, 60)).toBeLessThan(1);
      readablePhotos(initial);
      positiveMaster = initial;
    } else {
      await expect(app).toHaveAttribute("data-film-mode", "negative");
      const base = getRegionStats(initial, 645, 320, 4);
      expect(base.meanR).toBeGreaterThan(base.meanB + 15);
      await page.getByTestId("mode-toggle").click();
      await expect(app).toHaveAttribute("data-film-mode", "positive");
      const positive = await capture(page, `${stock.id}-positive-preview`);
      readablePhotos(positive);
      expect(getRegionMeanDifference(initial, positive, 640, 400, 50)).toBeGreaterThan(15);
      // User review: positive preview now reverses the complete strip, including its border.
      expect(getRegionMeanDifference(initial, positive, 640, 320, 12)).toBeGreaterThan(15);
      expect(getRegionStats(positive, 645, 320, 2).meanLum).toBeLessThan(base.meanLum - 30);
      for (const x of [233, 437, 640, 843, 1047]) {
        expect(getRegionMeanDifference(positiveMaster!, positive, x, 400, 28)).toBeLessThan(1);
      }
      await page.getByTestId("mode-toggle").click();
      const negativeAgain = await capture(page, `${stock.id}-negative-return`);
      expect(getRegionMeanDifference(initial, negativeAgain, 640, 400, 50)).toBeLessThan(1);
      expect(getRegionMeanDifference(initial, negativeAgain, 640, 320, 12)).toBeLessThan(1);
    }
  }
  // Native keyboard selection must not invoke global frame/mode/navigation shortcuts.
  await selector.focus();
  await selector.press("Home");
  await selector.press("ArrowDown");
  await selector.press("Enter");
  await expect(selector).toHaveValue("ektar-100");
  expect(errors).toEqual([]);
});

test("M9: macro stock lettering through the scene-capture loupe, rapid changes and room journeys", async ({page}) => {
  test.setTimeout(600000);
  const errors = observeErrors(page);
  await page.goto("/?deterministic=true&mode=inspect"); await openViewingTools(page);
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await waitForFilm(page);
  const selector = page.getByLabel("Film stock", {exact: true});
  // Real keyboard dimmer operation, then leave the input before shortcuts.
  const slider = page.getByTestId("brightness-slider");
  await slider.focus();
  await slider.press("Home");
  await slider.press("ArrowRight");
  await slider.press("Tab");
  await expect(page.getByTestId("brightness-badge")).toHaveText("31%");
  await page.mouse.move(640, 400);
  while (true) {
    const currentZoom = await page.getByTestId("zoom-badge").textContent();
    if (parseInt(currentZoom!) >= 250) break;
    await page.mouse.wheel(0, -120);
    await expect(page.getByTestId("zoom-badge")).not.toHaveText(currentZoom!);
  }
  const zoom = await page.getByTestId("zoom-badge").textContent();
  expect(parseInt(zoom!)).toBeGreaterThan(250);
  // Move the top rebate into the center of the view, keeping macro zoom.
  const stripHeight = 35 * 0.0036;
  const distance = 3.2 / (parseFloat(zoom!) / 100);
  const pixelsPerUnit = 800 / (2 * distance * Math.tan(Math.PI / 8));
  const railY = 400 - (stripHeight / 2 - 13 / 468 * stripHeight) * pixelsPerUnit;
  await page.mouse.move(800, 400);
  await page.mouse.down({button: "right"});
  await page.mouse.move(800, 400 + (400 - railY), {steps: 10});
  await page.mouse.up({button: "right"});
  let lastLoupe: ReturnType<typeof parsePng> | undefined;
  for (const stock of FILM_STOCKS) {
    await selector.selectOption(stock.id);
    await expect(page.getByTestId("zoom-badge")).toHaveText(zoom!);
    await expect(page.getByTestId("brightness-badge")).toHaveText("31%");
    const edge = await capture(page, `${stock.id}-macro-edge`);
    const edgeStats = getRegionStats(edge, 590, 400, 70);
    expect(edgeStats.stdDev).toBeGreaterThan(3);
    await page.getByTestId("loupe-toggle").click();
    await page.getByTestId("mag-btn-2x").click();
    await placeLoupeAtScreenPoint(page, 590, 400);
    const lens = await capture(page, `${stock.id}-macro-loupe`);
    expect(getRegionStats(lens, 590, 400, 80).stdDev).toBeGreaterThan(3);
    expect(getRegionMeanDifference(edge, lens, 590, 400, 100)).toBeGreaterThan(3);
    // Include the full lens interior, including the stock's numeric suffix.
    // A tiny central patch can contain only the shared letters "PORTRA".
    if (lastLoupe) {
      let difference = 0;
      let samples = 0;
      for (let y = 290; y <= 510; y++) for (let x = 480; x <= 700; x++) {
        if ((x - 590) ** 2 + (y - 400) ** 2 > 110 ** 2) continue;
        const pixel = (y * lens.width + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          difference += Math.abs(lens.data[pixel + channel] - lastLoupe.data[pixel + channel]);
          samples++;
        }
      }
      expect(difference / samples).toBeGreaterThan(1);
    }
    lastLoupe = lens;
    await page.getByTestId("loupe-toggle").click();
  }
  await page.getByTestId("loupe-toggle").click();
  await page.getByTestId("mag-btn-4x").click();
  await placeLoupeAtScreenPoint(page, 590, 400);
  await selector.selectOption("portra-400");
  const beforeRapid = await capture(page, "rapid-before");
  const frame = await page.getByTestId("frame-badge").textContent();
  for (const stock of [...FILM_STOCKS, ...FILM_STOCKS]) await selector.selectOption(stock.id);
  await selector.selectOption("portra-400");
  const afterRapid = await capture(page, "rapid-after");
  await expect(selector).toHaveValue("portra-400");
  await expect(page.getByTestId("frame-badge")).toHaveText(frame!);
  await expect(page.getByTestId("loupe-badge")).toHaveText("ACTIVE (4×)");
  await expect(page.getByTestId("zoom-badge")).toHaveText(zoom!);
  expect(getRegionMeanDifference(beforeRapid, afterRapid, 590, 400, 100)).toBeLessThan(1);
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("return-room-btn").click();
    await expect(page.locator("main")).toHaveAttribute("data-is-transitioning", "false");
    await expect(page.locator("main")).toHaveAttribute("data-room-mode", "room");
    await selector.selectOption(i === 0 ? "ektachrome-e100" : "portra-800");
    await page.getByTestId("approach-table-btn").click(); await openViewingTools(page);
    await expect(page.locator("main")).toHaveAttribute("data-room-mode", "inspect");
    await expect(page.getByTestId("brightness-badge")).toHaveText("31%");
    const arrived = await capture(page, `room-return-${i}`);
    // Measure the whole bicycle photo interior. The small central wheel patch
    // is almost uniform in a dimmed negative and is not a readability measure.
    // Stay inside the aperture, excluding bright perforations and frame edges.
    const luminance: number[] = [];
    for (let y = 350; y < 450; y++) for (let x = 564; x < 716; x++) {
      const pixel = (y * arrived.width + x) * 4;
      luminance.push(0.299 * arrived.data[pixel] + 0.587 * arrived.data[pixel + 1] + 0.114 * arrived.data[pixel + 2]);
    }
    const mean = luminance.reduce((a, b) => a + b, 0) / luminance.length;
    const deviation = Math.sqrt(luminance.reduce((total, value) => total + (value - mean) ** 2, 0) / luminance.length);
    expect(deviation).toBeGreaterThan(7);
  }
  await page.screenshot({path: path.join(candidates, "controls-and-stock.png")});
  const video = page.video();
  await page.close();
  if (video) await video.saveAs(path.join(candidates, "stock-switching.webm"));
  expect(errors).toEqual([]);
});
