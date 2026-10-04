import { FilmStockProfile } from '../data/filmStocks';
import { FILM_MODEL_UNIT } from '../data/physicalScale';
import { edgePrintProfile } from '../data/filmEdgePrinting';
import { filmEdgeRepeats } from './filmEdgeMarks';
import { FilmStripLayout, getStripDimensions } from './loupeMapping';

// Developed-film factory indices, not camera counters or backing-paper numbers.
// Pitches and evidence limits are recorded in docs/FILM_EDGE_PRINTING.md.
export function film120Marks(layout: FilmStripLayout, stock: FilmStockProfile) {
  const profile = edgePrintProfile(stock.id);
  const marks: { x: number; rail: 'top' | 'bottom'; text?: string; arrow?: boolean; reverse?: boolean }[] = [];
  const label = profile.fujiCode ? `FUJI ${profile.fujiCode}` : stock.rebate.label;
  for (const { index, x } of filmEdgeRepeats(layout, profile.number120PitchMm)) {
    marks.push({ x, rail: 'top', text: String(profile.number120Start + index) });
    if (profile.fujiCode) marks.push({ x: x + 4, rail: 'top', arrow: true, reverse: true });
  }
  for (const { x } of filmEdgeRepeats(layout, profile.label120PitchMm, 11)) {
    marks.push({ x, rail: 'top', text: label });
  }
  if (profile.secondary120PitchMm) {
    for (const { index, x } of filmEdgeRepeats(layout, profile.secondary120PitchMm / 2)) {
      marks.push({ x, rail: 'bottom', arrow: true });
      if (index % 2 === 0) marks.push({ x: x + 3, rail: 'bottom', text: String(1 + index / 2) });
    }
  }
  // Keep partial marks at cut ends; the canvas clips them at their real position.
  return marks;
}

export function draw120Rebate(ctx: CanvasRenderingContext2D, stock: FilmStockProfile, layout: FilmStripLayout, width: number, height: number) {
  const unit = FILM_MODEL_UNIT, dimensions = getStripDimensions(layout);
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
      ctx.beginPath(); ctx.moveTo(mark.x + (mark.reverse ? 1.8 : 0), y - .55); ctx.lineTo(mark.x + (mark.reverse ? 0 : 1.8), y); ctx.lineTo(mark.x + (mark.reverse ? 1.8 : 0), y + .55); ctx.closePath(); ctx.fill();
    } else if (mark.text) ctx.fillText(mark.text, mark.x, y);
  }
  ctx.restore();
}
