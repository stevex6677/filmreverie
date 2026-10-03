import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const referencesDir = path.join(projectRoot, 'film_filter_references');

import { FILM_LOOKS, filmGrainSeed } from '../src/data/filmLooks.ts';
import { applyFilmLookToBuffer } from '../src/shaders/filmLook.ts';

const STOCK_NAMES = {
  'ultramax-400': 'Kodak Ultramax 400',
  'fuji-200': 'Fujifilm 200',
  'pro-image-100': 'Kodak Pro Image 100',
  'gold-200': 'Kodak Gold 200',
  'portra-160': 'Kodak Portra 160',
  'portra-400': 'Kodak Portra 400',
  'portra-800': 'Kodak Portra 800',
  'ektar-100': 'Kodak Ektar 100',
  'ektachrome-e100': 'Kodak Ektachrome E100',
  'provia-100': 'Fujifilm Provia 100F',
  'velvia-50': 'Fujifilm Velvia 50',
  'velvia-100': 'Fujifilm Velvia 100',
};

const FILM_STOCKS = Object.entries(FILM_LOOKS).map(([id, look]) => ({
  id,
  name: STOCK_NAMES[id] || id,
  ...look
}));

const SCENES = [
  { file: '01_sunny.jpg', label: 'Sunny Daylight (High Contrast, Clear Blue Sky, Warm Sunlight)' },
  { file: '02_cloudy.jpg', label: 'Cloudy / Overcast (Diffuse Soft Light, Muted Greens, Wet Mist)' },
  { file: '03_rainy.jpg', label: 'Rainy Evening (Raindrops on Glass, Traffic Bokeh, Cool Tones)' },
  { file: '04_sunset.jpg', label: 'Sunset Golden Hour (Warm Backlight, Flare, Low Golden Sun)' },
  { file: '05_portrait.jpg', label: 'Portrait Natural Light (Subtle Skin Tones, Red Lips, Soft Shadow)' }
];

