import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateCatalog } from '../standalone/model-viewer/catalog.mjs';

export function prepareCamera() {
  // Local decoder files are part of the essential offline shell, so a cached
  // compressed model can also be opened after a fresh offline page load.
  const decoderTarget = new URL('../public/assets/draco/', import.meta.url);
  fs.mkdirSync(decoderTarget, { recursive: true });
  for (const file of ['draco_decoder.js', 'draco_wasm_wrapper.js', 'draco_decoder.wasm']) {
    fs.copyFileSync(new URL(`../node_modules/three/examples/jsm/libs/draco/gltf/${file}`, import.meta.url), new URL(file, decoderTarget));
  }
  const catalog = JSON.parse(fs.readFileSync(new URL('../standalone/model-viewer/models.json', import.meta.url)));
  const models = validateCatalog(catalog, fileURLToPath(new URL('../public/', import.meta.url))).models;
  const currentFiles = fs.readdirSync(new URL('../blender/', import.meta.url), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(new URL(`../blender/${entry.name}/CURRENT.json`, import.meta.url)))
    .map(entry => JSON.parse(fs.readFileSync(new URL(`../blender/${entry.name}/CURRENT.json`, import.meta.url))));
  for (const [index, entry] of catalog.models.entries()) {
    if (!entry.widthMm) continue;
    const current = currentFiles.find(candidate => candidate.model_id === entry.id);
    const asset = `assets/cameras/${entry.id}-${entry.sha256}.glb`;
    if (!current || entry.asset !== asset || current.browser_glb.published_path !== `public/${asset}` || entry.sha256 !== current.browser_glb.sha256) throw new Error(`Camera catalog disagrees with CURRENT.json: ${entry.id}`);
    if (current.browser_glb.source_blend_sha256 !== current.editable_blend.sha256) throw new Error(`Camera export source does not match editable master: ${entry.id}`);
    const bytes = fs.readFileSync(models[index].file);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== entry.sha256 || bytes.length !== current.browser_glb.bytes) throw new Error(`Camera checksum or size mismatch: ${entry.id}`);
    console.log(`Camera asset verified: ${entry.id} (${hash})`);
  }
}
