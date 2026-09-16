import { getStripDimensions } from '../utils/loupeMapping';
import { TABLE_CENTER_Z } from '../utils/cameraBounds';
import { RollBundle, RollRepository, SavedView } from './rollRepository';
import { FILM_FORMATS, FILM_UNIT, FRAME_GAP_MM, frameAspect, rollFormatLabel, formatLayout } from '../data/filmFormats';
import { FILM_RENDER_SCALE } from '../data/physicalScale';
import { createRollLayout, RollDefinition } from '../utils/rollLayout';
export function createRuntimeRoll(bundle: RollBundle): { definition: RollDefinition; view?: SavedView; dispose: () => void } {
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
    definition.scale = FILM_RENDER_SCALE;
    return { definition, view: rescaleSavedView(bundle.roll.view, definition), dispose: () => { if(!disposed){disposed=true;release();} } };
  } catch (error) { urls.forEach(value => URL.revokeObjectURL(value)); throw error; }
}

// Older view records were saved while the film shrank to fit the panel.
// Preserve the viewed part of the negative when moving to the fixed scale.
export function rescaleSavedView(view: SavedView | undefined, roll: RollDefinition): SavedView | undefined {
  if (!view) return undefined;
  const strips = createRollLayout(roll), layout = strips[0].layout;
  const legacyScale = Math.min(.6, 3 / Math.max(...strips.map(strip => getStripDimensions(strip.layout).width)), 1.3 / (strips.length * (layout.frameHeight + layout.marginY * 2 + .1)));
  const previous = Number.isFinite(view.filmScale) && view.filmScale! > 0 ? view.filmScale! : legacyScale;
  const ratio = roll.scale / previous;
  const pan = (point: { x: number; z: number }) => ({ x: point.x * ratio, z: TABLE_CENTER_Z + (point.z - TABLE_CENTER_Z) * ratio });
  return { ...view, filmScale: roll.scale, zoom: view.zoom * ratio, pan: pan(view.pan), overview: view.overview ? { ...view.overview, zoom: view.overview.zoom * ratio, pan: pan(view.overview.pan) } : null };
}
