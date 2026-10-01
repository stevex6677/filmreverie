import { usePanelDismiss } from '../utils/usePanelDismiss';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CAMERAS, cameraById } from '../data/cameras';
import { cameraStory } from '../data/cameraStories';
import { mm } from '../data/physicalScale';
import { fittedDistance, mountModel, orbitControls, studioEnvironment, viewDirections } from '../../standalone/model-viewer/model-core.js';
import { loadCameraModel } from '../utils/loadCameraModel';
import { createRenderLoop } from '../../standalone/model-viewer/render-loop.js';

type View = keyof typeof viewDirections;
type StageActions = { view: (view: View) => void; zoom: (factor: number) => void; turn: (x: number, y: number) => void; auto: (enabled: boolean) => void };

export function CameraDisplayView({ id, onBack, onNavigate, reducedMotion }: { id: string; onBack: () => void; onNavigate?: (id: string) => void; reducedMotion: boolean }) {
  const entry = cameraById(id);
  const host = useRef<HTMLDivElement>(null), actions = useRef<StageActions | null>(null);
  const information=useRef<HTMLElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const [info, setInfo] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0), [auto, setAuto] = useState(false), [used, setUsed] = useState(false);
  const [preset, setPreset] = useState<View | null>('home');
  usePanelDismiss(information, info, ()=>setInfo(false));
  useEffect(() => { back.current?.focus(); }, []);
  // Browsing to another camera starts its label from the top.
  useEffect(() => { information.current?.scrollTo?.(0, 0); }, [id]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (info) setInfo(false); else onBack(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [info, onBack]);
  useEffect(() => {
    const stage = host.current;
    if (!stage || !entry) return;
    let disposed = false, renderer: THREE.WebGLRenderer | undefined;
    let cleanup = () => {};
    setReady(false); setError(''); setAuto(false); setPreset('home'); setUsed(false);
    const initialize = () => {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer:coarse)').matches ? 1.25 : 1.6));
        renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = entry.exposure;
        stage.append(renderer.domElement);
        const gl = renderer;
        const lost = (event: Event) => { event.preventDefault(); setReady(false); setError('The graphics view was interrupted. Restore the model to continue.'); };
        gl.domElement.addEventListener('webglcontextlost', lost);
        const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(34, 1, .003, 80);
        const environment = studioEnvironment(gl); scene.environment = environment.texture;
        scene.add(new THREE.HemisphereLight(0xffffff, 0x74746f, 1));
        const key = new THREE.DirectionalLight(0xfffaf2, .7); key.position.set(-3, 6, 4); scene.add(key);
        const fill = new THREE.DirectionalLight(0xeaf1ff, .6); fill.position.set(3, 1, -2); scene.add(fill);
        const controls = orbitControls(camera, gl.domElement, .2, 8);
        let size: THREE.Vector3 | undefined, fitted = 2;
        function draw() {
          if (disposed || document.hidden || gl.getContext().isContextLost()) return;
          controls.target.clampLength(0, size ? size.length() * 1.2 : 2);
          controls.update(); gl.render(scene, camera);
          gl.domElement.dataset.viewPosition = camera.position.toArray().map(n => n.toFixed(5)).join(',');
          gl.domElement.dataset.viewTarget = controls.target.toArray().map(n => n.toFixed(5)).join(',');
          gl.domElement.dataset.geometries = String(gl.info.memory.geometries);
        }
        const loop = createRenderLoop(draw, () => controls.autoRotate && !document.hidden && !gl.getContext().isContextLost());
        function render() { if (!document.hidden && !disposed) loop.invalidate(); }
        const setView = (view: View) => {
          controls.autoRotate = false; setAuto(false);
          // Flush residual damping before applying a new precise preset.
          controls.enableDamping = false; controls.update();
          camera.position.fromArray(viewDirections[view]).normalize().multiplyScalar(fitted);
          controls.target.set(0, 0, 0); controls.update(); controls.enableDamping = true;
          setPreset(view); render();
        };
        const observer = new ResizeObserver(() => {
          const { width, height } = stage.getBoundingClientRect();
          if (!width || !height) return;
          const oldFit = fitted;
          camera.aspect = width / height; camera.updateProjectionMatrix(); gl.setSize(width, height);
          if (size) {
            fitted = fittedDistance(size, camera.aspect);
            // Preserve inspected angle, pan and zoom ratio across orientation changes.
            camera.position.sub(controls.target).multiplyScalar(fitted / oldFit).add(controls.target);
            controls.maxDistance = fitted * 3;
          }
          render();
        });
        observer.observe(stage);
        controls.addEventListener('change', render);
        const started = () => { setUsed(true); setPreset(null); controls.autoRotate = false; setAuto(false); };
        controls.addEventListener('start', started);
        const visibility = () => { if (document.hidden) loop.pause(); else render(); };
        document.addEventListener('visibilitychange', visibility);
        actions.current = {
          view: setView,
          zoom: factor => { camera.position.sub(controls.target).clampLength(controls.minDistance / factor, controls.maxDistance / factor).multiplyScalar(factor).add(controls.target); setUsed(true); render(); },
          turn: (x, y) => {
            const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
            spherical.theta += x; spherical.phi = THREE.MathUtils.clamp(spherical.phi + y, .00001, Math.PI - .00001);
            camera.position.setFromSpherical(spherical).add(controls.target); setUsed(true); setPreset(null); render();
          },
          auto: enabled => { controls.autoRotate = enabled && !reducedMotion; setAuto(controls.autoRotate); render(); },
        };
        cleanup = () => {
          loop.dispose(); observer.disconnect(); controls.dispose();
          document.removeEventListener('visibilitychange', visibility);
          gl.domElement.removeEventListener('webglcontextlost', lost);
          environment.dispose(); gl.dispose(); gl.forceContextLoss(); gl.domElement.remove(); actions.current = null;
        };
        loadCameraModel(entry).then(source => {
          if (disposed) return;
          const mounted = mountModel(source, entry.rotation, mm(entry.widthMm));
          scene.add(mounted.object); size = mounted.size;
          fitted = fittedDistance(size, camera.aspect);
          controls.minDistance = size.length() * .24; controls.maxDistance = fitted * 3;
          gl.domElement.dataset.modelWidth = String(size.x);
          gl.domElement.dataset.modelId = entry.id;
          setView('home');
          controls.autoRotate = !reducedMotion; setAuto(controls.autoRotate);
          setReady(true); render();
        }).catch(() => { if (!disposed) setError(navigator.onLine ? 'The camera model could not be loaded. Check the connection and try again.' : "Camera model isn't available offline. Download it when connected."); });
      } catch { setError('The 3D view is unavailable. You can still read about this camera or return to the shelf.'); }
    };
    // React can run click-triggered effects before the browser paints. Give
    // the opening status and Back button a frame before costly WebGL setup,
    // environment generation and mounting an already-cached model.
    let setupFrame = requestAnimationFrame(() => {
      setupFrame = requestAnimationFrame(initialize);
    });
    return () => { disposed = true; cancelAnimationFrame(setupFrame); cleanup(); if (renderer && renderer.domElement.parentNode) { renderer.dispose(); renderer.domElement.remove(); } };
  }, [entry, attempt, reducedMotion]);
  if (!entry) return <section className="camera-display"><button onClick={onBack}>Back to shelf</button><p>Camera not found.</p></section>;
  const view = (value: View) => actions.current?.view(value);
  const story = cameraStory(entry.id);
  const index = CAMERAS.findIndex(camera => camera.id === entry.id);
  const neighbour = (step: number) => CAMERAS[(index + step + CAMERAS.length) % CAMERAS.length];
  const number = (value: number) => String(value).padStart(2, '0');
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
  return <section className="camera-display" aria-label={`${entry.name} inspection`} data-model-ready={ready} data-preset={preset ?? 'free'}>
    <header className="camera-display-header">
      <button ref={back} className="camera-back" onClick={onBack}><span aria-hidden="true">←</span> Back to shelf</button>
      <span className="camera-collection-label">The Camera Collection</span>
      {onNavigate && CAMERAS.length > 1 && <nav className="camera-switcher" aria-label="Browse the collection">
        <button aria-label={`Previous camera: ${neighbour(-1).name}`} title={neighbour(-1).name} onClick={() => onNavigate(neighbour(-1).id)}><Chevron left /></button>
        <span aria-live="polite"><span className="sr-only">Camera </span>{number(index + 1)}<span aria-hidden="true"> / </span><span className="sr-only"> of </span>{number(CAMERAS.length)}</span>
        <button aria-label={`Next camera: ${neighbour(1).name}`} title={neighbour(1).name} onClick={() => onNavigate(neighbour(1).id)}><Chevron /></button>
      </nav>}
    </header>
    <div className="camera-stage" ref={host} tabIndex={0} aria-label={`${entry.name} 3D model. Drag to rotate; pinch or scroll to zoom. Arrow keys rotate; plus and minus zoom; zero resets.`}
      onKeyDown={event => {
        if (event.key.startsWith('Arrow')) { event.preventDefault(); actions.current?.turn(event.key === 'ArrowLeft' ? -.15 : event.key === 'ArrowRight' ? .15 : 0, event.key === 'ArrowUp' ? -.15 : event.key === 'ArrowDown' ? .15 : 0); }
        if (['+', '=', '-', '0'].includes(event.key)) { event.preventDefault(); if (event.key === '0') view('home'); else actions.current?.zoom(event.key === '-' ? 1.2 : .8); }
      }} />
    {!ready && <div className="camera-load-status" role={error ? 'alert' : 'status'}><p>{error || `Opening ${entry.name}…`}</p>{error && <button onClick={() => setAttempt(value => value + 1)}>Retry model</button>}</div>}
    <div className="camera-dock">
      <p className={`camera-gesture-hint ${used ? 'is-hidden' : ''}`} aria-hidden={used}>{touch ? 'Drag to turn · Pinch to zoom' : 'Drag to turn · Scroll to zoom'}</p>
      <div className="camera-toolbar">
        <div className="camera-views" role="group" aria-label="Camera angles">
          {VIEWS.map(([value, label]) => <button key={value} disabled={!ready} aria-pressed={preset === value} onClick={() => view(value)}>{label}</button>)}
        </div>
        <span className="camera-toolbar-divider" aria-hidden="true" />
        <button className="camera-icon-button" disabled={!ready} aria-label="Reset view" title="Reset view" onClick={() => view('home')}><ResetIcon /></button>
        {!reducedMotion && <button className="camera-icon-button" disabled={!ready} aria-pressed={auto} aria-label="Auto rotate" title={auto ? 'Stop turning' : 'Turn automatically'} onClick={() => actions.current?.auto(!auto)}><OrbitIcon /></button>}
      </div>
    </div>
    <button data-panel-toggle className="camera-info-toggle" aria-expanded={info} aria-controls="camera-information" onClick={() => setInfo(!info)}>
      <span className="camera-info-toggle-text"><span>{entry.name}</span><small>{story?.tagline ?? `Introduced ${entry.introduced}`}</small></span>
      <span className="camera-info-toggle-action">{info ? 'Close' : 'About'}<Chevron up={!info} /></span>
    </button>
    <aside ref={information} id="camera-information" className={`camera-information ${info ? 'is-open' : ''}`} aria-label="About this camera">
      <span className="camera-sheet-handle" aria-hidden="true" />
      <button className="camera-sheet-close" aria-label="Close camera details" onClick={() => setInfo(false)}>×</button>
      <header className="camera-plaque">
        <p className="camera-kicker"><span>No. {number(index + 1)}</span><span>{entry.manufacturer}</span><span>{entry.introduced}</span></p>
        <h1>{entry.title} <em>{entry.titleAccent}</em></h1>
        {story && <p className="camera-tagline">{story.tagline}</p>}
      </header>
      <p className="camera-description">{entry.description}</p>
      <dl className="camera-specs">
        <div><dt>Introduced</dt><dd>{entry.introduced}</dd></div>
        <div><dt>Type</dt><dd>{entry.category}</dd></div>
        <div><dt>Lens shown</dt><dd>{entry.captionDetail}</dd></div>
        {story?.specs.map(spec => <div key={spec.label}><dt>{spec.label}</dt><dd>{spec.value}</dd></div>)}
      </dl>
      {story && <section className="camera-section" aria-labelledby="camera-special-heading">
        <h2 id="camera-special-heading">What makes it special</h2>
        <p>{story.special}</p>
      </section>}
      {story && <section className="camera-section" aria-labelledby="camera-facts-heading">
        <h2 id="camera-facts-heading">Fun facts</h2>
        <ol className="camera-facts">{story.facts.map((fact, item) => <li key={fact}><span aria-hidden="true">{number(item + 1)}</span><p>{fact}</p></li>)}</ol>
      </section>}
      <footer className="camera-sources"><span>Further reading</span>{entry.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}</footer>
    </aside>
  </section>;
}

/** Fewer, clearer presets: the drag gesture covers every in-between angle. */
const VIEWS: [View, string][] = [['front', 'Front'], ['left', 'Side'], ['rear', 'Rear'], ['top', 'Top']];

const icon = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
function Chevron({ left = false, up = false }: { left?: boolean; up?: boolean }) {
  return <svg {...icon} width={16} height={16} style={{ transform: `rotate(${up ? -90 : left ? 180 : 0}deg)` }}><path d="m9 5 7 7-7 7" /></svg>;
}
function ResetIcon() {
  return <svg {...icon}><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /></svg>;
}
function OrbitIcon() {
  return <svg {...icon}><path d="M12 3v18" strokeDasharray="2 2.6" /><path d="M15 16.6c-1 .2-2 .4-3 .4-5 0-9-2.2-9-5s4-5 9-5 9 2.2 9 5c0 1-.5 1.9-1.4 2.7" /><path d="m17.4 14.2 2.2.5.4 2.3" /></svg>;
}
