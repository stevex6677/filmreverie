import { useEffect, useId, useRef, useState } from 'react';
import type { ExportProgress } from '../screening/export/exporter';
import { renderSoundtrack, type SoundtrackPlayer } from './music';
import { SHOWREEL_RESOLUTIONS, SHOWREEL_TRACKS, trackById, type ShowreelResolution, type ShowreelSettings } from './settings';
import type { ShowreelSession } from './session';

const seconds = (value: number) => `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, '0')}`;
const percent = (value: number) => `${Math.round(value * 100)}%`;

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId();
  return <div className="showreel-slider">
    <span><label htmlFor={id}>{label}</label><span aria-hidden="true">{percent(value)}</span></span>
    <input id={id} type="range" min={0} max={1} step={.05} value={value} aria-valuetext={percent(value)} onChange={event => onChange(Number(event.currentTarget.value))} />
  </div>;
}

/** Look and soundtrack, chosen before the preview; changes show on the frame behind it. */
export function ShowreelSettingsPanel({ settings, onChange, player, ready, preparing, duration, onPreview, onExport, onClose }: {
  settings: ShowreelSettings; onChange: (patch: Partial<ShowreelSettings>) => void; player: SoundtrackPlayer;
  ready: boolean; preparing: string; duration: number;
  onPreview: () => void; onExport: () => void; onClose?: () => void;
}) {
  const [listening, setListeningState] = useState<string | null>(null);
  // Only an audition is stopped on close; the preview may already be starting.
  const auditioning = useRef(false);
  const setListening = (id: string | null) => { auditioning.current = !!id; setListeningState(id); };
  useEffect(() => { player.onEnded = () => setListening(null); return () => { player.onEnded = null; if (auditioning.current) player.stop(); }; }, [player]);
  const listen = (id: string) => {
    const track = trackById(id);
    if (!track) { player.stop(); setListening(null); return; }
    setListening(id);
    void player.audition(track, settings.volume).catch(() => setListening(null));
  };
  return <aside className="showreel-panel" aria-labelledby="showreel-settings-title" onClick={event => event.stopPropagation()}>
    <header>
      <p className="showreel-kicker">Film Reverie</p>
      <h2 id="showreel-settings-title">Showreel</h2>
      <p className="showreel-meta">{seconds(duration)} · 16:9 · {settings.music === 'none' ? 'silent' : 'with music'}</p>
    </header>
    <fieldset className="showreel-tracks">
      <legend>Music</legend>
      {SHOWREEL_TRACKS.map(track => <div key={track.id} className="showreel-track">
        <label>
          <input type="radio" name="showreel-music" checked={settings.music === track.id}
            onClick={() => { if (settings.music === track.id) listen(track.id); }}
            onChange={() => { onChange({ music: track.id }); listen(track.id); }} />
          <span><strong>{track.title}</strong><small>{track.mood} · {track.artist}{listening === track.id ? ' · Playing preview' : ''}</small></span>
        </label>
      </div>)}
      <div className="showreel-track">
        <label><input type="radio" name="showreel-music" checked={settings.music === 'none'} onChange={() => { player.stop(); setListening(null); onChange({ music: 'none' }); }} /><span><strong>No music</strong></span></label>
      </div>
      {settings.music !== 'none' && <Slider label="Music volume" value={settings.volume} onChange={volume => onChange({ volume })} />}
      <p className="showreel-fineprint">CC0 tracks by HoliznaCC0: free to use anywhere, no credit required.</p>
    </fieldset>
    <fieldset>
      <legend>Look</legend>
      <Slider label="Film grain" value={settings.grain} onChange={grain => onChange({ grain })} />
      <Slider label="Vignette" value={settings.vignette} onChange={vignette => onChange({ vignette })} />
      <Slider label="Light leaks" value={settings.leaks} onChange={leaks => onChange({ leaks })} />
      <label className="showreel-switch"><input type="checkbox" checked={settings.titles} onChange={event => onChange({ titles: event.currentTarget.checked })} /><span>Titles and captions</span></label>
    </fieldset>
    <div className="showreel-actions">
      <button type="button" className="is-primary" disabled={!ready} onClick={() => { player.stop(); setListening(null); onPreview(); }}>{ready ? 'Preview' : preparing}</button>
      <button type="button" disabled={!ready} onClick={() => { player.stop(); setListening(null); onExport(); }}>Export video…</button>
      {onClose && <button type="button" className="is-quiet" onClick={onClose}>Close</button>}
    </div>
  </aside>;
}

type Phase = 'setup' | 'mixing' | 'rendering' | 'done' | 'error';

