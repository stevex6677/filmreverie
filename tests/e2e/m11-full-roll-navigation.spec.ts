import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
import { FULL_ROLL_FIXTURE, locateFrame } from "../../src/utils/rollLayout";
import { parsePng, getRegionStats, getRegionMeanDifference } from "./helpers/pixelAnalysis";

const dir = process.env.M11_CANDIDATE_DIR || "artifacts/m11-candidates";
const app = (page: Page) => page.locator("main");
async function ready(page: Page) {
  await expect(app(page)).toHaveAttribute("data-assets-ready", "true", { timeout: 30000 });
  await expect(app(page)).toHaveAttribute("data-is-transitioning", "false");
  await page.waitForTimeout(350);
}
async function open(page: Page, frame: number) {
  await page.getByRole("button", { name: `Open frame ${frame}`, exact: true }).click();
  await ready(page);
}
async function point(page: Page, index: number) {
  const bounds = (await page.locator("canvas").boundingBox())!;
  const zoom = Number(await app(page).getAttribute("data-inspect-zoom"));
  const [panX, panZ] = (await app(page).getAttribute("data-inspect-pan"))!.split(",").map(Number);
  const f = locateFrame(FULL_ROLL_FIXTURE, index);
  const pixels = bounds.height / (2 * zoom * Math.tan(Math.PI / 8));
  return { x: bounds.width / 2 + (f.x - panX) * pixels, y: bounds.height / 2 + (-.1 - f.y - panZ) * pixels, bounds, pixels };
}
function trackErrors(page: Page, expectedFailure = false) {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !(expectedFailure && m.text().includes("net::ERR_FAILED"))) errors.push(m.text()); });
  page.on("requestfailed", r => { if (!(expectedFailure && r.url().endsWith("frame-01-harbor.jpg"))) errors.push(r.url()); });
  return errors;
}

