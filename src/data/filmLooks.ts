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
  'portra-160': { description: 'Soft color · gentle tones · very fine grain', contrast: .94, saturation: .91, shadows: .018, highlights: -.10, color: [.012, -.008, -.004], grain: .009, grainPerMm: 58 },
  'portra-400': { description: 'Natural color · soft highlights · fine grain', contrast: .98, saturation: .98, shadows: .012, highlights: -.075, color: [.018, -.012, -.006], grain: .014, grainPerMm: 46 },
  'portra-800': { description: 'Fuller color · gentle highlights · visible grain', contrast: 1.025, saturation: 1.035, shadows: .008, highlights: -.055, color: [.020, -.008, -.010], grain: .021, grainPerMm: 36 },
  'ektar-100': { description: 'Rich color · crisp tones · very fine grain', contrast: 1.10, saturation: 1.20, shadows: 0, highlights: -.025, color: [.030, .022, .032], grain: .007, grainPerMm: 64 },
  'ektachrome-e100': { description: 'Neutral color · clean whites · very fine grain', contrast: 1.015, saturation: 1.08, shadows: 0, highlights: 0, color: [0, 0, .006], grain: .008, grainPerMm: 60 },
};

// Independent of texture resolution, loading order and animation time.
export function filmGrainSeed(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) % 10007;
}