/** Frame-stepped MP4 export at 720p or 1080p, with the chosen soundtrack. */
export function ShowreelExportDialog({ session, settings, onResolution, onClose }: {
  session: ShowreelSession; settings: ShowreelSettings; onResolution: (resolution: ShowreelResolution) => void; onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [progress, setProgress] = useState<Omit<ExportProgress, 'preview'> | null>(null);
  const [result, setResult] = useState<{ url: string; size: number; silent: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const preview = useRef<HTMLCanvasElement>(null), controller = useRef<AbortController | null>(null);
  const track = settings.music === 'none' ? undefined : trackById(settings.music);
  const { width, height } = SHOWREEL_RESOLUTIONS[settings.resolution];
  const fileName = `film-reverie-showreel-${settings.resolution}.mp4`;
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  const start = async () => {
    const abort = new AbortController(); controller.current = abort;
    let silent = false, painted = 0;
    session.pause();
    try {
      const { exportScreening } = await import('../screening/export/exporter');
      setPhase('mixing');
      const duration = session.timeline.duration;
      const audio = track ? await renderSoundtrack(track, session.timeline.cue, duration, settings.volume) : undefined;
      if (abort.signal.aborted) return;
      setPhase('rendering');
      session.setExporting(true);
      const blob = await exportScreening(session, '16:9', { signal: abort.signal, size: { width, height }, audio, onSilent: () => { silent = true; }, onProgress: next => {
        const { preview: frame, ...rest } = next;
        setProgress(rest);
        const now = performance.now();
        if (frame && preview.current && now - painted > 250) { painted = now; preview.current.getContext('2d')?.drawImage(frame, 0, 0, preview.current.width, preview.current.height); }
      } });
      if (abort.signal.aborted) return;
      setResult({ url: URL.createObjectURL(blob), size: blob.size, silent: silent && !!track }); setPhase('done');
    } catch (error) {
      if (abort.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      setMessage(error instanceof Error ? error.message : String(error)); setPhase('error');
    } finally { session.setExporting(false); }
  };
  const cancel = () => { controller.current?.abort(); onClose(); };
  const download = () => {
    if (!result) return;
    const link = document.createElement('a'); link.href = result.url; link.download = fileName;
    document.body.append(link); link.click(); link.remove();
  };
  const done = progress?.total ? progress.frame / progress.total : 0;
  return <div className="showreel-dialog" role="dialog" aria-modal="true" aria-labelledby="showreel-export-title" data-phase={phase} onClick={event => event.stopPropagation()}>
    <h2 id="showreel-export-title">{phase === 'done' ? 'Your video is ready' : phase === 'error' ? 'The video could not be finished' : 'Export video'}</h2>
    {phase === 'setup' && <>
      <fieldset className="showreel-resolutions">
        <legend>Resolution</legend>
        {(Object.keys(SHOWREEL_RESOLUTIONS) as ShowreelResolution[]).map(option => <label key={option}>
          <input type="radio" name="showreel-resolution" checked={settings.resolution === option} onChange={() => onResolution(option)} />
          <span><strong>{option}</strong><small>{SHOWREEL_RESOLUTIONS[option].width} × {SHOWREEL_RESOLUTIONS[option].height}</small></span>
        </label>)}
      </fieldset>
      <p className="showreel-fineprint">{seconds(session.timeline.duration)} · 30 fps · H.264{track ? ` · music: ${track.title}` : ' · silent'}. Rendered frame by frame on this device; nothing is uploaded. Keep this tab open.</p>
      <div className="showreel-actions">
        <button type="button" className="is-primary" onClick={() => void start()}>Export</button>
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    </>}
    {(phase === 'mixing' || phase === 'rendering') && <>
      <canvas ref={preview} className="showreel-export-preview" width={480} height={270} aria-label="Current frame" />
      <progress max={1} value={done} aria-label="Export progress" />
      <p role="status">{phase === 'mixing' ? 'Mixing the soundtrack…' : progress?.paused ? 'Paused while the tab is in the background.'
        : progress?.total ? `${Math.round(done * 100)}% · frame ${progress.frame} of ${progress.total}${progress.remaining !== null && progress.frame > 30 ? ` · about ${seconds(progress.remaining / 1000)} left` : ''}` : 'Starting…'}</p>
      <div className="showreel-actions"><button type="button" onClick={cancel}>Cancel</button></div>
    </>}
    {phase === 'done' && result && <>
      <video className="showreel-export-preview" src={result.url} controls playsInline />
      <p className="showreel-fineprint">{fileName} · {(result.size / 1e6).toFixed(1)} MB{result.silent ? ' · this browser could not encode audio, so the video is silent' : ''}</p>
      <div className="showreel-actions">
        <button type="button" className="is-primary" onClick={download}>Download</button>
        <button type="button" onClick={onClose}>Done</button>
      </div>
    </>}
    {phase === 'error' && <><p role="alert">{message}</p><div className="showreel-actions"><button type="button" onClick={onClose}>Close</button></div></>}
  </div>;
}
