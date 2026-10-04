import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { DarkroomRoom } from '../components/DarkroomRoom';
import { CameraShelf } from '../components/CameraShelf';
import { FilmShelf, usePackagingTextures } from '../components/FilmShelf';
import type { ShelfCoverSource } from '../components/ShelfCoverFrame';
import { LightTable } from '../components/LightTable';
import { FilmStrip } from '../components/FilmStrip';
import { Loupe } from '../components/Loupe';
import { LOUPE_SIZE_SCALE } from '../utils/loupeView';
import { FILM_PACKAGING } from '../data/filmPackaging';
import { getFilmStock } from '../data/filmStocks';
import { TABLE_CENTER_Z, TABLE_SURFACE_Y } from '../utils/cameraBounds';
import { createRollLayout } from '../utils/rollLayout';
import { filterPhotograph, ProgressiveTextureUploader } from '../utils/progressiveTextures';
import { SHELF_CAPACITY } from '../utils/shelfLayout';
import type { CameraCollectionProgress } from '../utils/loadCameraModel';
import { usePublishedShelf } from '../cloud/publicShelf';
import { ScreeningDirector } from '../screening/ScreeningDirector';
import { DarkroomPrints } from '../screening/DarkroomPrints';
import { applyScreeningPose } from '../screening/camera';
import type { ScreeningSession } from '../screening/session';
import { SHOWREEL_BRIGHTNESS, SHOWREEL_FILM_STRENGTH, SHOWREEL_TABLE, type ShowreelRoll } from './rolls';
import type { ShowreelSample, ShowreelTimeline } from './timeline';

const noop = () => {};
const PACKAGING_IMAGES = new Set(FILM_PACKAGING.flatMap(p => [p.singleRollArtwork ?? p.box.asset, ...(p.cartridge ? [p.cartridge.asset] : [])])).size;

/**
 * Every photograph of every roll, uploaded once and kept: all of them lie on
 * the table at once. Uploads go through the progressive uploader, two at a
 * time, so loading never stalls a frame.
 */
function useShowreelTextures(rolls: readonly ShowreelRoll[], upload: (url: string) => Promise<THREE.Texture>) {
  const urls = useMemo(() => [...new Set(rolls.flatMap(roll => roll.definition.frames.map(frame => frame.src)))], [rolls]);
  const [loaded, setLoaded] = useState<ReadonlyMap<string, THREE.Texture>>(new Map());
  const [failed, setFailed] = useState(0);
  useEffect(() => {
    let cancelled = false, next = 0;
    const textures = new Map<string, THREE.Texture>(), loader = new THREE.TextureLoader();
    const fallback = (url: string) => loader.loadAsync(url).then(texture => { texture.colorSpace = THREE.SRGBColorSpace; filterPhotograph(texture); return texture; });
    const worker = async () => {
      while (!cancelled && next < urls.length) {
        const url = urls[next++];
        try {
          const texture = await upload(url).catch(() => fallback(url));
          if (cancelled) { texture.dispose(); return; }
          textures.set(url, texture); setLoaded(new Map(textures));
        } catch { if (!cancelled) setFailed(count => count + 1); }
      }
    };
    void Promise.all([worker(), worker()]);
    return () => { cancelled = true; textures.forEach(texture => texture.dispose()); };
  }, [urls, upload]);
  return { loaded, failed, total: urls.length, settled: loaded.size + failed >= urls.length };
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
      isPositive magnification={4} brightness={SHOWREEL_BRIGHTNESS} physicalScale={scale * LOUPE_SIZE_SCALE.medium} isDeterministic opticalEffects />
  </group>;
}

/** The Darkroom Prints reel's prints, shown frame by frame only during its shot (export stays exact). */
function ShowreelPrints({ session, roll, textures }: { session: ScreeningSession; roll: ShowreelRoll; textures: THREE.Texture[] }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => { if (group.current) group.current.visible = (session.sample as ShowreelSample).shot === 'prints'; }, -2);
  return <group ref={group} visible={false}>
    <DarkroomPrints roll={roll.definition} textures={textures} stockId={roll.stockId} filmStrength={SHOWREEL_FILM_STRENGTH} session={session} />
  </group>;
}

export interface ShowreelProgress { photos: number; photoTotal: number; cameras: number; cameraTotal: number; packaging: boolean; shelf: boolean; ready: boolean }

/**
 * The darkroom assembled for the showreel (memoized: the page re-renders as
 * the timeline advances; the scene must not): the room, the published film
 * shelf, the camera cabinet and one light table with every roll laid out on
 * it. The timeline picks which roll a moment features.
 */
