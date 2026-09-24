import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/film-packaging/manifest.json'), 'utf8'));
export function preparePackaging() {
  const sources = manifest.entries.flatMap(entry => [entry.box, ...(entry.cartridge ? [entry.cartridge] : [])]);
  for (const source of sources) {
    const target = path.join(root, 'public', source.asset);
    if (!fs.existsSync(target)) {
      throw new Error(`Tracked packaging asset missing: ${target}. Restore it from Git or run npm run fetch:packaging -- --publish.`);
    }
    const bytes = fs.readFileSync(target);
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) {
      throw new Error(`Packaging checksum mismatch: ${target}`);
    }
  }
  for (const entry of manifest.entries) {
    if (entry.singleRollArtwork) fs.accessSync(path.join(root, 'public', entry.singleRollArtwork));
  }
  console.log(`Film packaging ready: ${manifest.entries.length} variants, ${sources.length} source photographs.`);
}
