import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(repo, 'shared-assets.json'), 'utf8'));
// Linked worktrees share authoring media in their main checkout. Source archives
// without Git metadata use their own root; runtime preparation never imports this.
const commonDir = !process.env.FILM_PHOTO_SHARED_ROOT && fs.existsSync(path.join(repo, '.git'))
  ? execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repo, encoding: 'utf8' }).trim()
  : null;
export const sharedRoot = path.resolve(process.env.FILM_PHOTO_SHARED_ROOT || (commonDir ? path.dirname(commonDir) : repo));
if (!fs.statSync(sharedRoot).isDirectory()) throw new Error(`Unavailable shared root: ${sharedRoot}`);
export const assetPath = (relative) => path.join(sharedRoot, config.assets_directory, relative);
export const generatedPath = (relative) => path.join(sharedRoot, config.generated_directory, relative);
