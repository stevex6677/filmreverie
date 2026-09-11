import { RollBundle } from './rollRepository';
import { FILM_FORMATS, formatLayout } from '../data/filmFormats';
import { RollDefinition } from '../utils/rollLayout';
export function createRuntimeRoll(bundle: RollBundle): { definition: RollDefinition; dispose: () => void } {
  const urls: string[] = [], blobs = new Map(bundle.blobs.map(b => [b.key,b.blob]));
  const url = (key: string) => { const blob = blobs.get(key); if (!blob) throw new Error('Stored image unavailable.'); const value = URL.createObjectURL(blob); urls.push(value); return value; };
  const format = FILM_FORMATS[bundle.roll.format], layout = formatLayout(bundle.roll.format);
  const rows = Math.ceil(bundle.frames.length / format.perStrip);
  const scale = Math.min(.6, 3 / (format.perStrip * (layout.frameWidth + layout.gap) + .16), 1.3 / (rows * (layout.frameHeight + layout.marginY * 2 + .1)));
  try {
    const frames = bundle.roll.frameIds.map((id, i) => { const f = bundle.frames.find(frame => frame.id === id)!; return { id, order: i+1, src: url(f.viewingKey), thumbnailSrc: url(f.thumbnailKey), title: f.filename, alt: f.filename, aspectRatio: f.width / f.height, rotation: f.rotation }; });
    return { definition: { rollId: bundle.roll.id, label: `${bundle.roll.name} · ${format.label}`, frames, framesPerStrip: format.perStrip, scale, fixture: false, format: bundle.roll.format, layout, imported: true }, dispose: () => urls.forEach(value => URL.revokeObjectURL(value)) };
  } catch (error) { urls.forEach(value => URL.revokeObjectURL(value)); throw error; }
}
