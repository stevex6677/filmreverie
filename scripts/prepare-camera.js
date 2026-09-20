import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { generatedPath } from './shared-assets.js';

export function prepareCamera() {
  const current = JSON.parse(fs.readFileSync(new URL('../blender/mamiya_universal/CURRENT.json', import.meta.url)));
  const catalog = JSON.parse(fs.readFileSync(new URL('../standalone/model-viewer/models.json', import.meta.url)));
  const model = catalog.models.find(model => model.id === current.model_id);
  if (!model || model.asset !== current.browser_glb.path || model.sha256 !== current.browser_glb.sha256) throw new Error('Camera catalog disagrees with CURRENT.json');
  if (current.browser_glb.source_blend_sha256 !== current.editable_blend.sha256) throw new Error('Camera export source does not match editable master');
  for (const entry of catalog.models.filter(model => model.widthMm)) {
    const source = generatedPath(entry.asset);
    const hash = createHash('sha256').update(fs.readFileSync(source)).digest('hex');
    if (hash !== entry.sha256) throw new Error(`Camera checksum mismatch: ${entry.id}`);
    const target = new URL(`../public/assets/cameras/${entry.id}-${hash}.glb`, import.meta.url);
    fs.mkdirSync(path.dirname(target.pathname), { recursive: true });
    fs.copyFileSync(source, target);
    console.log(`Camera asset verified: ${entry.id} (${hash})`);
  }
}
