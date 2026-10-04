import data from '../data/showreelRolls.json' with { type: 'json' };
import { FILM_FORMATS, FILM_UNIT, filmType, formatLayout, frameAspect, frameGapMm, isFilmFormat, rollFormatLabel, type FilmFormat, type FrameSizing } from '../data/filmFormats';
import { FILM_RENDER_SCALE, mm } from '../data/physicalScale';
import { getFilmStock, isFilmStockId, supportsFilmFormat, type FilmStockId } from '../data/filmStocks';
import { getStripDimensions } from '../utils/loupeMapping';
import { createRollLayout, type RollDefinition } from '../utils/rollLayout';
import { DEFAULT_TABLE_BRIGHTNESS } from '../utils/cameraBounds';

/**
 * The showreel's rolls: every photograph in public/assets/photos/showreel/, one
 * roll per folder (see scripts/showreel-manifest.ts). They are runtime definitions
 * only: nothing is written to a darkroom library or the published gallery.
 * All of them lie on the light table at once, at their true physical size.
 */
export interface ShowreelRoll {
  definition: RollDefinition; stockId: FilmStockId; format: FilmFormat; sizing: FrameSizing;
  name: string; stockName: string; formatLabel: string;
  /** Where the roll lies on the light table (table-local, world units); its strips are centred on it. */
  offset: { x: number; y: number };
  /** The roll's extent on the table (world units). */
  width: number; height: number;
}

const rolls = data.rolls.map(roll => {
  if (!isFilmFormat(roll.format) || !isFilmStockId(roll.stockId) || !supportsFilmFormat(roll.stockId, roll.format) || (roll.sizing !== 'fixed' && roll.sizing !== 'free')) throw new Error(`Unsupported showreel roll ${roll.id}`);
  const format = roll.format, stockId = roll.stockId, sizing: FrameSizing = roll.sizing;
  // The same frame spacing and free-frame strips as rolls made in the roll editor.
  const layout = { ...formatLayout(format), gap: frameGapMm(format, sizing) * FILM_UNIT };
  const frames = roll.frames.map((frame, i) => ({ id: frame.id, order: i + 1, src: frame.src, title: `${roll.name} · ${i + 1}`, alt: `${roll.name}, frame ${i + 1}`,
    aspectRatio: frame.width / frame.height, rotation: frame.rotation, uprightRotation: 0, sourceWidth: frame.width, sourceHeight: frame.height }));
  const definition: RollDefinition = { rollId: roll.id, label: `${roll.name} · ${rollFormatLabel(format, sizing)}`, frames, framesPerStrip: FILM_FORMATS[format].perStrip,
    scale: FILM_RENDER_SCALE, fixture: false, format, layout,
    frameWidths: sizing === 'free' ? roll.frames.map(frame => layout.frameHeight * frameAspect(format, 'free', frame)) : undefined,
    stripLength: sizing === 'free' ? 230 * FILM_UNIT : undefined };
  const strips = createRollLayout(definition), across = getStripDimensions(strips[0].layout).height * definition.scale;
  return { definition, stockId, format, sizing, name: roll.name, stockName: getFilmStock(stockId).displayName,
    formatLabel: sizing === 'free' ? '35mm · Panoramic' : FILM_FORMATS[format].label,
    width: Math.max(...strips.map(strip => getStripDimensions(strip.layout).width * strip.scale)),
    height: strips[0].y - strips[strips.length - 1].y + across };
});

/**
 * The photographs are film scans that already carry their stock's look, so no
 * simulated film effect is added, as for the published gallery's rolls. The
 * table is lit at the viewer's default brightness.
 */
export const SHOWREEL_FILM_STRENGTH = 0;
export const SHOWREEL_BRIGHTNESS = DEFAULT_TABLE_BRIGHTNESS;

/** A film format on the table, labelled in the formats shot: its rolls, column and frame size. */
export interface ShowreelFormat { title: string; detail: string; rolls: number[]; x: number; top: number; width: number }

// Each film width has its own column, left to right from the smallest frame to
// the largest; rolls of one column lie one above another.
const COLUMN_GAP = mm(26), ROW_GAP = mm(14), MARGIN = mm(30);
const sizeKey = (roll: (typeof rolls)[number]) => `${roll.format}:${roll.sizing}`;
const frameArea = (roll: (typeof rolls)[number]) => FILM_FORMATS[roll.format].height * FILM_FORMATS[roll.format].height
  * (roll.sizing === 'free' ? Math.max(...roll.definition.frames.map(frame => frameAspect(roll.format, 'free', { width: frame.sourceWidth!, height: frame.sourceHeight!, rotation: frame.rotation }))) : frameAspect(roll.format));
const order = rolls.map((_, i) => i).sort((a, b) => frameArea(rolls[a]) - frameArea(rolls[b]) || a - b);
const columns: number[][] = [];
for (const index of order) {
  const last = columns.at(-1);
  if (last && sizeKey(rolls[last[0]]) === sizeKey(rolls[index])) last.push(index); else columns.push([index]);
}
const columnWidth = (column: number[]) => Math.max(...column.map(i => rolls[i].width));
const columnHeight = (column: number[]) => column.reduce((sum, i) => sum + rolls[i].height, 0) + ROW_GAP * (column.length - 1);
const span = columns.reduce((sum, column) => sum + columnWidth(column), 0) + COLUMN_GAP * (columns.length - 1);
const offsets = new Map<number, { x: number; y: number }>();
const formats: ShowreelFormat[] = [];
let left = -span / 2;
for (const column of columns) {
  const width = columnWidth(column), x = left + width / 2;
  let top = columnHeight(column) / 2;
  const columnTop = top;
  for (const index of column) { offsets.set(index, { x, y: top - rolls[index].height / 2 }); top -= rolls[index].height + ROW_GAP; }
  const roll = rolls[column[0]], f = FILM_FORMATS[roll.format];
  const long = roll.sizing === 'free' ? Math.round(Math.max(...column.flatMap(i => rolls[i].definition.frames.map(frame => f.height * Math.max(frame.aspectRatio, 1 / frame.aspectRatio))))) : Math.round(Math.max(f.width, f.height));
  formats.push({ title: roll.sizing === 'free' ? 'Panoramic' : roll.format === '135' ? '35mm' : f.label.replace(/^(120|35mm) · /, ''),
    detail: `${filmType(roll.format) === '135' ? '35mm film' : '120 film'}  ·  ${Math.round(Math.min(f.width, f.height))} × ${long} mm`, rolls: column, x, top: columnTop, width });
  left += width + COLUMN_GAP;
}

export const SHOWREEL_ROLLS: readonly ShowreelRoll[] = rolls.map((roll, index) => ({ ...roll, offset: offsets.get(index)! }));
/** The formats from smallest to largest, as they lie on the table from left to right. */
export const SHOWREEL_FORMATS: readonly ShowreelFormat[] = formats;
/** One light table holding every roll, with a margin around them (as LightTable's width and height, which include its frame). */
export const SHOWREEL_TABLE = {
  width: Math.max(3.6, span + 2 * MARGIN + .2),
  height: Math.max(1.5, Math.max(...columns.map(columnHeight)) + 2 * MARGIN + .2),
};
