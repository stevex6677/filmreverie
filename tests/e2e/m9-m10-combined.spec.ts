import { dragLoupeTo, viewerKey, openViewingTools, captureCanvas } from "./helpers/viewing";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { FILM_STOCKS } from "../../src/data/filmStocks";
import { parsePng, getRegionStats } from "./helpers/pixelAnalysis";

const output = path.resolve(process.env.M9_M10_CANDIDATE_DIR || "artifacts/m9-m10-candidates/combined");
for (const stock of FILM_STOCKS) {
  test(`M9 + M10: ${stock.id} retains density and illuminated borders in every allowed view`, async ({ page }) => {
    test.setTimeout(600000);
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    page.on("requestfailed", r => errors.push(r.url()));
    page.on("response", r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto("/?deterministic=true&mode=inspect"); await openViewingTools(page);
    await expect(page.locator("canvas")).toBeVisible();
    await page.getByLabel("Film stock", { exact: true }).selectOption(stock.id);
    const measurements: unknown[] = [];
    fs.mkdirSync(output, { recursive: true });
    for (const mode of stock.allowedViews) {
      if (await page.locator("main").getAttribute("data-film-mode") !== mode) await page.getByTestId("mode-toggle").click();
      let previousPhoto = 0, previousRebate = 0, previousPanel = 0;
      for (const brightness of [30, 60, 100]) {
        const slider = page.getByTestId("brightness-slider");
        await slider.focus();
        await slider.press(brightness === 100 ? "End" : "Home");
        if (brightness === 60) {
          for (let i = 0; i < 4; i++) await slider.press("PageUp");
          await slider.press("ArrowRight"); await slider.press("ArrowRight");
        }
        await slider.blur();
        await expect(page.getByTestId("brightness-badge")).toHaveText(`${brightness}%`);
        await expect(page.locator("main")).toHaveAttribute("data-film-stock", stock.id);
        await expect(page.locator("main")).toHaveAttribute("data-film-mode", mode);
        await page.waitForTimeout(300);
        const name = `${stock.id}-${mode}-${brightness}`;
        const source = parsePng(await captureCanvas(page, { path: path.join(output, `${name}.png`) }));
        const photo = getRegionStats(source, 640, 400, 28);
        const rebate = getRegionStats(source, 645, 337, 2);
        const panel = getRegionStats(source, 640, 220, 24);
        expect(photo.stdDev).toBeGreaterThan(4);
        expect(photo.meanLum).toBeLessThan(panel.meanLum - 25);
        if (brightness !== 30) {
          expect(photo.meanLum - previousPhoto).toBeGreaterThan(5);
          expect(rebate.meanLum - previousRebate).toBeGreaterThan(2);
          expect(panel.meanLum - previousPanel).toBeGreaterThan(10);
        }
        previousPhoto = photo.meanLum; previousRebate = rebate.meanLum; previousPanel = panel.meanLum;
        await page.getByTestId("loupe-toggle").click();
        await page.getByTestId("mag-btn-4x").click();
        await dragLoupeTo(page, 645, 337, .007);
        await page.waitForTimeout(250);
        const lens = parsePng(await captureCanvas(page, { path: path.join(output, `${name}-loupe.png`) }));
        const [lx,ly] = (await page.locator('canvas').getAttribute('data-loupe-display'))!.split(',').map(Number);
        const magnified = getRegionStats(lens, Math.round(lx), Math.round(ly), 2);
        const differences = ["meanR", "meanG", "meanB"].map(key => Math.abs(rebate[key as "meanR"] - magnified[key as "meanR"]));
        expect(Math.max(...differences)).toBeLessThan(16);
        measurements.push({ mode, brightness, photo, rebate, panel, lens: magnified, differences });
        await page.getByTestId("loupe-toggle").click();
        if (stock.type === "reversal") {
          await viewerKey(page, "m");
          await expect(page.locator("main")).toHaveAttribute("data-film-mode", "positive");
          await expect(page.getByTestId("mode-toggle")).toHaveCount(0);
        }
      }
    }
    fs.writeFileSync(path.join(output, `${stock.id}.json`), JSON.stringify(measurements, null, 2));
    expect(errors).toEqual([]);
  });
}
