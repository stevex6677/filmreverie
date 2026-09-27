import { placeLoupeAtScreenPoint, viewerKey, openViewingTools, closeViewingTools, captureCanvas } from "./helpers/viewing";
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { parsePng, getRegionStats, getRegionMeanDifference } from "./helpers/pixelAnalysis";
import { BASELINE_ROLL, locateFrame } from "../../src/utils/rollLayout";
import { getFilmCurlZ, getPerforationPositions, getStripDimensions } from "../../src/utils/loupeMapping";
import { LOUPE_LENS_HEIGHT } from "../../src/utils/loupeView";

test.use({ actionTimeout: 30000 });

const output = path.resolve(process.env.M10_CANDIDATE_DIR || "artifacts/m9-m10-candidates/lighting");
async function sampleGeometry(page: Page) {
  const box = (await page.locator("canvas").boundingBox())!;
  const zoom = Number(await page.locator("main").getAttribute("data-inspect-zoom"));
  const [panX, panZ] = (await page.locator("main").getAttribute("data-inspect-pan"))!.split(",").map(Number);
  const project = (x: number, y: number, height = 0) => {
    const pixels = box.height / (2 * (zoom - height) * Math.tan(Math.PI / 8));
    return [Math.round(box.width / 2 + (x - panX) * pixels), Math.round(box.height / 2 + (-.1 - y - panZ) * pixels)] as const;
  };
  const scale = BASELINE_ROLL.scale;
  const frame = locateFrame(BASELINE_ROLL, 2);
  const layout = frame.strip.layout;
  const hole = getPerforationPositions(layout).top.find(p => p.frameIndex === 2 && p.perforationIndex === 3)!;
  const rebateX = hole.x + (layout.frameWidth + layout.gap) / 16;
  const heights = { photo: .006 * scale, hole: .001, rebate: (.0055 + getFilmCurlZ(hole.y, getStripDimensions(layout).height)) * scale, panel: .001 };
  const regions = {
    panel: [...project(0, .4 * scale, heights.panel), 24],
    hole: [...project(hole.x * scale, hole.y * scale, heights.hole), 2],
    rebate: [...project(rebateX * scale, hole.y * scale, heights.rebate), 2],
    photo: [...project(frame.x, frame.y, heights.photo), 28],
  } as const;
  const photos = BASELINE_ROLL.frames.map((_, index) => {
    const f = locateFrame(BASELINE_ROLL, index);
    const [x, y] = project(f.x, f.y, heights.photo);
    const pixels = box.height / (2 * (zoom - heights.photo) * Math.tan(Math.PI / 8));
    return { x, y, halfWidth: Math.floor(layout.frameWidth * scale * pixels * .4), halfHeight: Math.floor(layout.frameHeight * scale * pixels * .4) };
  });
  return { box, regions, photos, heights, project };
}

async function dim(page: Page, percent: number) {
  const slider = page.getByTestId("brightness-slider");
  await slider.focus();
  await slider.press(percent === 100 ? "End" : "Home");
  if (percent === 60) {
    for (let i = 0; i < 4; i++) await slider.press("PageUp");
    await slider.press("ArrowRight"); await slider.press("ArrowRight");
  }
  await expect(page.getByTestId("brightness-badge")).toHaveText(`${percent}%`);
  await slider.blur();
  await page.waitForTimeout(250);
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") { errors.push(m.text()); console.error(m.text()); } });
  page.on("requestfailed", r => errors.push(r.url()));
  page.on("response", r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  return errors;
}

async function capture(page: Page, name: string) {
  const buffer = await captureCanvas(page);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, `${name}.png`), buffer);
  return parsePng(buffer);
}