export const ShowreelScene = memo(function ShowreelScene({ session, rolls, ready, onProgress }: { session: ScreeningSession; rolls: readonly ShowreelRoll[]; ready: boolean; onProgress: (progress: ShowreelProgress) => void }) {
  const { gl, camera } = useThree();
  const packaging = usePackagingTextures();
  const portal = useRef<HTMLDivElement>(null);
  const table = useRef<THREE.Group>(null);

  // The film shelf as published: the gallery's rolls and cover photographs, read-only.
  const published = usePublishedShelf(true);
  const [covers, setCovers] = useState(0);
  const coverSource = useMemo<ShelfCoverSource>(() => (id, frameId) => published.cover(id, frameId).finally(() => setCovers(count => count + 1)), [published.cover]);
  const shelved = published.shelf.rolls.filter(roll => roll.shelfSlot !== undefined && roll.shelfSlot < SHELF_CAPACITY).length;
  // An unavailable gallery leaves the shelf with its placeholder cartons rather than holding the film.
  const shelfReady = published.shelf.loaded && !published.loading && (!!published.error || covers >= shelved);

  const uploader = useMemo(() => new ProgressiveTextureUploader(gl), [gl]);
  useEffect(() => () => uploader.dispose(), [uploader]);
  const upload = useCallback((url: string) => uploader.load(url), [uploader]);
  const photos = useShowreelTextures(rolls, upload);
  const placeholder = useMemo(() => { const texture = new THREE.DataTexture(new Uint8Array([65, 65, 65, 255]), 1, 1); texture.needsUpdate = true; return texture; }, []);
  useEffect(() => () => placeholder.dispose(), [placeholder]);
  const textures = useMemo(() => rolls.map(roll => roll.definition.frames.map(frame => photos.loaded.get(frame.src) ?? placeholder)), [rolls, photos.loaded, placeholder]);

  const [cameras, setCameras] = useState({ loaded: 0, total: 5 });
  const onCameras = useCallback((progress: CameraCollectionProgress) => setCameras(current => current.loaded === progress.loaded && current.total === progress.total ? current : { loaded: progress.loaded, total: progress.total }), []);
  const packagingReady = Object.keys(packaging).length >= PACKAGING_IMAGES;
  useEffect(() => {
    onProgress({ photos: photos.loaded.size + photos.failed, photoTotal: photos.total, cameras: cameras.loaded, cameraTotal: cameras.total, packaging: packagingReady, shelf: shelfReady,
      ready: photos.settled && cameras.loaded === cameras.total && packagingReady && shelfReady });
  }, [photos.loaded.size, photos.failed, photos.total, photos.settled, cameras, packagingReady, shelfReady, onProgress]);
  useEffect(() => { session.textureReady = () => photos.settled; }, [session, photos.settled]);

  const layouts = useMemo(() => rolls.map(roll => createRollLayout(roll.definition)), [rolls]);
  // The roll printed in the Darkroom Prints shot.
  const printed = Math.max(0, (session.timeline as ShowreelTimeline).shots?.find(shot => shot.name === 'prints')?.roll ?? 0);

  // Camera, and the roll the moment features, follow the timeline before the screening renders.
  useFrame(() => {
    const sample = session.sample as ShowreelSample;
    applyScreeningPose(camera as THREE.PerspectiveCamera, sample.camera);
    for (const strip of table.current?.children ?? []) if (typeof strip.userData.showreelRoll === 'number') strip.userData.screeningActive = strip.userData.showreelRoll === sample.roll;
  }, -2);

  return <>
    <color attach="background" args={['#13151b']} />
    <DarkroomRoom benchWidth={Math.max(4.4, SHOWREEL_TABLE.width + .8)} brightness={SHOWREEL_BRIGHTNESS} roomBrightness={.45} immediate />
    <CameraShelf textures={packaging} focused={false} interactive={false} load portal={portal} onApproach={noop} onOpen={noop} onSettled={onCameras} />
    <FilmShelf textures={packaging} readOnly coverSource={coverSource} focused={false} onApproach={noop} shelf={published.shelf} portal={portal} activeId="" interactive={false} />
    <group ref={table} position={[0, TABLE_SURFACE_Y, TABLE_CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]}>
      <LightTable width={SHOWREEL_TABLE.width} height={SHOWREEL_TABLE.height} brightness={SHOWREEL_BRIGHTNESS} />
      {rolls.map((roll, index) => layouts[index].map(strip => <group key={`${roll.definition.rollId}:${strip.index}`}
        userData={{ stripIndex: strip.index, frameWidth: strip.layout.frameWidth, roll: roll.definition, showreelRoll: index }}
        position={[roll.offset.x, roll.offset.y + strip.y, layouts[index].length > 1 ? .003 : 0]} scale={strip.scale}>
        <FilmStrip frames={strip.frames} stock={getFilmStock(roll.stockId)} textures={textures[index].slice(strip.offset, strip.offset + strip.frames.length)}
          filmStrength={SHOWREEL_FILM_STRENGTH} isPositive layout={strip.layout} brightness={SHOWREEL_BRIGHTNESS} />
      </group>))}
      <ShowreelLoupe session={session} scale={rolls[0].definition.scale} texture={placeholder} />
    </group>
    <ShowreelPrints session={session} roll={rolls[printed]} textures={textures[printed]} />
    {/* Mounted once everything has loaded, so it compiles the finished scene before playing. */}
    {ready && <ScreeningDirector session={session} table={table} roll={rolls[0].definition} brightness={SHOWREEL_BRIGHTNESS} />}
  </>;
});
