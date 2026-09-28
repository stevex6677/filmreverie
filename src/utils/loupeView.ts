import { TABLE_CENTER_Z } from './cameraBounds';

// All heights are measured from the table, in the loupe's local scale.
export const LOUPE_RADIUS = .18;
export const LOUPE_LENS_RADIUS = .137;
export const LOUPE_LENS_HEIGHT = .19;
export const LOUPE_REST = { x: 1.3, y: -.48 };

export const LOUPE_TYPES = ['classic', 'glass'] as const;
export const LOUPE_SIZES = ['small', 'medium', 'large'] as const;
export type LoupeType = typeof LOUPE_TYPES[number];
export type LoupeSize = typeof LOUPE_SIZES[number];
export const LOUPE_SIZE_SCALE: Record<LoupeSize, number> = { small: 1, medium: 1.35, large: 1.8 };
export const LOUPE_TYPE_LABEL: Record<LoupeType, string> = { classic: 'Classic', glass: 'Glass dome' };
export const LOUPE_SIZE_LABEL: Record<LoupeSize, string> = { small: 'Small', medium: 'Medium', large: 'Large' };
export function isLoupeType(value: unknown): value is LoupeType { return LOUPE_TYPES.some(type => type === value); }
export function isLoupeSize(value: unknown): value is LoupeSize { return LOUPE_SIZES.some(size => size === value); }
export function loupeGeometry(type: LoupeType = 'classic') {
  return type === 'glass'
    ? { radius: .20, lensRadius: .20, lensHeight: .20 }
    : { radius: LOUPE_RADIUS, lensRadius: LOUPE_LENS_RADIUS, lensHeight: LOUPE_LENS_HEIGHT };
}

export function loupeInspectionView(x: number, y: number, scale: number, aspect: number, type: LoupeType = 'classic') {
  // On portrait phones the outer housing crops, while the circular aperture
  // remains recognizable. Landscape keeps the rim inside the shorter edge.
  const apertureFraction = aspect < .75 ? 1.04 : .84;
  const geometry = loupeGeometry(type);
  if (type === 'glass') {
    // Frame the sphere's silhouette, not a flat disc at its apex. Using the
    // eyepiece formula here would pull the camera away from a curved lens.
    const angle = Math.atan(Math.tan(Math.PI / 8) * Math.min(1, aspect) * (aspect < .75 ? .94 : .84));
    return { zoom: .008 + geometry.radius * scale / Math.sin(angle), pan: { x, z: TABLE_CENTER_Z - y } };
  }
  const distance = geometry.lensRadius * scale / (Math.tan(Math.PI / 8) * Math.min(1, aspect) * apertureFraction);
  return { zoom: geometry.lensHeight * scale + distance, pan: { x, z: TABLE_CENTER_Z - y } };
}

export function clampLoupePosition(x: number, y: number) {
  return { x: Math.max(-1.72, Math.min(1.72, x)), y: Math.max(-.69, Math.min(.69, y)) };
}
