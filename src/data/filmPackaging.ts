import manifest from '../../public/assets/film-packaging/manifest.json' with { type: 'json' };
import { FilmStockId } from './filmStocks';
import { FilmFormat } from './filmFormats';

export type PackagingFormat = '135' | '120';
export type PanelCorners = [number, number][];
export interface PackagingSource { asset: string; sha256: string; imageUrl: string; source: string }
export interface FilmPackaging {
  id: string; stockId: FilmStockId; format: PackagingFormat;
  box: PackagingSource; front: PanelCorners; top?: PanelCorners;
  bodyColor?: string; // Unphotographed carton faces; never borrow another stock's color.
  cartridge?: PackagingSource; cartridgePanel?: PanelCorners;
  cartridgePlacement?: 'on-box'; // Wide 35mm multipacks keep the cassette above the carton.
  cartridgeProjection?: 'photographic'; // A photographed cylinder, not a flat unwrapped label.
  cartridgeCurvature?: [number, number]; // Top/bottom center sag, normalized to the photographed panel height.
  sizeMm: [number, number, number]; multipack: boolean;
  singleRollArtwork?: string; // Authored compact carton face; original source remains documented.
}
export const FILM_PACKAGING = manifest.entries as unknown as FilmPackaging[];
export function getPackaging(stockId: FilmStockId, format: FilmFormat | PackagingFormat) {
  return FILM_PACKAGING.find(entry => entry.stockId === stockId && entry.format === (format === '135' ? '135' : '120'))!;
}
export const FILM_ISO: Record<FilmStockId, number> = {
  'ektachrome-e100': 100, 'ektar-100': 100, 'portra-160': 160, 'portra-400': 400, 'portra-800': 800,
  'fuji-200': 200, 'pro-image-100': 100, 'gold-200': 200, 'ultramax-400': 400,
  'provia-100': 100, 'velvia-50': 50, 'velvia-100': 100,
};
