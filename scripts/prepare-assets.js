import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preparePackaging } from './prepare-packaging.js';
import { prepareCamera } from './prepare-camera.js';

preparePackaging();
prepareCamera();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const frames = [
  ...JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/data/photoSources.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/data/localRoll.json'), 'utf8')).frames,
];
for (const frame of frames) {
  // Entries without a source may be supplied by the runtime error/retry fixture.
  if (!frame.source) continue;
  for (const asset of [frame.src, frame.thumbnailSrc ?? frame.src.replace(/\.jpg$/, '.thumb.jpg')]) {
    const file = path.join(projectRoot, 'public', asset);
    if (!fs.existsSync(file)) {
      throw new Error(`Tracked photo asset missing: ${file}. Restore it from Git or run npm run prepare:photos.`);
    }
  }
}
console.log('Tracked photo assets are ready; no authoring media or conversion tools required.');
