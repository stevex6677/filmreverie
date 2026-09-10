import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
const output = "artifacts/m11-candidates";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: `${output}/recording`, size: { width: 1280, height: 800 } } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
page.on("requestfailed", request => errors.push(request.url()));
const main = page.locator("main");
const settle = async () => { await expect(main).toHaveAttribute("data-is-transitioning", "false"); await page.waitForTimeout(1200); };
try {
  await page.goto(process.env.M11_REVIEW_URL || "http://127.0.0.1:5192/?fixture=36&mode=inspect");
  await expect(main).toHaveAttribute("data-assets-ready", "true", { timeout: 30000 }); await settle();
  await page.getByTestId("mode-toggle").click(); await settle();
  await page.screenshot({ path: `${output}/animated-overview.png` });
  const box = await page.locator("canvas").boundingBox();
  const anchor = { x: box.x + box.width * .62, y: box.y + box.height * .43 };
  const priorZoom = Number(await main.getAttribute("data-inspect-zoom"));
  const priorPan = (await main.getAttribute("data-inspect-pan")).split(",").map(Number);
  await page.mouse.move(anchor.x, anchor.y); await page.mouse.wheel(0, -150); await settle();
  const nextZoom = Number(await main.getAttribute("data-inspect-zoom"));
  const nextPan = (await main.getAttribute("data-inspect-pan")).split(",").map(Number);
  const factor = 2 * Math.tan(Math.PI / 8) / box.height;
  const beforeWorld = [priorPan[0] + (anchor.x - box.x - box.width / 2) * priorZoom * factor, priorPan[1] + (anchor.y - box.y - box.height / 2) * priorZoom * factor];
  const afterWorld = [nextPan[0] + (anchor.x - box.x - box.width / 2) * nextZoom * factor, nextPan[1] + (anchor.y - box.y - box.height / 2) * nextZoom * factor];
  expect(nextZoom).toBeLessThan(priorZoom);
  expect(Math.hypot(beforeWorld[0] - afterWorld[0], beforeWorld[1] - afterWorld[1])).toBeLessThan(.002);
  await page.keyboard.down("Space"); await page.mouse.down(); await page.mouse.move(anchor.x + 80, anchor.y + 45, { steps: 12 }); await page.mouse.up(); await page.keyboard.up("Space"); await settle();
  expect(await main.getAttribute("data-inspect-pan")).not.toBe(nextPan.join(","));
  await expect(main).toHaveAttribute("data-inspection-level", "roll");
  const overviewPan = await main.getAttribute("data-inspect-pan");
  await page.getByRole("button", { name: "Open frame 29", exact: true }).click(); await settle();
  await page.screenshot({ path: `${output}/frame-29-no-overlays.png` });
  await page.getByTestId("loupe-toggle").click(); await settle();
  for (const frame of [30, 31]) {
    await page.getByRole("button", { name: "Next", exact: true }).click(); await settle();
    await expect(main).toHaveAttribute("data-selected-frame", String(frame));
    await page.screenshot({ path: `${output}/animated-frame-${frame}.png` });
  }
  const samples = await page.evaluate(() => new Promise(resolve => {
    const samples = []; let last = performance.now();
    function next(now) { samples.push(now - last); last = now; if (samples.length < 31) requestAnimationFrame(next); else resolve(samples.slice(1)); }
    requestAnimationFrame(next);
  }));
  await page.getByRole("button", { name: "Whole roll", exact: true }).click(); await settle();
  await expect(main).toHaveAttribute("data-inspect-pan", overviewPan);
  await page.getByRole("button", { name: "Strip 6", exact: true }).click(); await settle();
  await page.screenshot({ path: `${output}/strip-6.png` });
  await page.getByTestId("return-room-btn").click(); await settle();
  await expect(main).toHaveAttribute("data-room-mode", "room");
  await page.screenshot({ path: `${output}/room.png` });
  expect(errors).toEqual([]);
  fs.writeFileSync(`${output}/animated-checks.json`, JSON.stringify({ browser: browser.version(), viewport: { width: 1280, height: 800 }, pointerAnchorError: Math.hypot(beforeWorld[0] - afterWorld[0], beforeWorld[1] - afterWorld[1]), loupeActiveFrameTimesMs: samples, errors }, null, 2));
} finally {
  await context.close();
  await page.video().saveAs(`${output}/m11-interaction.webm`);
  await browser.close();
}
