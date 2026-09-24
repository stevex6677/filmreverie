import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { assetPath } from './shared-assets.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frames = [
  ...JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/data/photoSources.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/data/localRoll.json'), 'utf8')).frames,
];

// Explicit authoring command only. Dev/build validate the committed derivatives
// without touching originals, shared storage, or external image converters.
for (const frame of frames) {
  if (!frame.source) continue;
  const sharedSource = assetPath(frame.source);
  const source = fs.existsSync(sharedSource) ? sharedSource : path.join(projectRoot, frame.source);
  if (!fs.existsSync(source)) throw new Error(`Photo source missing: ${source}`);
  const version = createHash('sha256').update('jpeg92-thumbnail384-v1\n').update(fs.readFileSync(source)).digest('hex');
  const derivative = path.join(projectRoot, '.cache', 'photo-derivatives', version, 'photo.jpg');
  const thumbnail = path.join(projectRoot, '.cache', 'photo-derivatives', version, 'photo.thumb.jpg');
  fs.mkdirSync(path.dirname(derivative), { recursive: true });

  if (!fs.existsSync(derivative)) {
    const temporary = derivative.replace(/\.jpg$/, `.${randomUUID()}.jpg`);
    try {
      try {
        execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', source, '--out', temporary], { stdio: 'pipe' });
      } catch {
        execFileSync('ffmpeg', ['-y', '-i', source, '-q:v', '2', temporary], { stdio: 'pipe' });
      }
      fs.renameSync(temporary, derivative);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  if (!fs.existsSync(thumbnail)) {
    const temporary = thumbnail.replace(/\.jpg$/, `.${randomUUID()}.jpg`);
    try {
      execFileSync('ffmpeg', ['-y', '-i', derivative, '-vf', 'scale=384:-2', '-q:v', '4', temporary], { stdio: 'pipe' });
      fs.renameSync(temporary, thumbnail);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  const published = path.join(projectRoot, 'public', frame.src);
  const publishedThumb = frame.thumbnailSrc
    ? path.join(projectRoot, 'public', frame.thumbnailSrc)
    : published.replace(/\.jpg$/, '.thumb.jpg');
  for (const [input, output] of [[derivative, published], [thumbnail, publishedThumb]]) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.copyFileSync(input, output);
  }
}
console.log('Photo derivatives published. Review and commit the public images with their source changes.');
