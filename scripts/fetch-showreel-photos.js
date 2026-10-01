import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { assetPath } from './shared-assets.js';

// Optional authoring command for the /showreel sample rolls. Originals are
// pinned by SHA-1 and kept read-only in shared ignored_assets; --publish writes
// the tracked runtime derivatives. Development and build never run this.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/data/showreelRolls.json'), 'utf8'));
const publish = process.argv.includes('--publish');
const VIEW_EDGE = 2048, THUMB_EDGE = 384;
const SRGB = '/System/Library/ColorSync/Profiles/sRGB Profile.icc';

const sips = (args) => execFileSync('sips', args, { stdio: 'pipe' });
function derive(source, output, edge, quality) {
  const temporary = `${output}.${randomUUID()}.jpg`;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  try {
    // WebGL textures ignore embedded profiles, so convert (e.g. Adobe RGB) to sRGB.
    sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), '-Z', String(edge), '--matchTo', SRGB, source, '--out', temporary]);
    fs.renameSync(temporary, output);
  } finally { fs.rmSync(temporary, { force: true }); }
}

for (const roll of manifest.rolls) for (const frame of roll.frames) {
  const target = assetPath(frame.source.file);
  if (fs.existsSync(target)) {
    if (createHash('sha1').update(fs.readFileSync(target)).digest('hex') !== frame.source.sha1) throw new Error(`Existing source differs; preserved ${target}`);
  } else {
    const response = await fetch(frame.source.imageUrl, { headers: { 'User-Agent': 'FilmReverieShowreel/1.0 (https://filmreverie.app)' }, signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`${response.status}: ${frame.source.imageUrl}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha1').update(bytes).digest('hex') !== frame.source.sha1) throw new Error(`Remote source changed: ${frame.source.imageUrl}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, target);
    fs.chmodSync(target, 0o444);
    console.log(`Downloaded ${frame.source.file}`);
  }
  if (publish) {
    const published = path.join(root, 'public', frame.src);
    derive(target, published, VIEW_EDGE, 80);
    derive(target, published.replace(/\.jpg$/, '.thumb.jpg'), THUMB_EDGE, 80);
    console.log(`Published ${frame.src}`);
  }
}
if (publish) console.log('Showreel derivatives published. Review and commit public/assets/photos/showreel/.');
