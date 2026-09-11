import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(repo, 'shared-assets.json'), 'utf8'));
const platform = { darwin: 'Darwin', linux: 'Linux' }[os.platform()];
const configured = process.env.FILM_PHOTO_SHARED_ROOT || config.main_checkout[platform];
if (!configured) throw new Error('Set FILM_PHOTO_SHARED_ROOT to the main checkout');
export const sharedRoot = path.resolve(configured);
if (!fs.statSync(sharedRoot).isDirectory()) throw new Error(`Unavailable shared root: ${sharedRoot}`);
export const assetPath = (relative) => path.join(sharedRoot, config.assets_directory, relative);
export const generatedPath = (relative) => path.join(sharedRoot, config.generated_directory, relative);