async function run() {
  console.log(`Processing reference images in: ${referencesDir}`);

  for (const scene of SCENES) {
    const srcPath = path.join(referencesDir, scene.file);
    const sceneBase = scene.file.replace('.jpg', '');
    console.log(`\n--- Loading ${scene.file} (${scene.label}) ---`);
    const imgBuf = await fs.readFile(srcPath);
    const img = await loadImage(imgBuf);
    const { width, height } = img;

    const stockImages = [];

    for (const stock of FILM_STOCKS) {
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, width, height);
      const seed = filmGrainSeed(`${sceneBase}-${stock.id}`);
      applyFilmLookToBuffer(imageData, width, height, stock, 50, seed);
      ctx.putImageData(imageData, 0, 0);

      const outFilename = `${sceneBase}_${stock.id}.jpg`;
      const outPath = path.join(referencesDir, outFilename);
      const buf = canvas.toBuffer('image/jpeg', { quality: 95 });
      await fs.writeFile(outPath, buf);
      console.log(`  Wrote ${outFilename} (${buf.length} bytes)`);

      stockImages.push({ stock, canvas });
    }

    // Generate comparison sheet for this scene (3 rows x 3 columns = 9 tiles)
    const cellW = 560;
    const cellH = Math.round(cellW * (height / width));
    const pad = 20;
    const headerH = 70;
    const labelH = 34;

    const sheetW = cellW * 3 + pad * 4;
    const sheetH = headerH + (cellH + labelH + pad) * 3 + pad;

    const sheetCanvas = createCanvas(sheetW, sheetH);
    const sCtx = sheetCanvas.getContext('2d');

    sCtx.fillStyle = '#12151a';
    sCtx.fillRect(0, 0, sheetW, sheetH);

    // Title header
    sCtx.fillStyle = '#f0ebe1';
    sCtx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sCtx.fillText(`Film Filter Reference · ${scene.label}`, pad, 40);
    sCtx.fillStyle = '#9ca3af';
    sCtx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    sCtx.fillText(`Default Strength: 50 (Authored Look) · Resolution: ${width}×${height}px`, pad, 62);

    const tiles = [
      { title: 'Original (Bypass / No Filter)', canvas: img },
      ...stockImages.map(si => ({
        title: `${si.stock.name} (${si.stock.description})`,
        canvas: si.canvas
      }))
    ];

    for (let i = 0; i < tiles.length; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = pad + col * (cellW + pad);
      const y = headerH + pad + row * (cellH + labelH + pad);

      sCtx.drawImage(tiles[i].canvas, x, y, cellW, cellH);

      // Label bar
      sCtx.fillStyle = '#1e232d';
      sCtx.fillRect(x, y + cellH, cellW, labelH);
      sCtx.fillStyle = i === 0 ? '#38bdf8' : '#e5e7eb';
      sCtx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      sCtx.fillText(tiles[i].title, x + 10, y + cellH + 22);
    }

    const sheetOut = path.join(referencesDir, `${sceneBase}_comparison.jpg`);
    const sheetBuf = sheetCanvas.toBuffer('image/jpeg', { quality: 92 });
    await fs.writeFile(sheetOut, sheetBuf);
    console.log(`  Generated comparison sheet: ${sceneBase}_comparison.jpg`);
  }

  // Generate All-In-One Matrix Comparison
  console.log('\n--- Generating Overall Matrix Sheet: all_filters_comparison.jpg ---');
  const thumbW = 320;
  const thumbH = 213;
  const pad = 16;
  const headerH = 70;
  const rowH = thumbH + 8;
  const colW = thumbW + 8;

  const cols = 1 + FILM_STOCKS.length; // Original plus every supported stock
  const rows = SCENES.length; // 5 scenes

  const matrixW = pad * 2 + 150 + cols * colW;
  const matrixH = headerH + pad * 2 + rows * rowH + 40;

  const mCanvas = createCanvas(matrixW, matrixH);
  const mCtx = mCanvas.getContext('2d');

  mCtx.fillStyle = '#0f1318';
  mCtx.fillRect(0, 0, matrixW, matrixH);

  mCtx.fillStyle = '#f8fafc';
  mCtx.font = 'bold 26px -apple-system, BlinkMacSystemFont, sans-serif';
  mCtx.fillText('Film Filters — 5 Scenes × 8 Film Stocks (Default Strength 50)', pad, 42);

  const colHeaders = ['Original', ...FILM_STOCKS.map(s => s.name.replace(/^(Kodak|Fujifilm)\s+/, ''))];

  for (let c = 0; c < colHeaders.length; c++) {
    mCtx.fillStyle = c === 0 ? '#38bdf8' : '#fbbf24';
    mCtx.font = 'bold 15px -apple-system, BlinkMacSystemFont, sans-serif';
    mCtx.fillText(colHeaders[c], pad + 150 + c * colW + 10, headerH);
  }

  for (let r = 0; r < rows; r++) {
    const scene = SCENES[r];
    const sceneBase = scene.file.replace('.jpg', '');
    const y = headerH + pad + r * rowH;

    // Row header
    mCtx.fillStyle = '#e2e8f0';
    mCtx.font = 'bold 15px -apple-system, BlinkMacSystemFont, sans-serif';
    const shortLabel = scene.file.replace('.jpg', '').replace('_', ' ').toUpperCase();
    mCtx.fillText(shortLabel, pad, y + thumbH / 2);

    // Col 0: Original
    const origBuf = await fs.readFile(path.join(referencesDir, scene.file));
    const origImg = await loadImage(origBuf);
    mCtx.drawImage(origImg, pad + 150, y, thumbW, thumbH);

    // Cols 1..8: Filtered
    for (let c = 0; c < FILM_STOCKS.length; c++) {
      const stock = FILM_STOCKS[c];
      const filteredBuf = await fs.readFile(path.join(referencesDir, `${sceneBase}_${stock.id}.jpg`));
      const filteredImg = await loadImage(filteredBuf);
      mCtx.drawImage(filteredImg, pad + 150 + (c + 1) * colW, y, thumbW, thumbH);
    }
  }

  const matrixBuf = mCanvas.toBuffer('image/jpeg', { quality: 90 });
  await fs.writeFile(path.join(referencesDir, 'all_filters_comparison.jpg'), matrixBuf);
  console.log('Matrix sheet generated successfully: all_filters_comparison.jpg');

  console.log('\nAll reference images and comparison sheets generated successfully!');
}

run().catch(err => {
  console.error('Error generating filter references:', err);
  process.exit(1);
});
