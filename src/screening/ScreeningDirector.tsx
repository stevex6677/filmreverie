import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { advance, useFrame, useThree } from '@react-three/fiber';
import { getTableIllumination } from '../shaders/tableIllumination';
import type { RollDefinition } from '../utils/rollLayout';
import { DEFAULT_LOOK, revealEdge, type ScreeningSample } from './timeline';
import { drawScreeningOverlay, overlayIsEmpty } from './overlay';
import { applyScreeningPose } from './camera';
import type { ScreeningSession } from './session';
import { DepthOfField } from './depthOfField';
import { PlaybackGovernor } from './governor';

type Uniforms = Record<string, THREE.IUniform>;
const uniformsOf = (object: THREE.Object3D): Uniforms | undefined => ((object as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms;
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Apply a sample's light and develop band to the actual table materials. */
const spillCache = new WeakMap<THREE.Scene, THREE.PointLight[]>();
function spillLights(scene: THREE.Scene) {
  let lights = spillCache.get(scene);
  if (!lights?.length || lights.some(light => !light.parent)) {
    lights = [];
    scene.traverse(object => { if (object.name === 'table-spill') lights!.push(object as THREE.PointLight); });
    spillCache.set(scene, lights);
  }
  return lights;
}

function applySample(table: THREE.Object3D, scene: THREE.Scene, roll: RollDefinition, sample: ScreeningSample | null, brightness: number, band = DEFAULT_LOOK.band) {
  const light = getTableIllumination(brightness), scale = sample?.light ?? 1;
  const ambient = .06 * (sample?.ambient ?? 0);
  table.traverse(object => {
    const uniforms = uniformsOf(object);
    if (uniforms?.uTableOutput) uniforms.uTableOutput.value = light.output * scale;
    if (uniforms?.uAmbient) uniforms.uAmbient.value = ambient;
  });
  for (const spill of spillLights(scene)) spill.intensity = light.spillIntensity * scale;
  const reveal = sample?.reveal;
  for (const strip of table.children) {
    const index = strip.userData.stripIndex;
    if (typeof index !== 'number') continue;
    const edge = reveal ? revealEdge(roll, index, reveal.position) : 0;
    const width = strip.userData.frameWidth as number;
    const glow = reveal && reveal.position < roll.frames.length ? sample!.kind === 'develop' ? .9 : .3 : 0;
    strip.traverse(object => {
      const uniforms = uniformsOf(object);
      if (!uniforms?.uReveal) return;
      // The shader derives polarity from the band, leaving the viewer's film mode untouched.
      uniforms.uReveal.value.set(edge, width * band, reveal ? reveal.mode === 'polarity' ? 1 : 2 : 0, glow);
    });
  }
}

export function ScreeningDirector({ session, table, roll, brightness }: {
  session: ScreeningSession; table: React.RefObject<THREE.Group>; roll: RollDefinition; brightness: number;
}) {
  const { gl, scene, camera, size, get } = useThree();
  const latest = useRef({ brightness, size }); latest.current = { brightness, size };
  useEffect(() => { if (!session.exporting) session.setAspect(size.width / size.height); }, [session, size.width, size.height]);

  // A cross-dissolve holds one render of the outgoing shot and fades it out.
  const preview = useRef<{ key: number; canvas: HTMLCanvasElement } | null>(null);

  // While screening, this renders the scene (priority > 0 replaces the default
  // render), in focus on the pose's target. During playback the governor sets
  // the bokeh samples and render resolution from the frame rate; a paused
  // frame is full resolution with dense sampling, redrawn only when it changes
  // (and twice a second for arriving photographs). Export sets its own size.
  const lens = useMemo(() => new DepthOfField(), []);
  useEffect(() => () => lens.dispose(), [lens]);
  const governor = useMemo(() => new PlaybackGovernor(), [session]);
  const still = useRef({ key: '', at: 0 });
  const playbackSamples = () => session.playing ? governor.quality.samples : 512;
  const draw = (focus: number, samples: number, scale = 1) => lens.render(gl, scene, camera as THREE.PerspectiveCamera, focus, session.timeline.look.aperture, samples, scale);

  // Compile every shader the reel will need (room, prints, depth of field)
  // before the timeline starts, so no compile interrupts playback. The reel
  // holds its opening black meanwhile.
  useEffect(() => {
    let cancelled = false;
    session.holding = true;
    const perspective = camera as THREE.PerspectiveCamera;
    applyScreeningPose(perspective, session.sample.camera);
    const warm = async () => {
      try {
        lens.warm(gl, scene, perspective, session.sample.camera.zoom, session.timeline.look.aperture);
        await Promise.race([gl.compileAsync(scene, perspective), wait(4000)]);
      } catch { /* Compiling on first use still works. */ }
      if (!cancelled) { session.holding = false; session.emit(); }
    };
    void warm();
    return () => { cancelled = true; session.holding = false; };
  }, [session, gl, scene, camera]);

  useFrame((_, delta) => session.tick(delta), -3);
  useFrame((_, delta) => {
    const playing = session.playing && !session.exporting && !session.holding;
    if (playing && governor.frame(delta)) gl.domElement.dataset.screeningQuality = String(governor.level);
    if (!playing && !session.exporting) {
      const key = `${session.time}|${gl.domElement.width}x${gl.domElement.height}|${latest.current.brightness}`, now = performance.now();
      if (key === still.current.key && now - still.current.at < 500) return;
      still.current = { key, at: now };
    } else still.current.key = '';
    draw(session.sample.camera.zoom, playing ? governor.quality.samples : 512, playing ? governor.quality.scale : 1);
  }, 1);
  // A clear overlay is left alone rather than cleared and recomposited every frame.
  const overlayClear = useRef(false);
  useFrame(() => {
    if (table.current) applySample(table.current, scene, roll, session.sample, latest.current.brightness, session.timeline.look.band);
    const overlay = session.overlay;
    if (!overlay || session.exporting) return;
    const dissolve = session.sample.dissolve;
    if (dissolve && preview.current?.key !== dissolve.key) {
      const perspective = camera as THREE.PerspectiveCamera, canvas = preview.current?.canvas ?? document.createElement('canvas');
      const outgoing = session.timeline.sample(dissolve.from).camera;
      applyScreeningPose(perspective, outgoing);
      draw(outgoing.zoom, playbackSamples(), session.playing ? governor.quality.scale : 1);
      still.current.key = '';
      canvas.width = gl.domElement.width; canvas.height = gl.domElement.height;
      canvas.getContext('2d')?.drawImage(gl.domElement, 0, 0);
      applyScreeningPose(perspective, session.sample.camera);
      preview.current = { key: dissolve.key, canvas };
    }
    const ratio = Math.min(1.5, window.devicePixelRatio || 1);
    const width = Math.round(overlay.clientWidth * ratio), height = Math.round(overlay.clientHeight * ratio);
    if (overlay.width !== width || overlay.height !== height) { overlay.width = width; overlay.height = height; overlayClear.current = true; }
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    const empty = !(dissolve && preview.current) && overlayIsEmpty(session.sample);
    if (empty && overlayClear.current) { overlay.dataset.drawn = 'true'; return; }
    overlayClear.current = empty;
    ctx.clearRect(0, 0, width, height);
    if (dissolve && preview.current) { ctx.globalAlpha = 1 - dissolve.amount; ctx.drawImage(preview.current.canvas, 0, 0, width, height); ctx.globalAlpha = 1; }
    drawScreeningOverlay(ctx, width, height, session.sample, session.credits);
    overlay.dataset.drawn = 'true';
  }, -1.5);

  // Restore every override when the screening ends, at any point.
  useEffect(() => () => {
    if (table.current) applySample(table.current, scene, roll, null, latest.current.brightness);
  }, [session, roll, scene, table]);

  useEffect(() => {
    let composite: HTMLCanvasElement | null = null, clock = 0;
    let outgoing: { key: number; canvas: HTMLCanvasElement } | null = null;
    let saved: { ratio: number; width: number; height: number; time: number; frameloop: 'always' | 'demand' | 'never' } | null = null;
    const perspective = camera as THREE.PerspectiveCamera;
    const resize = (width: number, height: number, ratio: number) => {
      gl.setPixelRatio(ratio); gl.setSize(width, height, false);
      perspective.aspect = width / height; perspective.updateProjectionMatrix();
    };
    session.engine = {
      async begin(width, height) {
        // Export renders each frame itself. Stop the live loop directly rather
        // than waiting for React to pass the Canvas a new prop: on an iPad that
        // re-render did not arrive in time ("Rendering is still running").
        const state = get(), frameloop = state.frameloop;
        state.setFrameloop('never');
        const buffer = gl.getSize(new THREE.Vector2());
        saved = { ratio: gl.getPixelRatio(), width: buffer.x, height: buffer.y, time: session.time, frameloop };
        composite = document.createElement('canvas'); composite.width = width; composite.height = height;
        clock = get().clock.elapsedTime;
        session.setAspect(width / height);
        resize(width, height, 1);
      },
      async prepare(time, signal) {
        // The loader keeps the focused frame and its neighbours resident; the
        // photograph on screen is always loaded before it is rendered.
        const index = session.timeline.sample(time).frameIndex;
        if (session.focusFrame !== index) { session.focusFrame = index; session.emit(); }
        for (let waited = 0; !session.textureReady(index) && waited < 20000; waited += 25) {
          if (signal.aborted) return;
          await wait(25);
        }
      },
      render(time) {
        const { width, height } = composite!;
        const buffer = gl.getSize(new THREE.Vector2());
        // A rotation during export must not change the video's resolution.
        if (buffer.x !== width || buffer.y !== height || gl.getPixelRatio() !== 1) resize(width, height, 1);
        const ctx = composite!.getContext('2d')!;
        const base = session.timeline.sample(time);
        if (base.dissolve && outgoing?.key !== base.dissolve.key) {
          // Render the outgoing shot once, at the exact export size.
          const canvas = outgoing?.canvas ?? document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          session.time = base.dissolve.from; session.sample = session.timeline.sample(session.time);
          clock += 1 / 30; advance(clock, true, get());
          canvas.getContext('2d')!.drawImage(gl.domElement, 0, 0, width, height);
          outgoing = { key: base.dissolve.key, canvas };
        }
        // Motion blur: average sub-frames across a 270° shutter during fast advances.
        const steps = base.blur > .05 ? 5 : 1;
        for (let step = 0; step < steps; step++) {
          const offset = steps > 1 ? ((step + .5) / steps - .5) * .75 / 30 : 0;
          session.time = time + offset; session.sample = session.timeline.sample(session.time);
          clock += 1 / (30 * steps);
          advance(clock, true, get());
          ctx.globalAlpha = 1 / (step + 1);
          ctx.drawImage(gl.domElement, 0, 0, width, height);
        }
        if (base.dissolve && outgoing) { ctx.globalAlpha = 1 - base.dissolve.amount; ctx.drawImage(outgoing.canvas, 0, 0, width, height); }
        ctx.globalAlpha = 1;
        session.time = time; session.sample = base;
        drawScreeningOverlay(ctx, width, height, base, session.credits);
        return composite!;
      },
      end() {
        const { size } = latest.current;
        // getSize() is in CSS pixels; the pixel ratio is restored separately.
        if (saved) resize(saved.width, saved.height, saved.ratio);
        perspective.aspect = size.width / size.height; perspective.updateProjectionMatrix();
        session.setAspect(size.width / size.height);
        // The preview resumes where it was paused, not at the video's last frame.
        if (saved) { session.seek(saved.time); get().setFrameloop(saved.frameloop); }
        composite = null; saved = null; outgoing = null;
      },
    };
    return () => { session.engine = null; };
  }, [session, gl, camera, get]);
  return null;
}
