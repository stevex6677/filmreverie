import music from '../data/showreelMusic.json' with { type: 'json' };

export type ShowreelTrack = (typeof music.tracks)[number];
export const SHOWREEL_TRACKS: readonly ShowreelTrack[] = music.tracks;
export const trackById = (id: string) => SHOWREEL_TRACKS.find(track => track.id === id);

/** The look of the overlay; 0–1 amounts, applied to preview and export alike. */
export interface ShowreelLook { grain: number; vignette: number; leaks: number; titles: boolean }
export interface ShowreelSettings extends ShowreelLook {
  /** A track ID, or 'none' for a silent film. */
  music: string;
  volume: number;
  resolution: ShowreelResolution;
}
export const SHOWREEL_RESOLUTIONS = { '720p': { width: 1280, height: 720 }, '1080p': { width: 1920, height: 1080 } } as const;
export type ShowreelResolution = keyof typeof SHOWREEL_RESOLUTIONS;

export const DEFAULT_SETTINGS: ShowreelSettings = { grain: .5, vignette: .6, leaks: 1, titles: true, music: music.default, volume: .8, resolution: '1080p' };
const KEY = 'film-reverie-showreel-settings';

const amount = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
/** Settings remembered in this browser; anything missing or invalid takes its default. */
export function loadSettings(): ShowreelSettings {
  let saved: Partial<ShowreelSettings> = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { /* Defaults. */ }
  return {
    grain: amount(saved.grain, DEFAULT_SETTINGS.grain), vignette: amount(saved.vignette, DEFAULT_SETTINGS.vignette),
    leaks: amount(saved.leaks, DEFAULT_SETTINGS.leaks), titles: typeof saved.titles === 'boolean' ? saved.titles : DEFAULT_SETTINGS.titles,
    music: saved.music === 'none' || (typeof saved.music === 'string' && trackById(saved.music)) ? saved.music : DEFAULT_SETTINGS.music,
    volume: amount(saved.volume, DEFAULT_SETTINGS.volume),
    resolution: saved.resolution && saved.resolution in SHOWREEL_RESOLUTIONS ? saved.resolution : DEFAULT_SETTINGS.resolution,
  };
}
export function saveSettings(settings: ShowreelSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Optional. */ }
}