test("M10 ordered transmission, local spill, detail and navigation at both dimmer extremes", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/guest?deterministic=true&mode=inspect"); await openViewingTools(page);
  await expect(page.locator("canvas")).toBeVisible();
  const { regions, photos } = await sampleGeometry(page);
  const measurements: Record<string, unknown> = {};
  for (const mode of ["negative", "positive"]) {
    if (mode === "positive") await page.getByTestId("mode-toggle").click();
    const captures: ReturnType<typeof parsePng>[] = [];
    for (const brightness of [30, 60, 100]) {
      await dim(page, brightness);
      const png = await capture(page, `${mode}-${brightness}`);
      captures.push(png);
      const stats = Object.fromEntries(Object.entries(regions).map(([name, [x, y, size]]) => [name, getRegionStats(png, x, y, size)]));
      measurements[`${mode}-${brightness}`] = stats;
      fs.writeFileSync(path.join(output, "transmission-measurements.json"), JSON.stringify(measurements, null, 2));
      for (const { x, y: cy, halfWidth, halfHeight } of photos) {
        // Measure the exposure, not an arbitrary low-detail patch of water.
        const photo = getRegionStats(png, x, cy, halfHeight * 2);
        expect(photo.stdDev, `${mode} ${brightness} frame ${x} detail`).toBeGreaterThan(4);
        expect(photo.meanLum).toBeLessThan(stats.panel.meanLum - 25);
        let clipped = 0;
        for (let y = cy - halfHeight; y < cy + halfHeight; y++) for (let px = x - halfWidth; px < x + halfWidth; px++) {
          const i = (y * png.width + px) * 4;
          const rgb = [...png.data.subarray(i, i + 3)];
          if (rgb.every(v => v >= 250) || rgb.every(v => v <= 3)) clipped++;
        }
        expect(clipped / (4 * halfWidth * halfHeight), "broad photo clipping").toBeLessThan(0.08);
      }
    }
    for (const [name, [x, y, size]] of Object.entries(regions)) {
      const lum = captures.map(png => getRegionStats(png, x, y, size).meanLum);
      // Predeclared minimum adjacent differences: panel/holes 10 levels,
      // photo 5 and dense rebate 2.
      const delta = name === "rebate" ? 2 : name === "photo" ? 5 : 10;
      expect(lum[1] - lum[0], `${mode} ${name} 30→60`).toBeGreaterThan(delta);
      expect(lum[2] - lum[1], `${mode} ${name} 60→100`).toBeGreaterThan(delta);
    }
    for (let step = 1; step < captures.length; step++) {
      let reversals = 0;
      let pixels = 0;
      for (const { x, y: cy, halfWidth, halfHeight } of photos) {
        for (let y = cy - halfHeight; y < cy + halfHeight; y++) for (let px = x - halfWidth; px < x + halfWidth; px++) {
          const i = (y * captures[step].width + px) * 4;
          const lum = (png: typeof captures[number]) => 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
          if (lum(captures[step]) < lum(captures[step - 1]) - 2) reversals++;
          pixels++;
        }
      }
      expect(reversals / pixels, "fixed film regions cannot darken as illumination rises").toBeLessThan(0.001);
    }
    expect(getRegionStats(captures[2], ...regions.panel).meanLum).toBeGreaterThan(240);
    expect(getRegionStats(captures[0], ...regions.panel).meanLum).toBeLessThan(175);
  }

  // Physically scaled film fills Overview; the table edge is outside that view.
  // Zoom out through the viewer before measuring actual spill and unlit room.
  await closeViewingTools(page);
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  while (Number(await page.locator("main").getAttribute("data-inspect-zoom")) < 3.2) {
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(50);
  }
  const { project } = await sampleGeometry(page);
  const spill = [...project(1.93, -.5, -.08), 12] as const;
  const unlitSurround = [...project(-2.5, -1.15, -.98), 20] as const;
  for (const mode of ["positive", "negative"]) {
    await openViewingTools(page);
    if (mode === "negative") await page.getByTestId("mode-toggle").click();
    const values: { spill: number; unlit: number }[] = [];
    for (const brightness of [30, 60, 100]) {
      await dim(page, brightness);
      const png = await capture(page, `surround-${mode}-${brightness}`);
      values.push({ spill: getRegionStats(png, ...spill).meanLum, unlit: getRegionStats(png, ...unlitSurround).meanLum });
    }
    expect(values[1].spill - values[0].spill, `${mode} spill 30→60`).toBeGreaterThan(1);
    expect(values[2].spill - values[1].spill, `${mode} spill 60→100`).toBeGreaterThan(1);
    expect(Math.abs(values[2].unlit - values[0].unlit), "dimmer must remain local").toBeLessThan(2);
    measurements[`${mode}-surround`] = values;
  }
  fs.writeFileSync(path.join(output, "transmission-measurements.json"), JSON.stringify(measurements, null, 2));

  const environment = await page.evaluate(() => {
    const gl = document.querySelector("canvas")!.getContext("webgl2")!;
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    return { userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight],
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, "browser.json"), JSON.stringify(environment, null, 2));
  expect(errors).toEqual([]);
});

