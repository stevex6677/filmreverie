import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { assetPath } from './shared-assets.js';

// Optional authoring command for the /showreel soundtracks. Each track is
// extracted from its pinned CC0 archive into shared ignored_assets (read-only);
// --publish writes the tracked runtime excerpt (the first minute, 192 kbps MP3)
// with local ffmpeg. Development and build never run this.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/data/showreelMusic.json'), 'utf8'));
const publish = process.argv.includes('--publish');
const EXCERPT_SECONDS = 70;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const archives = new Map();

async function archive(url, expected) {
  if (archives.has(url)) return archives.get(url);
  const response = await fetch(url, { headers: { 'User-Agent': 'FilmReverieShowreel/1.0 (https://filmreverie.app)' }, signal: AbortSignal.timeout(300000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== expected) throw new Error(`Remote archive changed: ${url}`);
  const file = path.join(os.tmpdir(), `showreel-music-${randomUUID()}.zip`);
  fs.writeFileSync(file, bytes);
  archives.set(url, file);
  return file;
}

try {
  for (const track of manifest.tracks) {
    const target = assetPath(track.source.file);
    if (fs.existsSync(target)) {
      if (sha256(fs.readFileSync(target)) !== track.source.sha256) throw new Error(`Existing source differs; preserved ${target}`);
    } else {
      const zip = await archive(track.source.archive, track.source.archiveSha256);
      const bytes = execFileSync('unzip', ['-p', zip, track.source.entry], { maxBuffer: 1 << 28 });
      if (sha256(bytes) !== track.source.sha256) throw new Error(`Archive entry differs: ${track.source.entry}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const temporary = `${target}.${randomUUID()}.tmp`;
      fs.writeFileSync(temporary, bytes);
      fs.renameSync(temporary, target);
      fs.chmodSync(target, 0o444);
      console.log(`Extracted ${track.source.file}`);
    }
    if (publish) {
      const published = path.join(root, 'public', track.src);
      fs.mkdirSync(path.dirname(published), { recursive: true });
      const temporary = `${published}.${randomUUID()}.mp3`;
      try {
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', target, '-t', String(EXCERPT_SECONDS), '-map_metadata', '-1', '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '192k', temporary]);
        fs.renameSync(temporary, published);
      } finally { fs.rmSync(temporary, { force: true }); }
      console.log(`Published ${track.src}`);
    }
  }
} finally { for (const file of archives.values()) fs.rmSync(file, { force: true }); }
if (publish) console.log('Showreel music published. Review and commit public/assets/music/showreel/.');
