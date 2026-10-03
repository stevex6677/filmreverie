import { ReactNode, useRef, useState } from 'react';
import { DraftPhoto } from '../storage/importPhotos';
import { StoredFrame } from '../storage/rollRepository';
import { FilmFormat, FrameSizing, frameAspect } from '../data/filmFormats';
import { clampFilmStrength, DEFAULT_FILM_STRENGTH } from '../data/filmLooks';
import { FilmStockId, getFilmStock } from '../data/filmStocks';
import { photoCropPreview } from '../utils/photoFraming';
import { CropInspector } from './CropInspector';
import { FilmCompare, FilmLookPreview } from './FilmLookPreview';

export type StrengthMode = 'roll' | 'frame';
export const frameStrength = (photo: DraftPhoto, mode: StrengthMode, rollStrength: number) =>
  mode === 'frame' ? clampFilmStrength(photo.frame?.filmStrength ?? rollStrength) : rollStrength;
const strengthName = (value: number) => value === 0 ? 'Original' : value === DEFAULT_FILM_STRENGTH ? 'Default' : value === 100 ? 'Strong' : '';

interface Props {
  photos: DraftPhoto[]; onPhotos: (photos: DraftPhoto[]) => void;
  selected?: DraftPhoto; onSelect: (id: string) => void;
  cover: string; onCover: (id: string) => void;
  onMove: (from: number, to: number) => void; onRemove: (id: string) => void;
  format: FilmFormat; sizing: FrameSizing; stock: FilmStockId; busy: boolean;
  strengthMode: StrengthMode; onStrengthMode: (mode: StrengthMode) => void;
  rollStrength: number; onRollStrength: (strength: number) => void;
  /** Extra controls beside the frame count, such as adding photographs to a new roll. */
  stripActions?: ReactNode;
}