for (const brightness of [30, 100]) {
  test(`M10 macro pan and room return at ${brightness}%`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/guest?deterministic=true&mode=inspect"); await openViewingTools(page);
    await expect(page.locator("canvas")).toBeVisible();
    await page.getByTestId("mode-toggle").click();
    await dim(page, brightness);
    await page.mouse.move(640, 400);
    for (let i = 0; i < 60 && await page.getByTestId("zoom-badge").textContent() !== "1000%"; i++) {
      await page.mouse.wheel(0, -350);
      await page.waitForTimeout(50);
    }
    await expect(page.getByTestId("zoom-badge")).toHaveText("1000%");
    const before = await capture(page, `macro-${brightness}`);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(400, 400, { steps: 10 });
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(250);
    const after = await capture(page, `macro-pan-${brightness}`);
    expect(getRegionMeanDifference(before, after, 640, 400, 100)).toBeGreaterThan(2);
    await viewerKey(page, "0");
    await viewerKey(page, "Escape");
    await expect(page.locator("main")).toHaveAttribute("data-is-transitioning", "false");
    await expect(page.locator("main")).toHaveAttribute("data-room-mode", "room");
    await capture(page, `room-${brightness}`);
    await viewerKey(page, "Enter");
    await expect(page.locator("main")).toHaveAttribute("data-is-transitioning", "false");
    await expect(page.getByTestId("brightness-badge")).toHaveText(`${brightness}%`);
    expect(errors).toEqual([]);
  });
}

for (const mode of ["negative", "positive"]) for (const brightness of [30, 100]) {
for (const magnifications of [[1.5, 2.5], [4, 8, 10]]) {
test(`M10 linear HDR loupe: ${mode} ${brightness}% at ${magnifications.join(",")}x`, async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/guest?deterministic=true&mode=inspect"); await openViewingTools(page);
  await expect(page.locator("canvas")).toBeVisible();
  const { regions, box, heights } = await sampleGeometry(page);
  const comparisons: unknown[] = [];
  if (mode === "positive") await page.getByTestId("mode-toggle").click();
      await dim(page, brightness);
      // Both magnification groups run independently; keep their source evidence separate.
      const source = await capture(page, `source-${mode}-${brightness}-${magnifications[0]}`);
      await page.getByTestId("loupe-toggle").click();
      for (const mag of magnifications) {
        // Visible preset buttons plus existing keyboard increments reach endpoints.
        await page.getByTestId("mag-btn-2x").click();
        await viewerKey(page, "-"); // 1.5x lower limit
        if (mag === 2.5) await viewerKey(page, "+");
        if (mag === 4 || mag === 8) await page.getByTestId(`mag-btn-${mag}x`).click();
        if (mag === 10) {
          await page.getByTestId("mag-btn-8x").click();
          await viewerKey(page, "+"); await viewerKey(page, "+");
        }
        for (const name of ["photo", "rebate", "hole", "panel"] as const) {
          const [x, y] = regions[name];
          const center = await placeLoupeAtScreenPoint(page, box.x + x, box.y + y, heights[name]);
          await page.waitForTimeout(180);
          const lens = await capture(page, `loupe-${mode}-${brightness}-${mag}-${name}`);
          const lx = center.x, ly = center.y;
          const a = getRegionStats(source, x, y, 2);
          // Compare the same photographed area: a fixed 3×3 lens patch at 10×
          // samples one-hundredth of the source area and is not a color match.
          const zoom = Number(await page.locator("main").getAttribute("data-inspect-zoom"));
          const scale = Number(await page.locator("canvas").getAttribute("data-loupe-scale"));
          const imageScale = mag * (zoom - heights[name]) / (zoom - .008 - LOUPE_LENS_HEIGHT * scale);
          const lensSampleSize = 2 * Math.round((3 * imageScale - 1) / 2);
          const b = getRegionStats(lens, lx, ly, lensSampleSize);
          const differences = [Math.abs(a.meanR - b.meanR), Math.abs(a.meanG - b.meanG), Math.abs(a.meanB - b.meanB)];
          comparisons.push({ mode, brightness, mag, name, lensSampleSize, source: a, lens: b, differences });
          fs.writeFileSync(path.join(output, `loupe-measurements-${mode}-${brightness}-${magnifications[0]}.json`), JSON.stringify(comparisons, null, 2));
          expect(Math.max(...differences), `${mode} ${brightness}% ${mag}x ${name} linear color agreement`).toBeLessThan(16);
        }
      }
      if (magnifications[0] === 4) {
      const times = await page.evaluate(async () => {
        const frames: number[] = [];
        let last = performance.now();
        for (let i = 0; i < 90; i++) {
          const now = await new Promise<number>(resolve => requestAnimationFrame(resolve));
          if (i > 4) frames.push(now - last);
          last = now;
        }
        return frames.sort((a, b) => a - b);
      });
      fs.writeFileSync(path.join(output, `frame-times-${mode}-${brightness}.json`), JSON.stringify({ median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)], samples: times }));
      }
      await page.getByTestId("loupe-toggle").click();
  expect(errors).toEqual([]);
});
}
}


test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes("ordered transmission") && testInfo.status === "passed") {
    const video = page.video();
    await page.close();
    if (video) await video.saveAs(path.join(output, "dimmer-interaction.webm"));
  }
});
