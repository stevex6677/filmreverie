import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StoredFrame, StoredRoll } from '../storage/rollRepository';
import type { FilmShelfState, ShelfSelection } from '../utils/useFilmShelf';
import { reconcileShelfSlots, shelfPageCount } from '../utils/shelfLayout';
import type { GalleryRoll } from './contracts';
import { downloadGalleryImage, fetchGallery, openLiveGalleryRoll, type GalleryRuntime } from './galleryClient';

// Gallery metadata contains no original image keys or visitor-local roll records.
function shelfRoll(roll: GalleryRoll): StoredRoll {
  return {
    id: roll.id, name: roll.name, camera: roll.camera, stockId: roll.stockId, format: roll.format,
    sizing: roll.sizing, filmStrength: roll.filmStrength,
    frameIds: roll.frames.map(frame => frame.id), coverId: roll.coverId,
    createdAt: roll.publishedAt, updatedAt: roll.publishedAt, trashedAt: null, shelfSlot: roll.shelfSlot,
  };
}
// The owner's cubbies; rolls published since the last arrangement fill free cubbies.
const shelfRolls = (catalog: GalleryRoll[]) => reconcileShelfSlots(catalog.map(shelfRoll));

export type PublicCoverFrame = Pick<StoredFrame, 'id' | 'width' | 'height' | 'rotation' | 'cropPosition'>;
export type PublicCover = { blob: Blob; frame: PublicCoverFrame; rotation: number };

export interface PublishedShelf {
  shelf: FilmShelfState;
  open: (id: string) => Promise<GalleryRuntime>;
  thumbnail: (id: string) => string | undefined;
  cover: (id: string, frameId: string) => Promise<PublicCover>;
  refresh: () => void;
  error: string;
  loading: boolean;
}

export function usePublishedShelf(visible: boolean): PublishedShelf {
  const [catalog, setCatalog] = useState<GalleryRoll[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(0), [selection, setSelection] = useState<ShelfSelection | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rolls = useMemo(() => shelfRolls(catalog), [catalog]);
  const pages = shelfPageCount(rolls);
  const keep = useCallback(() => { clearTimeout(timer.current); }, []);
  const close = useCallback(() => { keep(); setSelection(null); }, [keep]);
  const show = useCallback((roll: StoredRoll, anchor: HTMLElement, pinned = false) => {
    keep();
    const select = () => setSelection(current => !pinned && current?.pinned ? current : { id: roll.id, anchor, pinned });
    if (pinned) select(); else timer.current = setTimeout(select, 180);
  }, [keep]);
  const leave = useCallback(() => {
    keep(); timer.current = setTimeout(() => setSelection(current => current?.pinned ? current : null), 220);
  }, [keep]);
  const refresh = useCallback(() => { setRevision(current => current + 1); }, []);
  useEffect(() => {
    if (!visible) {
      setCatalog([]); setSelection(null); setPage(0);
      setError(''); setLoading(false); setLoaded(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void fetchGallery(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      keep();
      setCatalog(result.rolls);
      setPage(current => Math.min(current, shelfPageCount(shelfRolls(result.rolls)) - 1));
      setSelection(current => current && result.rolls.some(roll => roll.id === current.id) ? current : null);
    }).catch(failure => {
      keep();
      if (controller.signal.aborted) return;
      setCatalog([]); setSelection(null); setPage(0);
      setError(failure instanceof Error ? failure.message : 'The published gallery is unavailable.');
    }).finally(() => {
      if (!controller.signal.aborted) { setLoading(false); setLoaded(true); }
    });
    return () => controller.abort();
  }, [visible, revision, keep]);
  useEffect(() => {
    const focus = () => { if (visible) refresh(); };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [visible, refresh]);
  useEffect(() => { if (!visible) close(); }, [visible, close]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const changePage = (next: number) => { close(); setPage(Math.max(0, Math.min(next, pages - 1))); };
  const open = useCallback((id: string): Promise<GalleryRuntime> => {
    const roll = catalog.find(item => item.id === id);
    if (!roll) return Promise.reject(new Error('This published roll is no longer available. Refresh the gallery.'));
    return openLiveGalleryRoll(roll);
  }, [catalog]);
  const thumbnail = useCallback((id: string): string | undefined => {
    const roll = catalog.find(item => item.id === id);
    return roll?.frames.find(frame => frame.id === roll.coverId)?.thumbnail.url;
  }, [catalog]);
  const cover = useCallback(async (id: string, frameId: string): Promise<PublicCover> => {
    const roll = catalog.find(item => item.id === id);
    const frame = roll?.frames.find(item => item.id === frameId && item.id === roll.coverId);
    if (!frame) throw new Error('This published cover is no longer available.');
    const { bytes, mime } = await downloadGalleryImage(frame.thumbnail);
    return { blob: new Blob([bytes], { type: mime }), frame: {
      id: frame.id, width: frame.width, height: frame.height,
      rotation: frame.rotation, cropPosition: frame.cropPosition,
    }, rotation: frame.rotation };
  }, [catalog]);
  const shelf: FilmShelfState = {
    rolls, allRolls: rolls, loaded, trash: false, changeTrash: () => { close(); setPage(0); }, retry: refresh,
    savedCount: rolls.length, trashCount: 0, error, page, pages, changePage,
    selection, selectedRoll: rolls.find(roll => roll.id === selection?.id), show, leave, keep, close,
  };
  return { shelf, open, thumbnail, cover, refresh, error, loading };
}
