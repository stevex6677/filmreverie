import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { cameraById } from '../data/cameras';
import { mm } from '../data/physicalScale';
import { fittedDistance, mountModel, orbitControls, studioEnvironment, viewDirections } from '../../standalone/model-viewer/model-core.js';
import { loadCameraModel } from '../utils/loadCameraModel';
import { createRenderLoop } from '../../standalone/model-viewer/render-loop.js';

type View = keyof typeof viewDirections;
type StageActions = { view: (view: View) => void; zoom: (factor: number) => void; turn: (x: number, y: number) => void; auto: (enabled: boolean) => void };

export function CameraDisplayView({ id, onBack, reducedMotion }: { id: string; onBack: () => void; reducedMotion: boolean }) {
  const entry = cameraById(id);
  const host = useRef<HTMLDivElement>(null), actions = useRef<StageActions | null>(null);
  const back = useRef<HTMLButtonElement>(null);
  const [info, setInfo] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0), [auto, setAuto] = useState(false), [used, setUsed] = useState(false);
  const [preset, setPreset] = useState<View | null>('home');
  useEffect(() => { back.current?.focus(); }, []);
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
    return () => { disposed = true; cleanup(); if (renderer && renderer.domElement.parentNode) { renderer.dispose(); renderer.domElement.remove(); } };
  }, [entry, attempt, reducedMotion]);
  if (!entry) return <section className="camera-display"><button onClick={onBack}>Back to shelf</button><p>Camera not found.</p></section>;
  const view = (value: View) => actions.current?.view(value);
  return <section className="camera-display" aria-label={`${entry.name} inspection`} data-model-ready={ready} data-preset={preset ?? 'free'}>
    <header className="camera-display-header"><button ref={back} onClick={onBack}>← Back to shelf</button><span>THE CAMERA COLLECTION <span aria-hidden="true">/ 01</span></span></header>
    <div className="camera-stage" ref={host} tabIndex={0} aria-label={`${entry.name} 3D model. Drag to rotate; pinch or scroll to zoom. Arrow keys rotate; plus and minus zoom; zero resets.`}
      onKeyDown={event => {
        if (event.key.startsWith('Arrow')) { event.preventDefault(); actions.current?.turn(event.key === 'ArrowLeft' ? -.15 : event.key === 'ArrowRight' ? .15 : 0, event.key === 'ArrowUp' ? -.15 : event.key === 'ArrowDown' ? .15 : 0); }
        if (['+', '=', '-', '0'].includes(event.key)) { event.preventDefault(); if (event.key === '0') view('home'); else actions.current?.zoom(event.key === '-' ? 1.2 : .8); }
      }} />
    {!ready && <div className="camera-load-status" role={error ? 'alert' : 'status'}><p>{error || `Opening ${entry.name}…`}</p>{error && <button onClick={() => setAttempt(value => value + 1)}>Retry model</button>}</div>}
    <div className="camera-stage-footer">
      {!used && <p className="camera-hint">Drag to rotate · Pinch or scroll to zoom</p>}
      <nav className="camera-view-presets" aria-label="Camera angles">{(['front', 'rear', 'left', 'right', 'top', 'bottom'] as View[]).map(value => <button key={value} disabled={!ready} aria-pressed={preset === value} onClick={() => view(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</nav>
      <div className="camera-orbit-tools" aria-label="Camera inspection controls">
        <button disabled={!ready} onClick={() => view('home')}>Reset view</button>
        <button disabled={!ready} aria-label="Zoom in" onClick={() => actions.current?.zoom(.8)}>＋</button><button disabled={!ready} aria-label="Zoom out" onClick={() => actions.current?.zoom(1.25)}>−</button>
        <button disabled={!ready} aria-label="Rotate left" onClick={() => actions.current?.turn(-.2, 0)}>↶</button><button disabled={!ready} aria-label="Rotate right" onClick={() => actions.current?.turn(.2, 0)}>↷</button>
        {!reducedMotion && <button disabled={!ready} aria-pressed={auto} onClick={() => actions.current?.auto(!auto)}>Auto rotate</button>}
      </div>
    </div>
    <button className="camera-info-toggle" aria-expanded={info} aria-controls="camera-information" onClick={() => setInfo(!info)}><span>{entry.name}</span><small>Introduced {entry.introduced} · About this camera {info ? '−' : '+'}</small></button>
    <aside id="camera-information" className={`camera-information ${info ? 'is-open' : ''}`} aria-label="About this camera">
      <button className="camera-info-close" onClick={() => setInfo(false)}>Close information</button>
      <span className="camera-kicker">{entry.manufacturer.toUpperCase()}</span><h1>{entry.title}<br /><em>{entry.titleAccent}</em></h1><p className="camera-intro">A camera built for possibilities.</p>
      <p>{entry.description}</p>
      <dl><div><dt>Introduced</dt><dd>{entry.introduced}</dd></div><div><dt>Type</dt><dd>{entry.category}</dd></div><div><dt>Lens shown</dt><dd>{entry.captionDetail}</dd></div></dl>
      {entry.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a>)}
    </aside>
  </section>;
}
