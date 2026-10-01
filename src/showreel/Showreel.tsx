import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { DISPLAY_EXPOSURE } from '../shaders/tableIllumination';
import { useScreeningSnapshot } from '../screening/session';
import { SHOWREEL_ROLLS } from './rolls';
import { createShowreelSession, prerollShowreel } from './session';
import { ShowreelScene, type ShowreelProgress } from './ShowreelScene';
import { ShowreelExportDialog, ShowreelSettingsPanel } from './ShowreelPanels';
import { SoundtrackPlayer } from './music';
import { saveSettings, trackById, type ShowreelSettings } from './settings';
import './showreel.css';

const format = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;

/**
 * /showreel: a one-minute promotional film of the darkroom, rendered live
 * from code at 16:9, with a soundtrack. Not linked from the app. It opens on
 * its settings (music, grain and other looks), then previews or exports MP4.
 *
 * Query options: `t=12.5` start time, `paused=1` hold there, `clean=1` no
 * settings or controls (for screen recording), `size=1920x1080` fixed stage pixels.
 */
export default function Showreel() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const clean = params.get('clean') === '1';
  const fixed = params.get('size')?.match(/^(\d+)x(\d+)$/);
  const session = useMemo(() => {
    const look = params.get('look')?.split(',').map(Number).filter(Number.isFinite);
    return createShowreelSession(SHOWREEL_ROLLS, look && look.length >= 6 ? look : undefined);
  }, [params]);
  const snapshot = useScreeningSnapshot(session);
  // Review and test hook: the timeline's shots and captions.
  useEffect(() => { (window as typeof window & { __showreel?: typeof session }).__showreel = session; }, [session]);
  const [settings, setSettings] = useState<ShowreelSettings>(() => session.settings);
  const changeSettings = useCallback((patch: Partial<ShowreelSettings>) => setSettings(current => {
    const next = { ...current, ...patch };
    session.settings = next; saveSettings(next);
    return next;
  }), [session]);
  // The soundtrack: decoded ahead, and while it plays its clock drives the timeline.
  const player = useMemo(() => new SoundtrackPlayer(), []);
  useEffect(() => { (window as typeof window & { __showreelAudio?: SoundtrackPlayer }).__showreelAudio = player; return () => player.dispose(); }, [player]);
  const track = settings.music === 'none' ? undefined : trackById(settings.music);
  useEffect(() => { if (track) void player.load(track).catch(() => {}); }, [player, track]);
  useEffect(() => { session.clock = track ? () => player.now() : null; }, [session, player, track]);
  // Keep the music with the picture: start and stop with playback, restart after a seek.
  useEffect(() => {
    const sync = () => {
      if (!track || !session.playing || session.exporting) { if (player.active) player.stop(); return; }
      const now = player.now();
      if (!player.active || (now !== null && Math.abs(now - session.time) > .3))
        void player.play(track, session.time, session.timeline.cue, session.timeline.duration, settings.volume).catch(() => {});
    };
    sync();
    return session.subscribe(sync);
  }, [session, player, track, settings.volume]);
  const overlay = useRef<HTMLCanvasElement>(null);
  useEffect(() => { session.overlay = overlay.current; return () => { session.overlay = null; }; }, [session]);

  useEffect(() => {
    document.title = 'Film Reverie — Showreel';
    const robots = document.createElement('meta');
    robots.name = 'robots'; robots.content = 'noindex';
    document.head.append(robots);
    return () => robots.remove();
  }, []);

  const [progress, setProgress] = useState<ShowreelProgress | null>(null);
  const onProgress = useCallback((next: ShowreelProgress) => setProgress(next), []);
  const loaded = !!progress?.ready;
  // Once everything has loaded, a pre-roll renders the whole film once behind
  // the loading screen, then playback starts without first-sight stalls.
  const stage = useRef<HTMLDivElement>(null);
  const [preroll, setPreroll] = useState(0);
  const [ready, setReady] = useState(false);
  // Settings come first, unless the URL asks for a recording or a held moment.
  const [panel, setPanel] = useState(!clean && params.get('paused') !== '1');
  const [exporting, setExporting] = useState(false);
  const start = Number(params.get('t')) || 0;
  // The settings show their effect on a light-table frame, clear of the sheet.
  const settingsFrame = (session.timeline.shots.find(shot => shot.name === 'tracking')?.start ?? 0) + 1.2;
  useEffect(() => {
    if (!loaded) return;
    const abort = new AbortController();
    const canvas = stage.current?.querySelector<HTMLCanvasElement>('canvas:not(.showreel-overlay)');
    void prerollShowreel(session, canvas?.width || 1280, canvas?.height || 720, setPreroll, abort.signal).then(() => {
      if (abort.signal.aborted) return;
      setReady(true);
      if (panel) { session.seek(settingsFrame); return; }
      session.seek(start);
      if (params.get('paused') !== '1') session.play();
    });
    return () => abort.abort();
  // The pre-roll runs once, when everything has loaded.
  }, [loaded, session, params]);
  const preview = () => { setPanel(false); session.seek(start); session.play(); };
  const openSettings = () => { session.pause(); session.seek(settingsFrame); setPanel(true); };
  const openExport = () => { session.pause(); setExporting(true); };

  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = 0;
    const wake = () => { setIdle(false); window.clearTimeout(timer); timer = window.setTimeout(() => setIdle(true), 2500); };
    wake();
    window.addEventListener('pointermove', wake); window.addEventListener('keydown', wake);
    return () => { window.clearTimeout(timer); window.removeEventListener('pointermove', wake); window.removeEventListener('keydown', wake); };
  }, []);
  const [hidden, setHidden] = useState(clean);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (document.querySelector('.showreel-panel, .showreel-dialog')) return;
      if (event.target instanceof HTMLInputElement && event.key !== ' ') return;
      if (event.key === ' ' || event.key === 'k') { event.preventDefault(); session.toggle(); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); session.seek(session.time + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 5 : 1)); }
      else if (event.key === 'Home' || event.key === '0') { event.preventDefault(); session.seek(0); }
      else if (event.key === 'h') setHidden(value => !value);
      else if (event.key === 'f') { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [session]);

  const shots = session.timeline.shots;
  const stageStyle = fixed ? { width: `${fixed[1]}px`, height: `${fixed[2]}px` } : undefined;
  return <div className={`showreel ${idle && snapshot.playing ? 'is-idle' : ''}`} data-showreel-ready={ready} data-showreel-time={snapshot.time} data-showreel-playing={snapshot.playing}>
    <div ref={stage} className={`showreel-stage ${fixed ? 'is-fixed' : ''}`} style={stageStyle} onClick={() => { if (ready && !panel && !exporting) session.toggle(); }}>
      <Canvas shadows dpr={[1, Math.min(window.devicePixelRatio || 1, 1.5)]} camera={{ position: [0, 1, 4], fov: 45, near: .04, far: 50 }}
        gl={{ preserveDrawingBuffer: true, antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: DISPLAY_EXPOSURE, outputColorSpace: THREE.SRGBColorSpace }}>
        <ShowreelScene session={session} rolls={SHOWREEL_ROLLS} ready={loaded} onProgress={onProgress} />
      </Canvas>
      <canvas ref={overlay} className="showreel-overlay" aria-hidden="true" />
      {!ready && <div className="showreel-loading" role="status">
        <p>Developing the showreel…</p>
        {progress && !loaded && <span>Photographs {progress.photos}/{progress.photoTotal}  ·  Cameras {progress.cameras}/{progress.cameraTotal}</span>}
        {loaded && <span>Preparing scenes {Math.round(preroll * 100)}%</span>}
      </div>}
      {panel && !exporting && <ShowreelSettingsPanel settings={settings} onChange={changeSettings} player={player} ready={ready} duration={snapshot.duration}
        preparing={loaded ? `Preparing scenes ${Math.round(preroll * 100)}%` : 'Loading the darkroom…'}
        onPreview={preview} onExport={openExport} />}
      {exporting && <ShowreelExportDialog session={session} settings={settings} onResolution={resolution => changeSettings({ resolution })}
        onClose={() => { setExporting(false); if (panel) session.seek(settingsFrame); }} />}
    </div>
    {!hidden && !panel && !exporting && <div className="showreel-controls" onClick={event => event.stopPropagation()}>
      <button type="button" onClick={() => session.toggle()} disabled={!ready} aria-label={snapshot.playing ? 'Pause' : 'Play'}>{snapshot.playing ? '❚❚' : '▶'}</button>
      <button type="button" onClick={() => { session.seek(0); session.play(); }} disabled={!ready} aria-label="Restart">↺</button>
      <div className="showreel-scrubber">
        <input type="range" min={0} max={snapshot.duration} step={.1} value={snapshot.time} aria-label="Showreel position"
          onChange={event => session.seek(Number(event.currentTarget.value))} />
        <div className="showreel-marks" aria-hidden="true">
          {shots.map(shot => <span key={shot.name + shot.start} style={{ left: `${shot.start / snapshot.duration * 100}%` }} title={shot.name} />)}
        </div>
      </div>
      <span className="showreel-time">{format(snapshot.time)} / {format(snapshot.duration)}</span>
      <button type="button" onClick={openSettings} disabled={!ready}>Settings</button>
      <button type="button" className="is-primary" onClick={openExport} disabled={!ready}>Export</button>
      <span className="showreel-hint">Space play · ←/→ seek · H hide · F full screen</span>
    </div>}
  </div>;
}
