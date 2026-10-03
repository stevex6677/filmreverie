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
  'fuji-200': { description: 'Vivid color · fresh greens · fine grain', contrast: 1.08, saturation: 1.16, shadows: 0.012, highlights: -0.07, color: [-0.008, 0.018, 0.006], grain: 0.021, grainPerMm: 48 },
  'pro-image-100': { description: 'Balanced color · natural skin tones · fine grain', contrast: 1.04, saturation: 1.10, shadows: 0.020, highlights: -0.10, color: [0.016, 0.004, -0.010], grain: 0.017, grainPerMm: 54 },
  'ultramax-400': { description: 'Vivid color · warm skin tones · visible grain', contrast: 1.12, saturation: 1.22, shadows: 0.010, highlights: -0.08, color: [0.025, 0.006, -0.012], grain: 0.030, grainPerMm: 38 },
  'gold-200': { description: 'Warm golden color · rich tones · classic grain', contrast: 1.10, saturation: 1.20, shadows: 0.018, highlights: -0.09, color: [0.045, 0.014, -0.035], grain: 0.025, grainPerMm: 43 },
  'portra-160': { description: 'Soft color · gentle tones · very fine grain', contrast: 0.90, saturation: 0.88, shadows: 0.040, highlights: -0.16, color: [0.025, -0.006, -0.016], grain: 0.014, grainPerMm: 55 },
  'portra-400': { description: 'Natural color · soft highlights · fine grain', contrast: 0.93, saturation: 0.94, shadows: 0.030, highlights: -0.12, color: [0.030, -0.008, -0.020], grain: 0.022, grainPerMm: 45 },
  'portra-800': { description: 'Fuller color · gentle highlights · visible grain', contrast: 1.06, saturation: 1.08, shadows: 0.015, highlights: -0.08, color: [0.035, -0.006, -0.025], grain: 0.032, grainPerMm: 35 },
  'ektar-100': { description: 'Rich color · crisp tones · very fine grain', contrast: 1.18, saturation: 1.28, shadows: -0.010, highlights: -0.040, color: [0.020, 0.010, 0.035], grain: 0.010, grainPerMm: 65 },
  'ektachrome-e100': { description: 'Neutral color · clean whites · very fine grain', contrast: 1.14, saturation: 1.16, shadows: -0.015, highlights: 0.010, color: [-0.010, 0.005, 0.025], grain: 0.011, grainPerMm: 60 },
  'provia-100': { description: 'Natural color · faithful tones · ultra-fine grain', contrast: 1.12, saturation: 1.14, shadows: -0.018, highlights: 0.008, color: [-0.012, 0.010, 0.015], grain: 0.009, grainPerMm: 70 },
  'velvia-50': { description: 'Ultra-vivid color · deep blacks · exceptional sharpness', contrast: 1.30, saturation: 1.38, shadows: -0.038, highlights: 0.020, color: [0.022, 0.016, -0.012], grain: 0.008, grainPerMm: 75 },
  'velvia-100': { description: 'Vivid saturation · high contrast · ultra-fine grain', contrast: 1.24, saturation: 1.32, shadows: -0.028, highlights: 0.014, color: [0.018, -0.004, 0.022], grain: 0.009, grainPerMm: 70 },
};

// Independent of texture resolution, loading order and animation time.
export function filmGrainSeed(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) % 10007;
}
