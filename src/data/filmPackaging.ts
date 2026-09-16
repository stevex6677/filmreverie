import manifest from '../../public/assets/film-packaging/manifest.json';
import { FilmStockId } from './filmStocks';
import { FilmFormat } from './filmFormats';

export type PackagingFormat = '135' | '120';
export type PanelCorners = [number, number][];
export interface PackagingSource { asset: string; sha256: string; imageUrl: string; source: string }
export interface FilmPackaging {
  id: string; stockId: FilmStockId; format: PackagingFormat;
  box: PackagingSource; front: PanelCorners; top: PanelCorners;
  cartridge?: PackagingSource; cartridgePanel?: PanelCorners;
  sizeMm: [number, number, number]; multipack: boolean;
  singleRollArtwork?: string; // Authored compact carton face; original source remains documented.
}
export const FILM_PACKAGING = manifest.entries as unknown as FilmPackaging[];
export function getPackaging(stockId: FilmStockId, format: FilmFormat | PackagingFormat) {
  return FILM_PACKAGING.find(entry => entry.stockId === stockId && entry.format === (format === '135' ? '135' : '120'))!;
}
export const FILM_ISO: Record<FilmStockId, number> = {
  'ektachrome-e100': 100, 'ektar-100': 100, 'portra-160': 160, 'portra-400': 400, 'portra-800': 800,
};