/** Per-frame crop and film effect, with a contact strip for choosing and ordering frames. */
export function RollFrameEditor({ photos, onPhotos, selected, onSelect, cover, onCover, onMove, onRemove, format, sizing, stock, busy, strengthMode, onStrengthMode, rollStrength, onRollStrength, stripActions }: Props) {
  const [tool, setTool] = useState<'crop' | 'film'>('crop'), [compare, setCompare] = useState<FilmCompare>('film');
  const drag = useRef<number | null>(null);
  const active = selected ?? photos[0], index = Math.max(0, photos.findIndex(p => p.id === active?.id));
  const changeFrame = (id: string, change: (frame: StoredFrame) => StoredFrame) =>
    onPhotos(photos.map(p => p.id === id && p.frame ? { ...p, frame: change(p.frame) } : p));
  const step = (offset: number) => { const next = photos[index + offset]; if (next) onSelect(next.id); };
  const strength = active ? frameStrength(active, strengthMode, rollStrength) : rollStrength;
  const setStrength = (value: number) => {
    const next = clampFilmStrength(value);
    if (strengthMode === 'roll') onRollStrength(next);
    else if (active) changeFrame(active.id, frame => ({ ...frame, filmStrength: next }));
  };
  const chooseMode = (mode: StrengthMode) => {
    // Frames start from the roll strength the first time they are adjusted individually.
    if (mode === 'frame') onPhotos(photos.map(p => p.frame && p.frame.filmStrength === undefined ? { ...p, frame: { ...p.frame, filmStrength: rollStrength } } : p));
    onStrengthMode(mode);
  };
  const toolTab = (id: 'crop' | 'film', label: string) =>
    <button role="tab" id={`frame-tool-${id}`} aria-controls="frame-tool-panel" aria-selected={tool === id} tabIndex={tool === id ? 0 : -1} onClick={() => setTool(id)}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = id === 'crop' ? 'film' : 'crop'; setTool(next); document.getElementById(`frame-tool-${next}`)?.focus(); } }}>{label}</button>;

  return <div className="frame-editor" onKeyDown={event => {
    const target = event.target as HTMLElement;
    if (target.matches('input, select, textarea, [role=slider], [role=tab]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); step(event.key === 'ArrowLeft' ? -1 : 1); }
  }}>
    <div className="frame-strip">
      <div className="frame-strip-heading"><h3>Frames <span>{photos.length}</span></h3><p>Drag to reorder · ← → to step through</p>{stripActions}</div>
      <ol className="draft-photos">{photos.map((p, i) => {
        const aspect = frameAspect(format, sizing, p.frame);
        return <li key={p.id} draggable={!busy} onDragStart={() => { drag.current = i; onSelect(p.id); }} onDragOver={event => event.preventDefault()}
          onDrop={event => { event.preventDefault(); if (drag.current !== null) onMove(drag.current, i); drag.current = null; }}>
          <button aria-label={`Select frame ${i + 1}`} aria-pressed={active?.id === p.id} title={p.filename} onClick={() => onSelect(p.id)}>
            <div className="draft-preview" style={{ aspectRatio: aspect }}>
              {p.preview && <img src={p.preview} alt={p.filename} style={photoCropPreview(p.frame ? p.frame.width / p.frame.height : 1, aspect, p.frame?.rotation ?? 0, p.frame?.cropPosition)}/>}
              {cover === p.id && <span className="frame-badge is-cover" aria-hidden="true">★</span>}
              {strengthMode === 'frame' && p.frame && <span className="frame-badge is-strength" aria-hidden="true">{frameStrength(p, strengthMode, rollStrength)}</span>}
            </div>
            <strong>{i + 1}{cover === p.id ? ' · Cover' : ''}</strong><span>{p.filename}</span>
            {p.error && <span className="photo-issue">Cannot read file</span>}{p.duplicate && !p.keepDuplicate && <span className="photo-issue">Duplicate</span>}
          </button>
        </li>;
      })}</ol>
    </div>

    {active && <div className="frame-workbench">
      <div className="frame-toolbar">
        <div role="tablist" aria-label="Frame tools" className="frame-tabs">{toolTab('crop', 'Crop')}{toolTab('film', 'Film effect')}</div>
        <h3 className="frame-title">Frame {index + 1} · {active.filename}</h3>
        <div className="draft-actions">
          <button disabled={busy || index === 0} aria-label={`Move frame ${index + 1} earlier`} title="Move earlier" onClick={() => onMove(index, index - 1)}>← Earlier</button>
          <button disabled={busy || index === photos.length - 1} aria-label={`Move frame ${index + 1} later`} title="Move later" onClick={() => onMove(index, index + 1)}>Later →</button>
          <button disabled={busy || !active.frame} aria-label={`Rotate frame ${index + 1}`} title="Rotate 90°" onClick={() => changeFrame(active.id, frame => ({ ...frame, rotation: (frame.rotation + 90) % 360, cropPosition: frame.cropPosition ? { x: -frame.cropPosition.y, y: frame.cropPosition.x } : undefined }))}>↻ Rotate</button>
          <button disabled={busy || !active.frame} aria-pressed={cover === active.id} onClick={() => onCover(active.id)}><span aria-hidden="true">★ </span>Cover</button>
          <button className="frame-remove" disabled={busy} aria-label={`Remove ${active.filename}`} onClick={() => onRemove(active.id)}>Remove</button>
        </div>
        <div className="frame-stepper">
          <button aria-label="Previous frame" disabled={index === 0} onClick={() => step(-1)}>‹</button>
          <span aria-live="polite">Frame {index + 1} <small>of {photos.length}</small></span>
          <button aria-label="Next frame" disabled={index === photos.length - 1} onClick={() => step(1)}>›</button>
        </div>
      </div>
      {(active.error || active.duplicate) && <div className="frame-details">
        {active.error && <p role="alert">{active.error}</p>}
        {active.duplicate && <label><input type="checkbox" checked={active.keepDuplicate} disabled={busy} onChange={event => onPhotos(photos.map(p => p.id === active.id ? { ...p, keepDuplicate: event.target.checked } : p))}/>Keep this duplicate content</label>}
      </div>}
      <div id="frame-tool-panel" role="tabpanel" aria-labelledby={`frame-tool-${tool}`} className={`frame-tool-panel is-${tool}`}>
        {tool === 'crop'
          ? <CropInspector key={active.id} photo={active} format={format} sizing={sizing} disabled={busy} look={{ stockId: stock, strength }} onChange={cropPosition => changeFrame(active.id, frame => ({ ...frame, cropPosition }))}/>
          : <>
            <div className="film-look-area">
              <FilmLookPreview key={active.id} photo={active} format={format} sizing={sizing} stockId={stock} strength={strength} compare={compare}/>
              <fieldset className="segmented is-compare"><legend>Compare</legend>
                {(['film', 'split', 'original'] as const).map(value => <label key={value}><input type="radio" name="film-compare" checked={compare === value} onChange={() => setCompare(value)}/>{value === 'film' ? 'Film' : value === 'split' ? 'Split' : 'Original'}</label>)}
              </fieldset>
            </div>
            <div className="film-effect-controls">
              <fieldset className="segmented" disabled={busy}><legend>Film effect applies to</legend>
                <label><input type="radio" name="strength-mode" checked={strengthMode === 'roll'} onChange={() => chooseMode('roll')}/>Whole roll</label>
                <label><input type="radio" name="strength-mode" checked={strengthMode === 'frame'} onChange={() => chooseMode('frame')}/>Each frame</label>
              </fieldset>
              <div className="film-strength">
                <label htmlFor="film-strength-input">{strengthMode === 'roll' ? 'Strength for every frame' : `Strength for frame ${index + 1}`}</label>
                <output htmlFor="film-strength-input" data-testid="film-strength-value">{strength}{strengthName(strength) && <small> · {strengthName(strength)}</small>}</output>
                <input id="film-strength-input" type="range" min="0" max="100" step="1" value={strength} disabled={busy || !active.frame}
                  aria-label={strengthMode === 'roll' ? 'Roll film strength' : `Frame ${index + 1} film strength`}
                  aria-valuetext={`${strength}${strengthName(strength) ? ` — ${strengthName(strength)}` : ''}`}
                  data-testid="film-strength-slider" onChange={event => setStrength(Number(event.target.value))}/>
                <div className="film-strength-presets">{[0, DEFAULT_FILM_STRENGTH, 100].map(value =>
                  <button key={value} disabled={busy || !active.frame} aria-pressed={strength === value} onClick={() => setStrength(value)}>{strengthName(value)}</button>)}</div>
                {strengthMode === 'roll' && <small className="film-strength-remembered">New rolls start at the strength you last chose.</small>}
              </div>
              {strengthMode === 'frame' && <button className="film-strength-all" disabled={busy || photos.every(p => !p.frame || frameStrength(p, strengthMode, rollStrength) === strength)}
                onClick={() => { onRollStrength(strength); onPhotos(photos.map(p => p.frame ? { ...p, frame: { ...p.frame, filmStrength: strength } } : p)); }}>Use {strength} for all frames</button>}
              <p className="film-effect-note">{getFilmStock(stock).displayName} · {compare === 'split' ? 'Drag across the photograph to move the divider.' : compare === 'film' ? 'Press and hold the photograph to see the original.' : 'Showing the photograph without the film effect.'}</p>
            </div>
          </>}
      </div>
    </div>}
  </div>;
}
