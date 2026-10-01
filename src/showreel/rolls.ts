import data from '../data/showreelRolls.json' with { type: 'json' };
import { FILM_FORMATS, FILM_UNIT, FRAME_GAP_MM, formatLayout, isFilmFormat, rollFormatLabel, type FilmFormat } from '../data/filmFormats';
import { FILM_RENDER_SCALE } from '../data/physicalScale';
import { getFilmStock, isFilmStockId, type FilmStockId } from '../data/filmStocks';
import type { RollDefinition } from '../utils/rollLayout';
import type { StoredRoll } from '../storage/rollRepository';
import type { ShelfCoverSource } from '../components/ShelfCoverFrame';

/**
 * The showreel's sample rolls, bundled like the five-photograph example roll.
 * They are runtime definitions only: nothing is written to a darkroom library.
 * Swap in other photographs by editing src/data/showreelRolls.json.
 */
export interface ShowreelRoll { definition: RollDefinition; stored: StoredRoll; stockId: FilmStockId; format: FilmFormat; name: string; stockName: string; formatLabel: string }

// Shelf cells (4 × 4, numbered from the top left): the middle row, in view from the table.
const SHELF_SLOTS = [5, 6];

export const SHOWREEL_ROLLS: readonly ShowreelRoll[] = data.rolls.map((roll, index) => {
  if (!isFilmFormat(roll.format) || !isFilmStockId(roll.stockId)) throw new Error(`Unsupported showreel roll ${roll.id}`);
  const format = roll.format, stockId = roll.stockId;
  const layout = formatLayout(format);
  // The same frame spacing as rolls made in the roll editor.
  layout.gap = FRAME_GAP_MM * FILM_UNIT;
  const frames = roll.frames.map((frame, i) => ({ id: frame.id, order: i + 1, src: frame.src, thumbnailSrc: frame.src.replace(/\.jpg$/, '.thumb.jpg'), title: frame.title, alt: frame.alt, aspectRatio: frame.aspectRatio }));
  const definition: RollDefinition = { rollId: roll.id, label: `${roll.name} · ${rollFormatLabel(format)}`, frames, framesPerStrip: FILM_FORMATS[format].perStrip, scale: FILM_RENDER_SCALE, fixture: false, format, layout };
  const stored: StoredRoll = { id: roll.id, name: roll.name, stockId, format, sizing: 'fixed', frameIds: frames.map(frame => frame.id), coverId: frames[0].id, createdAt: 0, updatedAt: 0, trashedAt: null, shelfSlot: SHELF_SLOTS[index] };
  return { definition, stored, stockId, format, name: roll.name, stockName: getFilmStock(stockId).displayName, formatLabel: FILM_FORMATS[format].label };
});

/** Shelf covers come from the bundled thumbnails. */
export const showreelCoverSource: ShelfCoverSource = async (id, frameId) => {
  const frame = SHOWREEL_ROLLS.find(roll => roll.stored.id === id)?.definition.frames.find(item => item.id === frameId);
  if (!frame) throw new Error('Cover unavailable');
  const response = await fetch(frame.thumbnailSrc!);
  if (!response.ok) throw new Error('Cover unavailable');
  const width = 384, height = Math.round(width / frame.aspectRatio);
  return { blob: await response.blob(), frame: { id: frame.id, width, height, rotation: 0 }, rotation: 0 };
};
