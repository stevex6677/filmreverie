import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { assetPath, generatedPath } from "./shared-assets.js";
import { preparePackaging } from './prepare-packaging.js';

preparePackaging();

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
  const localSource = path.join(projectRoot, frame.source);
  const sharedSource = assetPath(frame.source);
  const srcPng = fs.existsSync(sharedSource) ? sharedSource : localSource;

  if (!fs.existsSync(srcPng)) {
    console.error("Source file missing: " + srcPng);
    if (frame.source.startsWith("photos/roll-01/")) process.exit(1);
    continue;
  }

  // Content-addressed derivatives are shared across worktrees. The public copy
  // is a disposable serving/build cache, never the only durable copy.
  const version = createHash('sha256').update('jpeg92-thumbnail384-v1\n').update(fs.readFileSync(srcPng)).digest('hex');
  const dstJpg = generatedPath(`photo-derivatives/${version}/photo.jpg`);
  const thumbnail = generatedPath(`photo-derivatives/${version}/photo.thumb.jpg`);
  fs.mkdirSync(path.dirname(dstJpg), { recursive: true });
  const needsBuild = !fs.existsSync(dstJpg);

  if (needsBuild) {
    console.log("Generating derivative for " + frame.id + "...");
    const temporary = dstJpg.replace(/\.jpg$/, `.${randomUUID()}.jpg`);
    let converted = false;
    try {
      execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "92", srcPng, "--out", temporary], { stdio: "pipe" });
      converted = true;
    } catch {}

    if (!converted) {
      try {
        execFileSync("ffmpeg", ["-y", "-i", srcPng, "-q:v", "2", temporary], { stdio: "pipe" });
        converted = true;
      } catch {}
    }

    if (!converted) {
      fs.rmSync(temporary, { force: true });
      throw new Error("Unable to prepare JPEG derivative: " + srcPng);
    }
    fs.renameSync(temporary, dstJpg);
  }
  if (!fs.existsSync(thumbnail)) {
    const temporary = thumbnail.replace(/\.jpg$/, `.${randomUUID()}.jpg`);
    try {
      execFileSync("ffmpeg", ["-y", "-i", dstJpg, "-vf", "scale=384:-2", "-q:v", "4", temporary], { stdio: "pipe" });
      fs.renameSync(temporary, thumbnail);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  const published = path.join(projectRoot, "public", frame.src);
  const publishedThumb = frame.thumbnailSrc ? path.join(projectRoot, "public", frame.thumbnailSrc) : published.replace(/\.jpg$/, ".thumb.jpg");
  for (const [source, target] of [[dstJpg, published], [thumbnail, publishedThumb]]) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

console.log("Local photo derivatives are ready in public/assets/photos/");
