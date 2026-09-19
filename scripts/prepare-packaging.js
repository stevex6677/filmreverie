import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assetPath, generatedPath } from './shared-assets.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/film-packaging/manifest.json'), 'utf8'));
export function preparePackaging() {
  const sources = manifest.entries.flatMap(entry => [entry.box, ...(entry.cartridge ? [entry.cartridge] : [])]);
  for (const source of sources) {
    const original = assetPath(source.sourcePath);
    const target = path.join(root, 'public', source.asset);
    let bytes;
    if (fs.existsSync(original)) {
      bytes = fs.readFileSync(original);
    } else if (fs.existsSync(target)) {
      bytes = fs.readFileSync(target);
    } else {
      throw new Error(`Packaging source missing: ${original}. Run npm run fetch:packaging in the mapped checkout.`);
    }
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error(`Packaging checksum mismatch: ${original}`);
    // Byte-identical, content-addressed serving copies. Panel projection and
    // desaturation happen in the material; the source photograph is untouched.
    const durable = generatedPath(`film-packaging/textures/${source.sha256}/${source.file}`);
    fs.mkdirSync(path.dirname(durable), { recursive: true });
    if (!fs.existsSync(durable)) fs.writeFileSync(durable, bytes);
    if (!fs.existsSync(target) || fs.readFileSync(target).compare(bytes) !== 0) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(durable, target);
    }
  }
  console.log(`Film packaging ready: ${manifest.entries.length} variants, ${sources.length} source photographs.`);
}
