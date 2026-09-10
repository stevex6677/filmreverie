import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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

const frames = [...JSON.parse(fs.readFileSync(path.join(projectRoot, "src/data/photoSources.json"), "utf8")), ...JSON.parse(fs.readFileSync(path.join(projectRoot, "src/data/localRoll.json"), "utf8")).frames];

for (const frame of frames) {
  if (!frame.source) continue; // Runtime-only sources are handled by the viewer's per-slot error/retry UI.
  const srcPng = path.join(projectRoot, frame.source);
  const dstJpg = path.join(projectRoot, "public", frame.src);
  fs.mkdirSync(path.dirname(dstJpg), { recursive: true });

  if (!fs.existsSync(srcPng)) {
    console.error("Source file missing: " + srcPng);
    if (frame.source.startsWith("photos/roll-01/")) process.exit(1);
    continue;
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
    console.log("Generating derivative for " + frame.id + "...");
    let converted = false;
    try {
      execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "92", srcPng, "--out", dstJpg], { stdio: "pipe" });
      converted = true;
    } catch {}

    if (!converted) {
      try {
        execFileSync("ffmpeg", ["-y", "-i", srcPng, "-q:v", "2", dstJpg], { stdio: "pipe" });
        converted = true;
      } catch {}
    }

    if (!converted) {
      throw new Error("Unable to prepare JPEG derivative: " + srcPng);
    }
  }
  const thumbnail = frame.thumbnailSrc ? path.join(projectRoot, "public", frame.thumbnailSrc) : dstJpg.replace(/\.jpg$/, ".thumb.jpg");
  if (!fs.existsSync(thumbnail) || needsBuild) {
    fs.mkdirSync(path.dirname(thumbnail), { recursive: true });
    execFileSync("ffmpeg", ["-y", "-i", dstJpg, "-vf", "scale=384:-2", "-q:v", "4", thumbnail], { stdio: "pipe" });
  }
}

console.log("Local photo derivatives are ready in public/assets/photos/");
