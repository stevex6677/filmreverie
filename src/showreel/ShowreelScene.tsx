import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { DarkroomRoom } from '../components/DarkroomRoom';
import { CameraShelf } from '../components/CameraShelf';
import { FilmShelf, usePackagingTextures } from '../components/FilmShelf';
import { LightTable } from '../components/LightTable';
import { FilmStrip } from '../components/FilmStrip';
import { Loupe } from '../components/Loupe';
import { LOUPE_SIZE_SCALE } from '../utils/loupeView';
import { FILM_PACKAGING } from '../data/filmPackaging';
import { getFilmStock } from '../data/filmStocks';
import { DEFAULT_FILM_STRENGTH } from '../data/filmLooks';
import { TABLE_CENTER_Z, TABLE_SURFACE_Y } from '../utils/cameraBounds';
import { createRollLayout, lightTableSize } from '../utils/rollLayout';
import { useRollTextures } from '../utils/useRollTextures';
import { ProgressiveTextureUploader } from '../utils/progressiveTextures';
import type { CameraCollectionProgress } from '../utils/loadCameraModel';
import type { FilmShelfState } from '../utils/useFilmShelf';
import { ScreeningDirector } from '../screening/ScreeningDirector';
import { DarkroomPrints } from '../screening/DarkroomPrints';
import { applyScreeningPose } from '../screening/camera';
import type { ScreeningSession } from '../screening/session';
import { showreelCoverSource, type ShowreelRoll } from './rolls';
import type { ShowreelSample } from './timeline';

const noop = () => {};
const PACKAGING_IMAGES = new Set(FILM_PACKAGING.flatMap(p => [p.singleRollArtwork ?? p.box.asset, ...(p.cartridge ? [p.cartridge.asset] : [])])).size;

/** A read-only shelf holding the sample rolls; nothing can be selected. */
function useStaticShelf(rolls: readonly ShowreelRoll[]): FilmShelfState {
  return useMemo(() => {
    const stored = rolls.map(roll => roll.stored);
    return { rolls: stored, allRolls: stored, loaded: true, trash: false, changeTrash: noop, retry: noop, savedCount: stored.length, trashCount: 0, error: '',
      page: 0, pages: 1, changePage: noop, selection: null, show: noop, leave: noop, keep: noop, close: noop };
  }, [rolls]);
}

/**
 * The viewer's loupe, moved by the timeline and hidden frame by frame outside
 * its shot; while hidden it skips its capture. No React state is involved, so
 * frame-stepped export is exact.
 */
function ShowreelLoupe({ session, scale, texture }: { session: ScreeningSession; scale: number; texture: THREE.Texture }) {
  const mover = useRef<THREE.Group>(null);
  useFrame(() => {
    const place = (session.sample as ShowreelSample).loupe;
    if (mover.current) { mover.current.visible = !!place; if (place) mover.current.position.set(place.x, place.y, 0); }
  }, -2);
  return <group ref={mover} visible={false}>
    <Loupe type="classic" isActive targetX={0} targetY={0} frameIndex={0} u={.5} v={.5} texture={texture}
      isPositive magnification={4} brightness={1} physicalScale={scale * LOUPE_SIZE_SCALE.medium} isDeterministic opticalEffects />
  </group>;
}

/** The Darkroom Prints reel's prints, shown frame by frame only during its shot (export stays exact). */
function ShowreelPrints({ session, roll, textures }: { session: ScreeningSession; roll: ShowreelRoll; textures: THREE.Texture[] }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => { if (group.current) group.current.visible = (session.sample as ShowreelSample).shot === 'prints'; }, -2);
  return <group ref={group} visible={false}>
    <DarkroomPrints roll={roll.definition} textures={textures} stockId={roll.stockId} filmStrength={DEFAULT_FILM_STRENGTH} session={session} />
  </group>;
}

export interface ShowreelProgress { photos: number; photoTotal: number; cameras: number; cameraTotal: number; packaging: boolean; ready: boolean }

/**
 * The darkroom assembled for the showreel (memoized: the page re-renders as
 * the timeline advances; the scene must not): the room, film shelf, camera
 * cabinet and light table with both sample rolls resident. The timeline picks
 * which roll lies on the table; switching is instant, with no reload.
 */
