import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { assetPath } from './shared-assets.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/assets/film-packaging/manifest.json'), 'utf8'));
for (const entry of manifest.entries) for (const source of [entry.box, ...(entry.cartridge ? [entry.cartridge] : [])]) {
  const target = assetPath(source.sourcePath);
  if (fs.existsSync(target)) {
    if (createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== source.sha256) throw new Error(`Existing source differs; preserved ${target}`);
    continue;
  }
  const response = await fetch(source.imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}: ${source.imageUrl}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error(`Remote source changed: ${source.imageUrl}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, target);
  console.log(`Downloaded ${source.file}`);
}
