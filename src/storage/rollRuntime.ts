import { RollBundle, RollRepository } from './rollRepository';
import { FILM_FORMATS, FILM_UNIT, FRAME_GAP_MM, frameAspect, rollFormatLabel, formatLayout } from '../data/filmFormats';
import { getStripDimensions } from '../utils/loupeMapping';
import { createRollLayout, RollDefinition } from '../utils/rollLayout';
export function createRuntimeRoll(bundle: RollBundle): { definition: RollDefinition; dispose: () => void } {
  let references=1,disposed=false;
  const release=()=>{if(--references===0)urls.forEach(value=>URL.revokeObjectURL(value));};
  const retain=()=>{references++;let active=true;return()=>{if(active){active=false;release();}};};
  const urls: string[] = [], blobs = new Map(bundle.blobs.map(b => [b.key,b.blob]));
  const url = (key: string) => { const blob = blobs.get(key); if (!blob) throw new Error('Stored image unavailable.'); const value = URL.createObjectURL(blob); urls.push(value); return value; };
  const format = FILM_FORMATS[bundle.roll.format], layout = formatLayout(bundle.roll.format);
  layout.gap = FRAME_GAP_MM * FILM_UNIT;
  try {
    const frames = bundle.roll.frameIds.map((id, i) => { const f = bundle.frames.find(frame => frame.id === id)!; return { id, order: i+1, src: url(f.viewingKey), thumbnailSrc: url(f.thumbnailKey), title: f.filename, alt: f.filename, aspectRatio: f.width / f.height, rotation: f.rotation, cropPosition: f.cropPosition, original: blobs.get(f.originalKey), loadOriginal: ()=>new RollRepository().original(f.id), sourceWidth: f.width, sourceHeight: f.height }; });
    const definition: RollDefinition = { rollId: bundle.roll.id, label: `${bundle.roll.name} · ${rollFormatLabel(bundle.roll.format, bundle.roll.sizing)}`, frames, framesPerStrip: format.perStrip, scale: 1, fixture: false, format: bundle.roll.format, layout, imported: true, retainResources: retain,
      frameWidths: bundle.roll.sizing === 'free' ? bundle.roll.frameIds.map(id => layout.frameHeight * frameAspect(bundle.roll.format, 'free', bundle.frames.find(f => f.id === id)!)) : undefined,
      stripLength: bundle.roll.sizing === 'free' ? 230 * FILM_UNIT : undefined };
    const strips = createRollLayout(definition);
    definition.scale = Math.min(.6, 3 / Math.max(...strips.map(s => getStripDimensions(s.layout).width)), 1.3 / (strips.length * (layout.frameHeight + layout.marginY * 2 + .1)));
    return { definition, dispose: () => { if(!disposed){disposed=true;release();} } };
  } catch (error) { urls.forEach(value => URL.revokeObjectURL(value)); throw error; }
}
