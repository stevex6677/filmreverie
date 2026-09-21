import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { generatedPath } from './shared-assets.js';

export function prepareCamera() {
  const catalog = JSON.parse(fs.readFileSync(new URL('../standalone/model-viewer/models.json', import.meta.url)));
  const currentFiles = fs.readdirSync(new URL('../blender/', import.meta.url), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(new URL(`../blender/${entry.name}/CURRENT.json`, import.meta.url)))
    .map(entry => JSON.parse(fs.readFileSync(new URL(`../blender/${entry.name}/CURRENT.json`, import.meta.url))));
  for (const entry of catalog.models.filter(model => model.widthMm)) {
    const current = currentFiles.find(candidate => candidate.model_id === entry.id);
    if (!current || entry.asset !== current.browser_glb.path || entry.sha256 !== current.browser_glb.sha256) throw new Error(`Camera catalog disagrees with CURRENT.json: ${entry.id}`);
    if (current.browser_glb.source_blend_sha256 !== current.editable_blend.sha256) throw new Error(`Camera export source does not match editable master: ${entry.id}`);
    const source = generatedPath(entry.asset);
    const hash = createHash('sha256').update(fs.readFileSync(source)).digest('hex');
    if (hash !== entry.sha256) throw new Error(`Camera checksum mismatch: ${entry.id}`);
    const target = new URL(`../public/assets/cameras/${entry.id}-${hash}.glb`, import.meta.url);
    fs.mkdirSync(path.dirname(target.pathname), { recursive: true });
    fs.copyFileSync(source, target);
    console.log(`Camera asset verified: ${entry.id} (${hash})`);
  }
}
