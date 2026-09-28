import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { advance, useFrame, useThree } from '@react-three/fiber';
import { getTableIllumination } from '../shaders/tableIllumination';
import type { RollDefinition } from '../utils/rollLayout';
import { revealEdge, type ScreeningSample } from './timeline';
import { drawScreeningOverlay } from './overlay';
import type { ScreeningSession } from './session';

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

function applySample(table: THREE.Object3D, scene: THREE.Scene, roll: RollDefinition, sample: ScreeningSample | null, brightness: number) {
  const light = getTableIllumination(brightness), scale = sample?.light ?? 1;
  table.traverse(object => { const uniforms = uniformsOf(object); if (uniforms?.uTableOutput) uniforms.uTableOutput.value = light.output * scale; });
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
      uniforms.uReveal.value.set(edge, width * .06, reveal ? reveal.mode === 'polarity' ? 1 : 2 : 0, glow);
    });
  }
}

export function ScreeningDirector({ session, table, roll, brightness }: {
  session: ScreeningSession; table: React.RefObject<THREE.Group>; roll: RollDefinition; brightness: number;
}) {
  const { gl, scene, camera, size, get } = useThree();
  const latest = useRef({ brightness, size }); latest.current = { brightness, size };
  useEffect(() => { if (!session.exporting) session.setAspect(size.width / size.height); }, [session, size.width, size.height]);

  useFrame((_, delta) => session.tick(delta), -3);
  useFrame(() => {
    if (table.current) applySample(table.current, scene, roll, session.sample, latest.current.brightness);
    const overlay = session.overlay;
    if (!overlay || session.exporting) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(overlay.clientWidth * ratio), height = Math.round(overlay.clientHeight * ratio);
    if (overlay.width !== width || overlay.height !== height) { overlay.width = width; overlay.height = height; }
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    drawScreeningOverlay(ctx, width, height, session.sample, session.credits);
  }, -1.5);

  // Restore every override when the screening ends, at any point.
  useEffect(() => () => {
    if (table.current) applySample(table.current, scene, roll, null, latest.current.brightness);
  }, [session, roll, scene, table]);

  useEffect(() => {
    let composite: HTMLCanvasElement | null = null, clock = 0;
    let saved: { ratio: number; width: number; height: number; time: number } | null = null;
    const perspective = camera as THREE.PerspectiveCamera;
    const resize = (width: number, height: number, ratio: number) => {
      gl.setPixelRatio(ratio); gl.setSize(width, height, false);
      perspective.aspect = width / height; perspective.updateProjectionMatrix();
    };
    session.engine = {
      async begin(width, height) {
        // Export renders each frame itself; wait for the live loop to stop.
        for (let i = 0; get().frameloop !== 'never' && i < 120; i++) await wait(16);
        if (get().frameloop !== 'never') throw new Error('Rendering is still running.');
        const buffer = gl.getSize(new THREE.Vector2());
        saved = { ratio: gl.getPixelRatio(), width: buffer.x, height: buffer.y, time: session.time };
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
        if (saved) session.seek(saved.time);
        composite = null; saved = null;
      },
    };
    return () => { session.engine = null; };
  }, [session, gl, camera, get]);
  return null;
}
