import { RollBundle, RollRepository } from './rollRepository';
import { FILM_FORMATS, formatLayout } from '../data/filmFormats';
import { RollDefinition } from '../utils/rollLayout';
export function createRuntimeRoll(bundle: RollBundle): { definition: RollDefinition; dispose: () => void } {
  let references=1,disposed=false;
  const release=()=>{if(--references===0)urls.forEach(value=>URL.revokeObjectURL(value));};
  const retain=()=>{references++;let active=true;return()=>{if(active){active=false;release();}};};
  const urls: string[] = [], blobs = new Map(bundle.blobs.map(b => [b.key,b.blob]));
  const url = (key: string) => { const blob = blobs.get(key); if (!blob) throw new Error('Stored image unavailable.'); const value = URL.createObjectURL(blob); urls.push(value); return value; };
  const format = FILM_FORMATS[bundle.roll.format], layout = formatLayout(bundle.roll.format);
  const rows = Math.ceil(bundle.frames.length / format.perStrip);
  const scale = Math.min(.6, 3 / (format.perStrip * (layout.frameWidth + layout.gap) + .16), 1.3 / (rows * (layout.frameHeight + layout.marginY * 2 + .1)));
  try {
    const frames = bundle.roll.frameIds.map((id, i) => { const f = bundle.frames.find(frame => frame.id === id)!; return { id, order: i+1, src: url(f.viewingKey), thumbnailSrc: url(f.thumbnailKey), title: f.filename, alt: f.filename, aspectRatio: f.width / f.height, rotation: f.rotation, cropPosition: f.cropPosition, original: blobs.get(f.originalKey), loadOriginal: ()=>new RollRepository().original(f.id), sourceWidth: f.width, sourceHeight: f.height }; });
    return { definition: { rollId: bundle.roll.id, label: `${bundle.roll.name} · ${format.label}`, frames, framesPerStrip: format.perStrip, scale, fixture: false, format: bundle.roll.format, layout, imported: true, retainResources: retain }, dispose: () => { if(!disposed){disposed=true;release();} } };
  } catch (error) { urls.forEach(value => URL.revokeObjectURL(value)); throw error; }
}
