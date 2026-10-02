#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { FILM_LOOKS, DEFAULT_FILM_STRENGTH, clampFilmStrength, filmGrainSeed } from '../src/data/filmLooks.ts';
import { applyFilmLookToBuffer } from '../src/shaders/filmLook.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALIASES = {
  'fuji-200': 'fuji-200', 'fuji200': 'fuji-200',
  'pro-image-100': 'pro-image-100', 'proimage100': 'pro-image-100',
  'gold-200': 'gold-200', 'gold200': 'gold-200',
  'portra-160': 'portra-160',
  'portra160': 'portra-160',
  '160': 'portra-160',
  'portra-400': 'portra-400',
  'portra400': 'portra-400',
  '400': 'portra-400',
  'portra-800': 'portra-800',
  'portra800': 'portra-800',
  '800': 'portra-800',
  'ektar-100': 'ektar-100',
  'ektar': 'ektar-100',
  'ektar100': 'ektar-100',
  'ektachrome-e100': 'ektachrome-e100',
  'e100': 'ektachrome-e100',
  'ektachrome': 'ektachrome-e100',
  'provia-100': 'provia-100',
  'provia': 'provia-100',
  'provia100': 'provia-100',
  'rdp': 'provia-100',
  'rdpiii': 'provia-100',
  'velvia-50': 'velvia-50',
  'velvia': 'velvia-50',
  'velvia50': 'velvia-50',
  'rvp': 'velvia-50',
  'rvp50': 'velvia-50',
  'velvia-100': 'velvia-100',
  'velvia100': 'velvia-100',
  'rvp100': 'velvia-100'
};

function printUsage() {
  console.log(`
Usage:
  node scripts/apply-filter.mjs <input-image> <film-stock> [output-image] [strength]

Options / Flags:
  -i, --input <path>       Path to the input image (JPEG, PNG, etc.)
  -s, --stock <name>       Film stock name or ID
  -o, --output <path>      Output file path (default: <input>_<stock>.jpg)
  --strength <0-100>       Filter strength (default: 50)
  -h, --help               Show this help message

Supported Film Stocks:
  - fuji-200         (alias: fuji200)              Fujifilm 200 (Vivid color, fresh greens)
  - pro-image-100    (alias: proimage100)          Kodak Pro Image 100 (Balanced color, natural skin)
  - gold-200         (alias: gold200)              Kodak Gold 200 (Warm golden color, classic grain)
  - portra-160       (aliases: portra160, 160)       Kodak Portra 160 (Soft tones, fine grain)
  - portra-400       (aliases: portra400, 400)       Kodak Portra 400 (Natural warm tone, versatile)
  - portra-800       (aliases: portra800, 800)       Kodak Portra 800 (Rich tones, visible analog grain)
  - ektar-100        (aliases: ektar, ektar100)      Kodak Ektar 100 (Ultra-vivid colors, high contrast)
  - ektachrome-e100  (aliases: e100, ektachrome)     Kodak Ektachrome E100 (Reversal slide, clean whites)
  - provia-100       (aliases: provia, rdpiii)       Fujifilm Provia 100F (Natural color, ultra-fine grain)
  - velvia-50        (aliases: velvia, rvp50)        Fujifilm Velvia 50 (Ultra-vivid color, deep blacks)
  - velvia-100       (aliases: velvia100, rvp100)    Fujifilm Velvia 100 (Vivid saturation, high contrast)

Examples:
  node scripts/apply-filter.mjs photo.jpg portra-400
  node scripts/apply-filter.mjs input.png ektar-100 output.jpg 75
  node scripts/apply-filter.mjs --input portrait.jpg --stock portra-160 --output graded.jpg
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  let inputPath, stockName, outputPath, strength = DEFAULT_FILM_STRENGTH;
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-i' || arg === '--input') {
      inputPath = args[++i];
    } else if (arg === '-s' || arg === '--stock') {
      stockName = args[++i];
    } else if (arg === '-o' || arg === '--output') {
      outputPath = args[++i];
    } else if (arg === '--strength') {
      strength = parseFloat(args[++i]);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (!inputPath && positional.length > 0) inputPath = positional[0];
  if (!stockName && positional.length > 1) stockName = positional[1];
  if (!outputPath && positional.length > 2) outputPath = positional[2];
  if (positional.length > 3 && !isNaN(parseFloat(positional[3]))) strength = parseFloat(positional[3]);

  if (!inputPath) {
    console.error('Error: Input image path is required.');
    printUsage();
    process.exit(1);
  }

  if (!stockName) {
    console.error('Error: Film stock name is required.');
    printUsage();
    process.exit(1);
  }

  const normalizedStock = ALIASES[stockName.toLowerCase()];
  if (!normalizedStock || !FILM_LOOKS[normalizedStock]) {
    console.error(`Error: Unknown film stock "${stockName}".`);
    console.error(`Available stocks: ${Object.keys(FILM_LOOKS).join(', ')}`);
    process.exit(1);
  }

  strength = clampFilmStrength(strength);

  if (!outputPath) {
    const ext = path.extname(inputPath) || '.jpg';
    const base = inputPath.slice(0, inputPath.length - ext.length);
    outputPath = `${base}_${normalizedStock}${ext.toLowerCase() === '.png' ? '.png' : '.jpg'}`;
  }

  return { inputPath, stockId: normalizedStock, outputPath, strength };
}

async function main() {
  const { inputPath, stockId, outputPath, strength } = parseArgs(process.argv);
  const look = FILM_LOOKS[stockId];

  console.log(`Loading:   ${inputPath}`);
  const imgBuf = await fs.readFile(inputPath);
  const img = await loadImage(imgBuf);
  const { width, height } = img;
  console.log(`Image:     ${width}×${height}px`);
  console.log(`Stock:     ${stockId} (${look.description})`);
  console.log(`Strength:  ${strength}/100 (amount = ${(strength / 50).toFixed(2)})`);

  const startTime = Date.now();
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);
  const seed = filmGrainSeed(path.basename(inputPath) + stockId);
  applyFilmLookToBuffer(imageData, width, height, look, strength, seed);
  ctx.putImageData(imageData, 0, 0);

  const isPng = outputPath.toLowerCase().endsWith('.png');
  const outBuf = isPng ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg', { quality: 95 });

  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await fs.writeFile(outputPath, outBuf);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Saved:     ${outputPath} (${(outBuf.length / 1024).toFixed(1)} KB in ${elapsed}s)`);
}

main().catch(err => {
  console.error('Error applying film filter:', err);
  process.exit(1);
});
