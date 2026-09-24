// Compose actual browser captures without applying any additional image treatment.
// Run locally: node scripts/m19-review-sheet.mjs <Playwright output> <shared output>
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Supply the Playwright capture directory and a unique shared output directory.');
const files = await readdir(input, { recursive: true });
const folder = files.find(f => f.endsWith('-desktop/strip-ektar-100-50.png'));
if (!folder) throw new Error('Desktop stock comparison captures are missing.');
const captures = path.join(input, path.dirname(folder));
const stocks = ['portra-160','portra-400','portra-800','ektar-100','ektachrome-e100'];
await mkdir(output, { recursive: true });
for (const kind of ['strip','photo']) {
  const cellWidth = 600, cellHeight = kind === 'strip' ? 170 : 400;
  const canvas = createCanvas(cellWidth * 3 + 40, 90 + (cellHeight + 42) * stocks.length);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#14171c'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#eee9df'; ctx.font = '24px sans-serif';
  ctx.fillText(`M19 · ${kind === 'strip' ? 'Five scene photographs' : 'Bicycle detail'} · positive view`,20,32);
  const evidence = [];
  for (const [row,stock] of stocks.entries()) {
    ctx.fillStyle = '#eee9df'; ctx.font = '18px sans-serif';
    ctx.fillText(stock,20,90+row*(cellHeight+42)-9);
    for(const [col,value] of [0,50,100].entries()) {
      if(row===0) {ctx.font='16px sans-serif';ctx.fillText(`${value} · ${value===0?'Original':value===50?'Default':'Strong'}`,20+col*cellWidth,59);}
      const filename = kind === 'strip' ? `strip-${stock}-${value}.png` : `${stock}-positive-${value}.png`;
      const source = path.join(captures,filename), image = await loadImage(source);
      // The baseline Overview film lies at y=310..490. Focus aperture is
      // x=229..1051, y=126..674 at 1280x800; crop only for side-by-side readability.
      if(image.width!==1280 || image.height!==800) throw new Error('Expected desktop 1280×800 captures.');
      if(kind==='strip')ctx.drawImage(image,60,305,1160,190,20+col*cellWidth,90+row*(cellHeight+42),580,95);
      else ctx.drawImage(image,230,127,820,546,20+col*cellWidth,90+row*(cellHeight+42),580,386);
      evidence.push({stock,strength:value,source:filename});
    }
  }
  const png=canvas.toBuffer('image/png');
  await writeFile(path.join(output,`${kind}-comparison.png`),png);
  await writeFile(path.join(output,`${kind}-comparison.json`),JSON.stringify({input:captures,sha256:createHash('sha256').update(png).digest('hex'),captures:evidence},null,2)+'\n');
}
console.log(`Comparison sheets written to ${output}`);