test("M11 six strips, 36 photo regions, 29→30→31 loupe journey and overview restoration", async ({ page }) => {
  const errors = trackErrors(page);
  fs.mkdirSync(dir, { recursive: true });
  await page.goto("/?fixture=36&deterministic=true&mode=inspect"); await ready(page);
  await expect(page.getByText("Development fixture · 36 slots / 5 repeated photographs")).toBeVisible();
  await page.getByTestId("mode-toggle").click(); await page.waitForTimeout(500);
  const canvas = page.locator("canvas");
  const overview = parsePng(await canvas.screenshot({ path: `${dir}/whole-roll-positive.png` }));
  for (let i = 0; i < 36; i++) {
    const p = await point(page, i);
    const stats = getRegionStats(overview, Math.round(p.x), Math.round(p.y), 24);
    expect(stats.stdDev, `frame ${i + 1}`).toBeGreaterThan(5);
    expect(stats.meanLum).toBeGreaterThan(10); expect(stats.meanLum).toBeLessThan(240);
    if (i % 6 === 0 && i < 30) {
      const next = await point(page, i + 6);
      const gap = getRegionStats(overview, Math.round(p.x), Math.round((p.y + next.y) / 2), 5);
      expect(gap.meanLum).toBeGreaterThan(stats.meanLum + 10);
    }
  }
  const savedZoom = await app(page).getAttribute("data-inspect-zoom");
  const p29 = await point(page, 28);
  await page.mouse.click(p29.bounds.x + p29.x, p29.bounds.y + p29.y); await ready(page);
  await expect(app(page)).toHaveAttribute("data-selected-frame", "29");
  await expect(app(page)).toHaveAttribute("data-inspection-level", "frame");
  await page.getByTestId("loupe-toggle").click();
  let prior = parsePng(await canvas.screenshot({ path: `${dir}/frame-29-loupe.png` }));
  for (const n of [30, 31]) {
    await page.getByRole("button", { name: "Next", exact: true }).click(); await ready(page);
    await expect(app(page)).toHaveAttribute("data-selected-frame", String(n));
    await expect(app(page)).toHaveAttribute("data-loupe-active", "true");
    const current = parsePng(await canvas.screenshot({ path: `${dir}/frame-${n}-loupe.png` }));
    expect(getRegionMeanDifference(prior, current, Math.round(current.width / 2), Math.round(current.height / 2), 70)).toBeGreaterThan(6);
    prior = current;
  }
  await page.getByRole("button", { name: "Whole roll", exact: true }).click(); await ready(page);
  await expect(app(page)).toHaveAttribute("data-inspect-zoom", savedZoom!);
  await expect(app(page)).toHaveAttribute("data-selected-frame", "1");
  await page.screenshot({ path: `${dir}/overview-restored.png` });
  await expect(page.locator(".strip-thumbnails img + span")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("M11 keyboard, direct strips, endpoints, nested Escape, stock and dimmer", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/?fixture=36&deterministic=true&mode=room"); await ready(page);
  await page.getByTestId("approach-table-btn").click(); await ready(page);
  await expect(app(page)).toHaveAttribute("data-inspection-level", "roll");
  await page.locator("h1").click();
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Enter"); await ready(page);
  await expect(app(page)).toHaveAttribute("data-selected-frame", "8");
  await page.keyboard.press("Escape"); await ready(page); await expect(app(page)).toHaveAttribute("data-inspection-level", "strip");
  await page.keyboard.press("Escape"); await ready(page); await expect(app(page)).toHaveAttribute("data-inspection-level", "roll");
  await page.locator("h1").click();
  await page.keyboard.press("ArrowUp");
  await expect(app(page)).toHaveAttribute("data-selected-frame", "2");
  await page.keyboard.press("ArrowUp");
  await expect(app(page)).toHaveAttribute("data-selected-frame", "2");
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown");
  await expect(app(page)).toHaveAttribute("data-selected-frame", "32");
  await page.keyboard.press("ArrowDown");
  await expect(app(page)).toHaveAttribute("data-selected-frame", "32");
  await open(page, 6);
  await page.getByRole("button", { name: "Open frame 6", exact: true }).focus();
  await page.keyboard.press("ArrowRight"); await ready(page);
  await expect(app(page)).toHaveAttribute("data-selected-frame", "7");
  await expect(page.getByRole("button", { name: "Open frame 7", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Next", exact: true }).focus();
  await page.keyboard.press("ArrowRight"); await ready(page);
  await expect(app(page)).toHaveAttribute("data-selected-frame", "8");
  await page.getByRole("button", { name: "Strip 5", exact: true }).click(); await ready(page);
  await expect(page.getByTestId("roll-position")).toContainText("Strip 5 / 6");
  await page.getByRole("button", { name: "Next", exact: true }).click(); await ready(page);
  await expect(page.getByTestId("roll-position")).toContainText("Strip 6 / 6");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await open(page, 1); await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  await open(page, 36); await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await expect(page.locator(".strip-thumbnails img")).toHaveCount(6);
  await page.getByTestId("film-stock-selector").selectOption("ektachrome-e100");
  await page.getByTestId("brightness-slider").focus(); await page.keyboard.press("Home");
  await page.locator("h1").click(); await page.keyboard.press("m");
  await expect(app(page)).toHaveAttribute("data-film-mode", "positive");
  await page.keyboard.press("ArrowLeft"); await ready(page);
  await expect(app(page)).toHaveAttribute("data-selected-frame", "35");
  await expect(page.getByTestId("brightness-value")).toHaveText("30%");
  await page.getByTestId("return-room-btn").click(); await ready(page);
  await expect(app(page)).toHaveAttribute("data-room-mode", "room");
  expect(errors).toEqual([]);
});

test("M11 failed photograph keeps slots usable and recovers through visible retry", async ({ page }) => {
  const errors = trackErrors(page, true);
  let failures = 0;
  await page.route("**/frame-01-harbor.jpg", route => { failures++; return route.abort("failed"); });
  await page.goto("/?fixture=36&deterministic=true"); await ready(page);
  await expect(page.getByRole("alert")).toContainText("1, 6, 11, 16, 21, 26, 31, 36");
  await open(page, 29);
  const p = await point(page, 28);
  expect(getRegionStats(parsePng(await page.locator("canvas").screenshot()), Math.round(p.x), Math.round(p.y), 50).stdDev).toBeGreaterThan(5);
  await page.unroute("**/frame-01-harbor.jpg");
  await page.getByRole("button", { name: "Retry photographs" }).click(); await ready(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await open(page, 31);
  const recovered = await point(page, 30);
  expect(getRegionStats(parsePng(await page.locator("canvas").screenshot()), Math.round(recovered.x), Math.round(recovered.y), 60).stdDev).toBeGreaterThan(5);
  expect(failures).toBeGreaterThan(0); expect(errors).toEqual([]);
});

async function brightness(page: Page, value: number) {
  const slider = page.getByTestId("brightness-slider");
  await slider.focus();
  await page.keyboard.press(value === 100 ? "End" : "Home");
  if (value === 60) {
    // Use native coarse steps before fine adjustment; the optical matrix repeats
    // this many times, and every separate key press waits on the busy renderer.
    for (let i = 0; i < 4; i++) await page.keyboard.press("PageUp");
    const current = Math.round(Number(await slider.inputValue()) * 100);
    for (let i = 0; i < Math.abs(value - current); i++) {
      await page.keyboard.press(current < value ? "ArrowRight" : "ArrowLeft");
    }
  }
  await expect(page.getByTestId("brightness-value")).toHaveText(`${value}%`);
  await page.waitForTimeout(200);
}

test("M11 combined stocks, first/last strips and transmitted loupe brightness", async ({ page, browser }) => {
  // Shared software-rendered CI may run alongside another checkout. Keep
  // per-action/assertion deadlines intact while budgeting this full stock matrix.
  test.setTimeout(900000);
  const errors = trackErrors(page);
  const photoRequests: string[] = [];
  page.on("request", r => { if (r.url().includes("/assets/photos/")) photoRequests.push(r.url()); });
  await page.goto("/?fixture=36&deterministic=true"); await ready(page);
  const canvas = page.locator("canvas");
  const sourceCounts = () => new Set(photoRequests).size;
  const samples: Record<string, unknown> = {};
  const borders: number[] = [];
  for (const stock of ["portra-400", "ektar-100", "portra-160", "portra-800", "ektachrome-e100"]) {
    await page.getByTestId("film-stock-selector").selectOption(stock);
    const modes = stock === "ektachrome-e100" ? ["positive"] : ["negative", "positive"];
    for (const mode of modes) {
      if (await app(page).getAttribute("data-film-mode") !== mode) await page.getByTestId("mode-toggle").click();
      const values: number[][] = [];
      for (const value of [30, 60, 100]) {
        await brightness(page, value);
        const png = parsePng(await canvas.screenshot());
        const regions: number[] = [];
        for (const index of [0, 30]) {
          const p = await point(page, index);
          // Sample most of the exposure height, not only the low-detail water at its center.
          const photo = getRegionStats(png, Math.round(p.x), Math.round(p.y), Math.floor(.366667 * FULL_ROLL_FIXTURE.scale * p.pixels * .8));
          expect(photo.stdDev).toBeGreaterThan(4);
          regions.push(photo.meanLum);
          // The lower rail and physical sprocket row lie outside the exposure.
          const f = locateFrame(FULL_ROLL_FIXTURE, index);
          const railY = p.y + (f.strip.layout.frameHeight / 2 + .046) * FULL_ROLL_FIXTURE.scale * p.pixels;
          regions.push(getRegionStats(png, Math.round(p.x), Math.round(railY), 2).meanLum);
          const holeX = p.x + (-.55 / 2 + .59 / 8 * 3.5) * FULL_ROLL_FIXTURE.scale * p.pixels;
          const holeY = p.y + (.366667 / 2 + .025) * FULL_ROLL_FIXTURE.scale * p.pixels;
          regions.push(getRegionStats(png, Math.round(holeX), Math.round(holeY), 1).meanLum);
        }
        values.push(regions);
        if (value === 100 && mode === modes[0]) borders.push(regions[1]);
      }
      for (let i = 0; i < values[0].length; i++) {
        expect(values[1][i], `${stock} ${mode} region ${i} 30→60`).toBeGreaterThan(values[0][i] + 1);
        expect(values[2][i], `${stock} ${mode} region ${i} 60→100`).toBeGreaterThan(values[1][i] + 1);
      }
      samples[`${stock}-${mode}`] = values;
    }
    await open(page, 31);
    await page.getByTestId("loupe-toggle").click();
    const lensValues: number[] = [];
    for (const value of [30, 60, 100]) {
      await brightness(page, value);
      const png = parsePng(await canvas.screenshot());
      lensValues.push(getRegionStats(png, Math.round(png.width / 2), Math.round(png.height / 2), 50).meanLum);
    }
    expect(lensValues[1]).toBeGreaterThan(lensValues[0] + 2);
    expect(lensValues[2]).toBeGreaterThan(lensValues[1] + 2);
    samples[`${stock}-loupe`] = lensValues;
    await page.getByTestId("loupe-toggle").click();
    await page.getByRole("button", { name: "Whole roll", exact: true }).click(); await ready(page);
    await expect(app(page)).toHaveAttribute("data-film-stock", stock);
    await expect(page.getByTestId("brightness-value")).toHaveText("100%");
  }
  expect(Math.max(...borders) - Math.min(...borders)).toBeGreaterThan(15);
  // Five detail + five overview URLs are shared by the 36 slots; navigation must not request detail again.
  const details = photoRequests.filter(url => !url.includes(".thumb."));
  expect(details).toHaveLength(5);
  expect(sourceCounts()).toBe(10);
  const times = await page.evaluate(() => new Promise<number[]>(resolve => {
    const deltas: number[] = []; let prior = performance.now();
    const frame = (now: number) => { deltas.push(now - prior); prior = now; if (deltas.length < 40) requestAnimationFrame(frame); else resolve(deltas.slice(1)); };
    requestAnimationFrame(frame);
  }));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/measurements.json`, JSON.stringify({ browser: browser.version(), viewport: page.viewportSize(), samples, photoRequests, frameTimesMs: times, limitation: "Five repeated source textures; not a 36-unique-image memory benchmark." }, null, 2));
  expect(errors).toEqual([]);
});
