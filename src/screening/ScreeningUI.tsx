import { useEffect, useRef, useState } from 'react';
import { PACE_LABEL, REEL_DESCRIPTION, REEL_LABEL } from './reels';
import { PACES, REEL_IDS } from './timeline';
import { EXPORT_FORMATS, useScreeningSnapshot, type ExportFormat, type ScreeningChoice, type ScreeningSession } from './session';
import './screening.css';

export const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  return total < 60 ? `${total} s` : `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, '0')} s`;
};

/** The table's entry point, shown in Overview or Focus once the loupe is put away. */
export function ScreenRollButton({ onClick, launch = false, disabled = false }: { onClick: () => void; launch?: boolean; disabled?: boolean }) {
  return <button type="button" className={`screen-roll-button${launch ? ' is-launch' : ''}`} data-testid="screen-roll" aria-haspopup="dialog" disabled={disabled} onClick={onClick}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="6.8" r="2"/><circle cx="12" cy="17.2" r="2"/><circle cx="6.8" cy="12" r="2"/><circle cx="17.2" cy="12" r="2"/></svg>
    Screen roll
  </button>;
}

export function ScreeningPicker({ choice, onChange, onPreview, onExport, onClose, durationFor, frames, reducedMotion }: {
  choice: ScreeningChoice; onChange: (choice: ScreeningChoice) => void; onPreview: () => void; onExport: () => void; onClose: () => void;
  durationFor: (choice: ScreeningChoice) => number; frames: number; reducedMotion: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current, previous = document.activeElement as HTMLElement | null;
    node?.showModal();
    node?.querySelector<HTMLInputElement>('input:checked')?.focus({ preventScroll: true });
    return () => { node?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const radio = <K extends keyof ScreeningChoice>(key: K, value: ScreeningChoice[K], label: string, detail?: string) => <label key={String(value)} className="screening-choice">
    <input type="radio" name={`screening-${key}`} value={String(value)} checked={choice[key] === value} onChange={() => onChange({ ...choice, [key]: value })} />
    <span className="screening-choice-card"><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
  </label>;
  return <dialog ref={dialog} className="screening-picker" aria-labelledby="screening-picker-title" onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="screening-picker-body">
      <header><h2 id="screening-picker-title">Screen roll</h2><button type="button" aria-label="Close" onClick={onClose}>×</button></header>
      <fieldset className="screening-reels"><legend>Reel</legend>{REEL_IDS.map(reel => radio('reel', reel, REEL_LABEL[reel], REEL_DESCRIPTION[reel]))}</fieldset>
      <fieldset className="screening-segmented"><legend>Pace</legend>{PACES.map(pace => radio('pace', pace, PACE_LABEL[pace]))}</fieldset>
      <fieldset className="screening-segmented"><legend>Video format</legend>{(Object.keys(EXPORT_FORMATS) as ExportFormat[]).map(format => radio('format', format, format, EXPORT_FORMATS[format].label.replace(/ .*$/, '')))}</fieldset>
      <p className="screening-estimate" data-testid="screening-estimate">{formatDuration(durationFor(choice))} · {frames} {frames === 1 ? 'frame' : 'frames'}{reducedMotion ? ' · Reduced motion' : ''}</p>
      <p className="screening-note">Silent 720p video, made on this device. Nothing is uploaded.</p>
      <footer>
        <button type="button" className="is-primary" data-testid="screening-preview" onClick={onPreview}>Preview</button>
        <button type="button" data-testid="screening-export" onClick={onExport}>Export video</button>
      </footer>
    </div>
  </dialog>;
}

export function ScreeningPlayer({ session, onExit, onExport }: { session: ScreeningSession; onExit: () => void; onExport: () => void }) {
  const snapshot = useScreeningSnapshot(session);
  const overlay = useRef<HTMLCanvasElement>(null), root = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(true);
  useEffect(() => { session.overlay = overlay.current; return () => { session.overlay = null; }; }, [session]);
  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>('[data-testid="screening-toggle"]')?.focus({ preventScroll: true });
    // Hiding the page pauses the preview; it resumes only when asked.
    const hide = () => { if (document.visibilityState === 'hidden') session.pause(); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [session]);
  useEffect(() => {
    if (!snapshot.playing) { setRevealed(true); return; }
    const timer = setTimeout(() => { const focused = document.activeElement; if (!(root.current?.contains(focused) && focused?.matches(':focus-visible'))) setRevealed(false); }, 2600);
    return () => clearTimeout(timer);
  }, [snapshot.playing, revealed]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (session.exporting || (event.target instanceof HTMLElement && event.target.closest('dialog'))) return;
      if (event.key === 'Escape') { event.preventDefault(); onExit(); }
      else if (event.key === ' ' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); session.toggle(); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); session.step(event.key === 'ArrowLeft' ? -1 : 1); }
      else return;
      setRevealed(true);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [session, onExit]);
  const total = session.timeline.frameCount, frame = snapshot.frameIndex + 1;
  return <div ref={root} className="screening-player" data-testid="screening-player" data-playing={snapshot.playing} data-frame={frame} data-time={snapshot.time} data-controls={revealed ? 'visible' : 'hidden'}
    onPointerMove={event => { if (event.pointerType === 'mouse') setRevealed(true); }}>
    <canvas ref={overlay} className="screening-overlay" aria-hidden="true" />
    {/* A tap on the scene pauses; another resumes. */}
    <button type="button" className="screening-stage" aria-label={snapshot.playing ? 'Pause screening' : 'Resume screening'} tabIndex={-1} onClick={() => { session.toggle(); setRevealed(true); }} />
    <header className="screening-top">
      <button type="button" className="screening-exit" data-testid="screening-exit" onClick={onExit}>× Exit</button>
      <span className="screening-title">{REEL_LABEL[session.choice.reel]} · {PACE_LABEL[session.choice.pace]}</span>
    </header>
    <nav className="screening-bar" aria-label="Screening playback">
      <button type="button" aria-label="Previous frame" data-testid="screening-previous" onClick={() => { session.step(-1); setRevealed(true); }}>⏮</button>
      <button type="button" aria-label={snapshot.playing ? 'Pause' : 'Play'} data-testid="screening-toggle" onClick={() => { session.toggle(); setRevealed(true); }}>{snapshot.playing ? '❚❚' : '▶'}</button>
      <button type="button" aria-label="Next frame" data-testid="screening-next" onClick={() => { session.step(1); setRevealed(true); }}>⏭</button>
      <span className="screening-counter" aria-live="polite">{String(frame).padStart(2, '0')} <span>/ {total}</span></span>
      <progress aria-label="Screening progress" max={snapshot.duration} value={snapshot.time} />
      <span className="screening-clock">{formatDuration(snapshot.time)} / {formatDuration(snapshot.duration)}</span>
      <button type="button" className="screening-export-button" data-testid="screening-player-export" onClick={onExport}>Export video</button>
    </nav>
  </div>;
}
