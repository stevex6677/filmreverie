import type { FilmStockId } from './filmStocks';

export const DEFAULT_FILM_STRENGTH = 50;
export function clampFilmStrength(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value)) : DEFAULT_FILM_STRENGTH;
}

export interface FilmLook {
  description: string;
  // Authored perceptual-RGB parameters at strength 50, not measured sensitometry.
  contrast: number;
  saturation: number;
  shadows: number;
  highlights: number;
  color: readonly [number, number, number];
  grain: number;
  grainPerMm: number;
}

export const FILM_LOOKS: Record<FilmStockId, FilmLook> = {
  'portra-160': { description: 'Soft color · gentle tones · very fine grain', contrast: 0.90, saturation: 0.88, shadows: 0.040, highlights: -0.16, color: [0.025, -0.006, -0.016], grain: 0.014, grainPerMm: 55 },
  'portra-400': { description: 'Natural color · soft highlights · fine grain', contrast: 0.93, saturation: 0.94, shadows: 0.030, highlights: -0.12, color: [0.030, -0.008, -0.020], grain: 0.022, grainPerMm: 45 },
  'portra-800': { description: 'Fuller color · gentle highlights · visible grain', contrast: 1.06, saturation: 1.08, shadows: 0.015, highlights: -0.08, color: [0.035, -0.006, -0.025], grain: 0.032, grainPerMm: 35 },
  'ektar-100': { description: 'Rich color · crisp tones · very fine grain', contrast: 1.18, saturation: 1.28, shadows: -0.010, highlights: -0.040, color: [0.020, 0.010, 0.035], grain: 0.010, grainPerMm: 65 },
  'ektachrome-e100': { description: 'Neutral color · clean whites · very fine grain', contrast: 1.14, saturation: 1.16, shadows: -0.015, highlights: 0.010, color: [-0.010, 0.005, 0.025], grain: 0.011, grainPerMm: 60 },
};

// Independent of texture resolution, loading order and animation time.
export function filmGrainSeed(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) % 10007;
}
