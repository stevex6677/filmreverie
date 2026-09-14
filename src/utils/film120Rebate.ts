import { FilmStockProfile } from '../data/filmStocks';
import { FilmStripLayout, getStripDimensions } from './loupeMapping';

// Developed-film references and provenance: artifacts/m12-border-review/REFERENCES.md.
// Two independent factory index tracks, not the camera's selected frame format.
// The 728mm exposed span and font are approximations of the photographed rails.
export function film120Marks(layout: FilmStripLayout, stock: FilmStockProfile) {
  const unit = .55 / 36;
  const length = getStripDimensions(layout).width / unit;
  const offset = (layout.filmLengthOffset ?? (layout.frameNumberOffset ?? 0) * (layout.frameWidth + layout.gap)) / unit;
  const marks: { x: number; rail: 'top' | 'bottom'; text?: string; arrow?: boolean }[] = [];
  const label = stock.id === 'ektachrome-e100' ? 'KODAK E100' : stock.rebate.label;
  for (let n = Math.floor(offset / 45.5) - 1; n * 45.5 < offset + length; n++) {
    if (n < 0) continue;
    const x = n * 45.5 + 5 - offset;
    marks.push({ x, rail: 'top', text: String(41 + n % 16) });
    marks.push({ x: x + 11, rail: 'top', text: label });
  }
  for (let n = Math.floor(offset / (728 / 24)) - 1; n * (728 / 24) < offset + length; n++) {
    if (n < 0) continue;
    const x = n * (728 / 24) + 5 - offset;
    marks.push({ x, rail: 'bottom', arrow: true });
    if (n % 2 === 0) marks.push({ x: x + 3, rail: 'bottom', text: String(1 + Math.floor(n / 2) % 12) });
  }
  return marks.filter(mark => mark.x > 1 && mark.x < length - 1);
}

export function draw120Rebate(ctx: CanvasRenderingContext2D, stock: FilmStockProfile, layout: FilmStripLayout, width: number, height: number) {
  const unit = .55 / 36, dimensions = getStripDimensions(layout);
  const sx = width / (dimensions.width / unit), sy = height / (dimensions.height / unit);
  ctx.save();
  // Draw in millimeters so typography does not stretch when the strip changes length.
  ctx.scale(sx, sy);
  ctx.fillStyle = stock.base.rebateText;
  ctx.font = 'bold 1.3px Arial, Helvetica, sans-serif';
  ctx.textBaseline = 'middle';
  const rail = layout.marginY / unit;
  for (const mark of film120Marks(layout, stock)) {
    const y = mark.rail === 'top' ? rail * .48 : dimensions.height / unit - rail * .48;
    if (mark.arrow) {
      ctx.beginPath(); ctx.moveTo(mark.x, y - .55); ctx.lineTo(mark.x + 1.8, y); ctx.lineTo(mark.x, y + .55); ctx.closePath(); ctx.fill();
    } else if (mark.text) ctx.fillText(mark.text, mark.x, y);
  }
  ctx.restore();
}
