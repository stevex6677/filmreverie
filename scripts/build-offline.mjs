import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
const root = path.resolve('dist');
// Raster installation icons are generated build output, not tracked binaries.
for (const size of [180, 192, 512]) {
  const canvas = createCanvas(size, size), c = canvas.getContext('2d');
  c.fillStyle = '#171813'; c.fillRect(0, 0, size, size);
  c.fillStyle = '#c1b894'; c.fillRect(size * .22, size * .26, size * .56, size * .48);
  c.fillStyle = '#292b21'; c.fillRect(size * .29, size * .35, size * .42, size * .3);
  for (let i = 0; i < 6; i++) for (const y of [.28, .68]) c.clearRect(size * (.25 + i * .088), size * y, size * .055, size * .04);
  await writeFile(path.join(root, `icon-${size}.png`), canvas.toBuffer('image/png'));
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function inventory(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(file));
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
