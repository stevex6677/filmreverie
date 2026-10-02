import { useEffect, useRef, useState } from 'react';
import { PACE_LABEL, REEL_DESCRIPTION, REEL_LABEL, REEL_SETTINGS, reelTuning } from './reels';
import { PACES, REEL_IDS } from './timeline';
import { useScreeningSnapshot, type ScreeningChoice, type ScreeningSession } from './session';
import { SoundtrackPlayer } from '../showreel/music';
import { SHOWREEL_TRACKS, trackById } from '../showreel/settings';
import './screening.css';

export const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  return total < 60 ? `${total} s` : `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, '0')} s`;
};

/** The table's entry point, shown in Overview or Focus once the loupe is put away. */
export function ScreenRollButton({ onClick, launch = false, disabled = false }: { onClick: () => void; launch?: boolean; disabled?: boolean }) {
  return <button type="button" className={`screen-roll-button${launch ? ' is-launch' : ''}`} data-testid="screen-roll" aria-label="Screen roll" title="Screen roll" aria-haspopup="dialog" disabled={disabled} onClick={onClick}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="6.8" r="2"/><circle cx="12" cy="17.2" r="2"/><circle cx="6.8" cy="12" r="2"/><circle cx="17.2" cy="12" r="2"/></svg>
    <span>Screen roll</span>
  </button>;
}

export function ScreeningPicker({ choice, onChange, onPreview, onExport, onClose, durationFor, frames, reducedMotion }: {
  choice: ScreeningChoice; onChange: (choice: ScreeningChoice) => void; onPreview: () => void; onExport: () => void; onClose: () => void;
  durationFor: (choice: ScreeningChoice) => number; frames: number; reducedMotion: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [musicPlayer] = useState(() => new SoundtrackPlayer());
  const [listening, setListening] = useState<string | null>(null);
  const [musicError, setMusicError] = useState('');
  useEffect(() => { musicPlayer.onEnded = () => setListening(null); return () => musicPlayer.dispose(); }, [musicPlayer]);
  useEffect(() => { musicPlayer.stop(); setListening(null); }, [musicPlayer, choice.volume]);
  const listen = (id: string) => {
    musicPlayer.stop(); setMusicError('');
    if (id === 'none') { setListening(null); return; }
    setListening(id);
    void musicPlayer.audition(trackById(id)!, choice.volume ?? .8).catch(error => {
      setListening(null); setMusicError(error instanceof Error ? error.message : 'Music could not be played.');
    });
  };
  useEffect(() => {
    const node = dialog.current, previous = document.activeElement as HTMLElement | null;
    node?.showModal();
    node?.querySelector<HTMLInputElement>('input:checked')?.focus({ preventScroll: true });
    return () => { node?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const radio = <K extends keyof ScreeningChoice>(key: K, value: ScreeningChoice[K], label: string, detail?: string) => <label key={String(value)} className="screening-choice">
    <input type="radio" name={`screening-${key}`} value={String(value)} checked={choice[key] === value}
      onClick={() => { if (key === 'music' && choice[key] === value) listen(String(value)); }}
      onChange={() => { onChange({ ...choice, [key]: value }); if (key === 'music') listen(String(value)); }} />
    <span className="screening-choice-card"><strong>{label}</strong>{detail && <small>{detail}</small>}</span>
  </label>;
  const settings = REEL_SETTINGS[choice.reel], tuning = reelTuning(choice.reel, choice.tuning[choice.reel]);
  const tune = (values: readonly number[] | undefined) => onChange({ ...choice, tuning: { ...choice.tuning, [choice.reel]: values } });
  const adjusted = settings.some((setting, i) => Math.abs(tuning[i] - setting.initial) > .005);
  return <dialog ref={dialog} className="screening-picker" aria-labelledby="screening-picker-title" onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="screening-picker-body">
      <header><h2 id="screening-picker-title">Screen roll</h2><button type="button" aria-label="Close" onClick={onClose}>×</button></header>
      <fieldset className="screening-reels"><legend>Reel</legend>{REEL_IDS.map(reel => radio('reel', reel, REEL_LABEL[reel], REEL_DESCRIPTION[reel]))}</fieldset>
      <fieldset className="screening-segmented"><legend>Pace</legend>{PACES.map(pace => radio('pace', pace, PACE_LABEL[pace]))}</fieldset>
      <fieldset className="screening-tuning" data-testid="screening-tuning">
        <legend>{REEL_LABEL[choice.reel]} settings</legend>
        {settings.map((setting, i) => <label key={`${choice.reel}-${i}`} className="screening-slider">
          <span>{setting.label}</span>
          <input type="range" min={0} max={100} step={1} value={Math.round(tuning[i] * 100)} data-testid={`screening-setting-${i}`}
            aria-valuetext={`${setting.label}: ${Math.round(tuning[i] * 100)} of 100, from ${setting.low} to ${setting.high}`}
            onChange={event => tune(tuning.map((value, j) => j === i ? Number(event.currentTarget.value) / 100 : value))} />
          <small aria-hidden="true"><span>{setting.low}</span><span>{setting.high}</span></small>
        </label>)}
        <button type="button" className="screening-reset" data-testid="screening-reset" disabled={!adjusted} onClick={() => tune(undefined)}>Reset</button>
      </fieldset>
      <fieldset className="screening-music">
        <legend>Music</legend>
        {SHOWREEL_TRACKS.map(track => radio('music', track.id, track.title, `${track.mood} · ${track.artist}${listening === track.id ? ' · Playing preview' : ''}`))}
        {radio('music', 'none', 'No music')}
        {choice.music && choice.music !== 'none' && <label className="screening-slider">
          <span>Music volume · {Math.round((choice.volume ?? .8) * 100)}%</span>
          <input aria-label="Music volume" type="range" min={0} max={100} value={Math.round((choice.volume ?? .8) * 100)} onChange={event => onChange({ ...choice, volume: Number(event.currentTarget.value) / 100 })} />
        </label>}
        <p className="screening-note">CC0 music by HoliznaCC0. Free to use, including in exported videos.</p>
        {musicError && <p role="alert" className="screening-note">{musicError}</p>}
      </fieldset>
      <p className="screening-estimate" data-testid="screening-estimate">{formatDuration(durationFor(choice))} · {frames} {frames === 1 ? 'frame' : 'frames'}{reducedMotion ? ' · Reduced motion' : ''}</p>
      <p className="screening-note">720p video{choice.music && choice.music !== 'none' ? ' with music' : ' without music'}, made on this device. Nothing is uploaded.</p>
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
    {snapshot.musicError && <p className="screening-music-error" role="alert">{snapshot.musicError} Preview is continuing without music.</p>}
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
