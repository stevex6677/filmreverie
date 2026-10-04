import { CSSProperties, useEffect, useRef, useState } from 'react';
import { DraftPhoto } from '../storage/importPhotos';
import { StoredFrame } from '../storage/rollRepository';
import { FILM_FORMATS, FilmFormat, FrameSizing, frameAspect } from '../data/filmFormats';
import { filmGrainSeed } from '../data/filmLooks';
import { FilmStockId } from '../data/filmStocks';
import { renderFilmLook } from '../utils/filmLookRenderer';
import { photoCropPreview, photoCropScale } from '../utils/photoFraming';
import { cameraTurn, uprightCropPosition, uprightRotation } from '../utils/frameOrientation';

export type FilmCompare = 'film' | 'split' | 'original';
export interface FilmLook { stockId: FilmStockId; strength: number }
// Bounds the GPU readback per change while staying sharp on high-density screens.
const MAX_CANVAS_PIXELS = 3_000_000;

export function useDecodedImage(src?: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImage(null);
    if (!src) return;
    let current = true;
    const next = new Image();
    next.src = src;
    next.decode().then(() => { if (current) setImage(next); }, () => {});
    return () => { current = false; };
  }, [src]);
  return image;
}

/** Physical size of the whole, unrotated photograph when its crop fills the film gate. */
function photoSizeMm(frame: StoredFrame, format: FilmFormat, sizing: FrameSizing) {
  const gateAspect = frameAspect(format, sizing, frame), heightMm = FILM_FORMATS[format].height;
  const crop = photoCropScale(frame.width / frame.height, gateAspect, frame.rotation);
  const oriented = [heightMm * gateAspect / crop.x, heightMm / crop.y];
  return frame.rotation % 180 ? [oriented[1], oriented[0]] : oriented;
}

/**
 * The whole photograph with the light table's film look, drawn at the
 * canvas's displayed size. Position it with the same styles as an <img>.
 */
export function FilmLookCanvas({ image, frame, format, sizing, look, style, onRender, ...rest }: {
  image: HTMLImageElement | null; frame: StoredFrame; format: FilmFormat; sizing: FrameSizing; look: FilmLook;
  style?: CSSProperties; onRender?: () => void; 'aria-label'?: string; role?: string; 'aria-hidden'?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    // Layout size, unaffected by the rotation transform.
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect, ratio = Math.min(window.devicePixelRatio || 1, 2);
      const reduce = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, box.width * box.height * ratio * ratio)));
      const width = Math.round(box.width * ratio * reduce), height = Math.round(box.height * ratio * reduce);
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [widthMm, heightMm] = photoSizeMm(frame, format, sizing);
  useEffect(() => {
    const element = canvas.current;
    if (!element || !image || !size.width || !size.height) return;
    // Slider input arrives faster than frames; draw the latest value once per frame.
    const id = requestAnimationFrame(() => {
      if (element.width !== size.width || element.height !== size.height) { element.width = size.width; element.height = size.height; }
      renderFilmLook(element, image, { stockId: look.stockId, strength: look.strength, widthMm, heightMm, seed: filmGrainSeed(frame.id) });
      onRender?.();
    });
    return () => cancelAnimationFrame(id);
  }, [image, size, look.stockId, look.strength, widthMm, heightMm, frame.id]);
  return <canvas ref={canvas} style={style} {...rest}/>;
}

/** The final crop as a print, with Film / Split / Original comparison. */
export function FilmLookPreview({ photo, format, sizing, stockId, strength, compare }: {
  photo: DraftPhoto; format: FilmFormat; sizing: FrameSizing; stockId: FilmStockId; strength: number; compare: FilmCompare;
}) {
  const frame = photo.frame, box = useRef<HTMLDivElement>(null), drag = useRef<number | null>(null);
  const image = useDecodedImage(photo.reviewPreview ?? photo.preview);
  const [rendered, setRendered] = useState(false), [holding, setHolding] = useState(false), [split, setSplit] = useState(50);
  if (!frame) return <div className="film-look-stage"><p className="crop-unavailable">{photo.error || 'Preview unavailable'}</p></div>;
  // A print stands upright, so a vertical shot's gate turns with the camera.
  const filmGate = frameAspect(format, sizing, frame), gateAspect = cameraTurn(frame) % 180 ? 1 / filmGate : filmGate;
  const placement = photoCropPreview(frame.width / frame.height, gateAspect, uprightRotation(frame), uprightCropPosition(frame));
  const showOriginal = compare === 'original' || holding && compare === 'film';
  const moveSplit = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    setSplit(Math.round(Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100))));
  };
  return <div className="film-look-stage">
    <div ref={box} className={`film-look-print is-${compare}`} style={{ aspectRatio: gateAspect, '--print-aspect': gateAspect } as CSSProperties}
      data-testid="film-look-preview" data-preview-ready={rendered ? 'true' : 'false'} data-strength={strength}
      onPointerDown={event => {
        if (event.button !== 0) return;
        if (compare === 'split') { drag.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); moveSplit(event.clientX); }
        else if (compare === 'film') setHolding(true);
      }}
      onPointerMove={event => { if (drag.current === event.pointerId) moveSplit(event.clientX); }}
      onPointerUp={() => { drag.current = null; setHolding(false); }}
      onPointerCancel={() => { drag.current = null; setHolding(false); }}
      onPointerLeave={() => setHolding(false)}>
      {/* The original uses the same renderer at strength 0, so comparisons differ only by the film look. */}
      <FilmLookCanvas image={image} frame={frame} format={format} sizing={sizing} look={{ stockId, strength: 0 }} style={placement} aria-hidden={true}/>
      {/* Clipping a wrapper keeps the split vertical for rotated photographs. */}
      <div className="film-look-layer" hidden={showOriginal} style={compare === 'split' ? { clipPath: `inset(0 0 0 ${split}%)` } : undefined}>
        <FilmLookCanvas image={image} frame={frame} format={format} sizing={sizing} look={{ stockId, strength }} style={placement}
          role="img" aria-label={`Film preview: ${photo.filename}`} onRender={() => setRendered(true)}/>
      </div>
      {compare === 'split' && <>
        <span className="film-look-tag is-before">Original</span><span className="film-look-tag is-after">Film</span>
        <div className="film-look-divider" style={{ left: `${split}%` }} role="slider" tabIndex={0} aria-label="Comparison divider"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={split}
          onKeyDown={event => {
            const step = event.shiftKey ? 10 : 2;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setSplit(value => Math.max(0, Math.min(100, value + (event.key === 'ArrowLeft' ? -step : step)))); }
          }}/>
      </>}
      {compare === 'film' && holding && <span className="film-look-tag is-before">Original</span>}
    </div>
  </div>;
}
