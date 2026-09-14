import { TABLE_CENTER_Z } from './cameraBounds';

// All heights are measured from the table, in the loupe's local scale.
export const LOUPE_RADIUS = .18;
export const LOUPE_LENS_RADIUS = .137;
export const LOUPE_LENS_HEIGHT = .19;
export const LOUPE_REST = { x: 1.3, y: -.48 };

export function loupeInspectionView(x: number, y: number, scale: number, aspect: number) {
  // On portrait phones the outer housing crops, while the circular aperture
  // remains recognizable. Landscape keeps the rim inside the shorter edge.
  const apertureFraction = aspect < .75 ? 1.04 : .84;
  const distance = LOUPE_LENS_RADIUS * scale / (Math.tan(Math.PI / 8) * Math.min(1, aspect) * apertureFraction);
  return { zoom: LOUPE_LENS_HEIGHT * scale + distance, pan: { x, z: TABLE_CENTER_Z - y } };
}

export function clampLoupePosition(x: number, y: number) {
  return { x: Math.max(-1.72, Math.min(1.72, x)), y: Math.max(-.69, Math.min(.69, y)) };
}
