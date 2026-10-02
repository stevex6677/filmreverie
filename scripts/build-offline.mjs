import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
const root = path.resolve('dist');
// Raster installation icons are generated build output, not tracked binaries.
// They are rendered from the light-table favicon, which keeps its subject inside the maskable safe zone.
const icon = await loadImage(await readFile(path.join(root, 'favicon.svg')));
for (const size of [180, 192, 512]) {
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').drawImage(icon, 0, 0, size, size);
  await writeFile(path.join(root, `icon-${size}.png`), canvas.toBuffer('image/png'));
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// The /showreel photographs and music are online-only; offline preparation never downloads them.
const online = new Set([path.join(root, 'assets', 'photos', 'showreel'), path.join(root, 'assets', 'music', 'showreel')]);
async function inventory(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!online.has(file)) files.push(...await inventory(file)); }
    else if (!['sw.js', 'offline-health.json', '_headers', '_redirects'].includes(entry.name)) files.push(file);
  }
  return files;
}
const assets = [];
const optional = [];
const catalog = JSON.parse(await readFile('standalone/model-viewer/models.json', 'utf8'));
const detailModels = new Set(catalog.models.map(model => '/' + model.asset));
for (const file of (await inventory(root)).sort()) {
  const asset = { url: '/' + path.relative(root, file).split(path.sep).join('/'), hash: hash(await readFile(file)) };
  (detailModels.has(asset.url) ? optional : assets).push(asset);
}
const template = await readFile('src/offline/worker.js', 'utf8');
const version = hash(JSON.stringify({ assets, optional }) + template + (process.env.FILM_PHOTO_RELEASE ?? '')).slice(0, 20);
await writeFile(path.join(root, 'sw.js'), template.replace('__DARKROOM_RELEASE__', JSON.stringify(version)).replace('__DARKROOM_ASSETS__', JSON.stringify(assets)).replace('__DARKROOM_OPTIONAL__', JSON.stringify(optional)));
await writeFile(path.join(root, 'offline-health.json'), JSON.stringify({ app: 'darkroom', version }));
console.log(`Offline release ${version}: ${assets.length} required assets`);
