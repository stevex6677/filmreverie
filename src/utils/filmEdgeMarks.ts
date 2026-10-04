import { FILM_MODEL_UNIT } from '../data/physicalScale';
import { type FilmStripLayout, getFilmLengthOffset, getStripDimensions } from './loupeMapping';

/** Fixed-pitch factory positions in mm from the left cut edge of this strip.
 * Include the preceding repeat: a cut may pass through printed text or a code.
 * Canvas clipping, rather than moving/skipping the mark, handles that case.
 */
export function filmEdgeRepeats(layout: FilmStripLayout, pitchMm: number, originMm = 0) {
  const startMm = (getFilmLengthOffset(layout) - layout.marginX) / FILM_MODEL_UNIT;
  const endMm = startMm + getStripDimensions(layout).width / FILM_MODEL_UNIT;
  const repeats: { index: number; x: number }[] = [];
  for (let index = Math.max(0, Math.floor((startMm - originMm) / pitchMm) - 1);
    originMm + index * pitchMm < endMm; index++) {
    repeats.push({ index, x: originMm + index * pitchMm - startMm });
  }
  return repeats;
}
