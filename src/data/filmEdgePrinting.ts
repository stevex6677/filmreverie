import type { FilmStockId } from './filmStocks';

// Factory edge printing is measured along the film, independently of image gates.
// Sources, nominal 120 calibration and remaining limits: docs/FILM_EDGE_PRINTING.md.
export const FILM_135_PERFORATION_PITCH_MM = 4.75;
export const FILM_135_NUMBER_PITCH_MM = 8 * FILM_135_PERFORATION_PITCH_MM;
export const FILM_135_HALF_NUMBER_PITCH_MM = FILM_135_NUMBER_PITCH_MM / 2;

export const FUJI_REVERSAL_CODES: Partial<Record<FilmStockId, string>> = {
  'provia-100': 'RDP III',
  'velvia-50': 'RVP 50',
  'velvia-100': 'RVP 100',
};

export function edgePrintProfile(stockId: FilmStockId) {
  const fujiCode = FUJI_REVERSAL_CODES[stockId];
  return {
    fujiCode,
    // Kodak's catalog specifies a 2-inch legend repeat, independently of numbers.
    // Fuji's 135 diagram repeats its designation once per eight-perforation cell.
    label135PitchMm: fujiCode ? FILM_135_NUMBER_PITCH_MM : 50.8,
    // Kodak dual indices: 16-position and 12-position tracks. These are nominal
    // calibration values, not dimensions supplied by an ISO edge-print standard.
    number120PitchMm: fujiCode ? 43 : 45.5,
    secondary120PitchMm: fujiCode ? undefined : 728 / 12,
    number120Start: fujiCode ? 1 : 41,
    // Keep each reconstructed legend beside its factory index. The historic
    // Kodak catalog lists separate legend pitches (50.8 / 45.72 mm), but does
    // not dimension how those coexist with the numbers; see the reference note.
    label120PitchMm: fujiCode ? 43 : 45.5,
  };
}
