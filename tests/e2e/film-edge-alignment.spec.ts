import { openViewingTools, openFrame, captureCanvas } from "./helpers/viewing";
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import fs from "node:fs/promises";

for (const format of ["135", "67"]) test(`${format} photo edges stay aligned with the curved film`, async ({ page }) => {
  await page.goto("/guest?mode=inspect&reduced_motion=true");
  await page.getByRole("button", { name: "Rolls", exact: true }).click();
  await page.getByRole("button", { name: "New roll", exact: true }).click();
  const png = new PNG({ width: 600, height: 400 });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([40, 180, 70, 255], i);
  await page.getByLabel("Choose photographs").setInputFiles([{ name: "green.png", mimeType: "image/png", buffer: PNG.sync.write(png) }]);
  await page.getByRole("button", { name: "Continue to roll details", exact: true }).click();
  await page.getByLabel("Roll name", { exact: true }).fill("Edge alignment");
  await page.getByRole("radio", { name: format === "135" ? "35mm" : "120", exact: true }).check();
  await page.getByLabel("Film format", { exact: true }).selectOption(format);
  await page.getByRole("button", { name: "Review photographs", exact: true }).click();
  await page.getByRole("button", { name: "Save and open", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-assets-ready", "true");
  await expect(page.locator("main")).toHaveAttribute("data-is-transitioning", "false");
  await openFrame(page,1);
  await expect(page.locator("main")).toHaveAttribute("data-is-transitioning", "false");
  await openViewingTools(page);await page.getByRole("button", { name: "Switch to Positive", exact: true }).click();
  await page.waitForTimeout(700);
  const output = `${process.env.M14_CANDIDATE_DIR || 'artifacts/m14-candidates'}/edge-alignment`;
  await fs.mkdir(output, { recursive: true });
  const capture = PNG.sync.read(await captureCanvas(page, { path: `${output}/${format}.png` }));
  const rows: { y: number; left: number; right: number }[] = [];
  for (let y = 20; y < capture.height - 20; y++) {
    const hits: number[] = [];
    // Scan the full canvas: the closer Focus default extends beyond the old
    // fixed crop. Both photo edges must still lie inside the scanned region.
    for (let x = 1; x < capture.width - 1; x++) {
      const i = (y * capture.width + x) * 4;
      if (capture.data[i + 1] > capture.data[i] + 35 && capture.data[i + 1] > capture.data[i + 2] + 35) hits.push(x);
    }
    if (hits.length > 150) rows.push({ y, left: hits[0], right: hits[hits.length - 1] });
  }
  expect(rows.length).toBeGreaterThan(150);
  const interior = rows.slice(5, -5);
  expect(Math.min(...interior.map(row => row.left))).toBeGreaterThan(1);
  expect(Math.max(...interior.map(row => row.right))).toBeLessThan(capture.width - 2);
  // Curl may shift the projected edge by a subpixel; an abrupt multi-pixel
  // step means the substrate is cutting across the photograph again.
  for (const edge of ["left", "right"] as const) {
    expect(Math.max(...interior.map(row => row[edge])) - Math.min(...interior.map(row => row[edge]))).toBeLessThanOrEqual(1);
  }
  await fs.writeFile(`${output}/${format}.json`, JSON.stringify(rows));
});