export const ShowreelScene = memo(function ShowreelScene({ session, rolls, ready, onProgress }: { session: ScreeningSession; rolls: readonly ShowreelRoll[]; ready: boolean; onProgress: (progress: ShowreelProgress) => void }) {
  const { gl, camera } = useThree();
  const packaging = usePackagingTextures();
  const shelf = useStaticShelf(rolls);
  const portal = useRef<HTMLDivElement>(null);
  const table = useRef<THREE.Group>(null);

  const uploader = useMemo(() => new ProgressiveTextureUploader(gl), [gl]);
  useEffect(() => () => uploader.dispose(), [uploader]);
  const upload = useCallback((url: string) => uploader.load(url), [uploader]);
  const prefetch = useCallback((urls: readonly string[]) => uploader.prefetch(urls), [uploader]);
  const first = useRollTextures(rolls[0].definition, 0, 0, 0, gl.capabilities.maxTextureSize, upload, prefetch);
  const second = useRollTextures(rolls[1].definition, 0, 0, 0, gl.capabilities.maxTextureSize, upload, prefetch);
  const loaded = [first, second];

  const [cameras, setCameras] = useState({ loaded: 0, total: 5 });
  const onCameras = useCallback((progress: CameraCollectionProgress) => setCameras(current => current.loaded === progress.loaded && current.total === progress.total ? current : { loaded: progress.loaded, total: progress.total }), []);
  const photos = first.ready.filter(Boolean).length + second.ready.filter(Boolean).length;
  const photoTotal = first.ready.length + second.ready.length;
  const packagingReady = Object.keys(packaging).length >= PACKAGING_IMAGES;
  useEffect(() => {
    onProgress({ photos, photoTotal, cameras: cameras.loaded, cameraTotal: cameras.total, packaging: packagingReady, ready: photos === photoTotal && cameras.loaded === cameras.total && packagingReady });
  }, [photos, photoTotal, cameras, packagingReady, onProgress]);
  useEffect(() => { session.textureReady = () => first.settled && second.settled; }, [session, first.settled, second.settled]);

  const size = useMemo(() => {
    const sizes = rolls.map(roll => lightTableSize(roll.definition));
    return { width: Math.max(...sizes.map(s => s.width)), height: Math.max(...sizes.map(s => s.height)) };
  }, [rolls]);
  const layouts = useMemo(() => rolls.map(roll => createRollLayout(roll.definition)), [rolls]);

  // Camera and the roll on the table follow the timeline, before the screening renders.
  useFrame(() => {
    const sample = session.sample as ShowreelSample;
    applyScreeningPose(camera as THREE.PerspectiveCamera, sample.camera);
    for (const strip of table.current?.children ?? []) if (typeof strip.userData.showreelRoll === 'number') strip.visible = strip.userData.showreelRoll === sample.roll;
  }, -2);

  return <>
    <color attach="background" args={['#13151b']} />
    <DarkroomRoom benchWidth={Math.max(4.4, size.width + .8)} brightness={1} roomBrightness={.45} immediate />
    <CameraShelf textures={packaging} focused={false} interactive={false} load portal={portal} onApproach={noop} onOpen={noop} onSettled={onCameras} />
    <FilmShelf textures={packaging} readOnly coverSource={showreelCoverSource} focused={false} onApproach={noop} shelf={shelf} portal={portal} activeId="" interactive={false} />
    <group ref={table} position={[0, TABLE_SURFACE_Y, TABLE_CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]}>
      <LightTable width={size.width} height={size.height} brightness={1} />
      {rolls.map((roll, index) => layouts[index].map(strip => <group key={`${roll.definition.rollId}:${strip.index}`} visible={index === 0}
        userData={{ stripIndex: strip.index, frameWidth: strip.layout.frameWidth, roll: roll.definition, showreelRoll: index }}
        position={[0, strip.y, layouts[index].length > 1 ? .003 : 0]} scale={strip.scale}>
        <FilmStrip frames={strip.frames} stock={getFilmStock(roll.stockId)} textures={loaded[index].textures.slice(strip.offset, strip.offset + strip.frames.length)}
          filmStrength={DEFAULT_FILM_STRENGTH} isPositive layout={strip.layout} brightness={1} />
      </group>))}
      <ShowreelLoupe session={session} scale={rolls[0].definition.scale} texture={first.textures[0]} />
    </group>
    {/* The prints use the second roll, as in the showreel's Darkroom Prints shot. */}
    <ShowreelPrints session={session} roll={rolls[1]} textures={second.textures} />
    {/* Mounted once everything has loaded, so it compiles the finished scene before playing. */}
    {ready && <ScreeningDirector session={session} table={table} roll={rolls[0].definition} brightness={1} />}
  </>;
});
