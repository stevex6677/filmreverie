import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const sourceDir = path.join(projectRoot, "photos", "roll-01");
const targetDir = path.join(projectRoot, "public", "assets", "photos");

if (!fs.existsSync(sourceDir)) {
  console.error("Source directory not found: " + sourceDir);
  process.exit(1);
}

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const frames = [
  "frame-01-harbor",
  "frame-02-diner",
  "frame-03-bicycle",
  "frame-04-laundromat",
  "frame-05-road",
];

for (const frame of frames) {
  const srcPng = path.join(sourceDir, frame + ".png");
  const dstJpg = path.join(targetDir, frame + ".jpg");

  if (!fs.existsSync(srcPng)) {
    console.error("Source file missing: " + srcPng);
    process.exit(1);
  }

  let needsBuild = !fs.existsSync(dstJpg);
  if (!needsBuild) {
    const srcStat = fs.statSync(srcPng);
    const dstStat = fs.statSync(dstJpg);
    if (srcStat.mtimeMs > dstStat.mtimeMs) {
      needsBuild = true;
    }
  }

  if (needsBuild) {
    console.log("Generating derivative for " + frame + "...");
    try {
      execSync("sips -s format jpeg -s formatOptions 92 \"" + srcPng + "\" --out \"" + dstJpg + "\"", {
        stdio: "inherit",
      });
    } catch {
      console.warn("sips failed; copying source file as fallback.");
      fs.copyFileSync(srcPng, path.join(targetDir, frame + ".png"));
    }
  }
}

console.log("Local photo derivatives are ready in public/assets/photos/");
