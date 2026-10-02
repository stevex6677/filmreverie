import { MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';
import { RollRepository, StoredRoll, storageMessage } from '../storage/rollRepository';
import { ensureExampleRoll } from '../storage/exampleRoll';
import { applyShelfArrangement, arrangeShelf, reconcileShelfSlots, SHELF_CAPACITY, ShelfArrangement, shelfPageCount } from './shelfLayout';

export interface ShelfSelection { id: string; anchor: HTMLElement; pinned: boolean }
/** Arrange mode: pick a roll up, then put it in an empty cubby or swap it with another roll. */
export interface ShelfArranger {
  active: boolean;
  /** The roll in hand, which may be carried across pages. */
  carrying: string | null;
  /** The cubby under the pointer or keyboard focus while carrying. */
  target: number | null;
  /** Client coordinates while a roll is dragged; read every frame, never rendered. */
  drag: MutableRefObject<{ x: number; y: number } | null>;
  status: string;
  lastMove: { name: string; previous: ShelfArrangement } | null;
  start: (carry?: string) => void;
  finish: () => void;
  pick: (id: string | null) => void;
  aim: (slot: number | null) => void;
  /** Puts the carried roll (or `id`, when a drag picked it up this instant) in a cubby. */
  place: (slot: number, id?: string) => void;
  /** A tap or Enter on a cubby: put down what is carried, otherwise pick up its roll. */
  choose: (slot: number, rollId?: string) => void;
  /** Escape: put back the carried roll, otherwise leave arrange mode. */
  cancel: () => void;
  undo: () => void;
  dismiss: () => void;
}
export function cubbyName(slot: number, pages: number) {
  const index = slot % SHELF_CAPACITY;
  return `${pages > 1 ? `page ${Math.floor(slot / SHELF_CAPACITY) + 1}, ` : ''}row ${Math.floor(index / 4) + 1}, column ${index % 4 + 1}`;
}
export interface FilmShelfState {
  rolls: StoredRoll[];
  allRolls: StoredRoll[];
  loaded: boolean;
  trash: boolean;
  changeTrash: (next: boolean) => void;
  retry: () => void;
  savedCount: number;
  trashCount: number;
  error: string;
  page: number;
  pages: number;
  changePage: (next: number) => void;
  selection: ShelfSelection | null;
  selectedRoll?: StoredRoll;
  show: (roll: StoredRoll, anchor: HTMLElement, pinned?: boolean) => void;
  leave: () => void;
  keep: () => void;
  close: () => void;
  /** Present only for a shelf whose owner can rearrange it. */
  arranger?: ShelfArranger;
}
export function useFilmShelf(repository: RollRepository, visible: boolean, enabled = true, seedExample = true): FilmShelfState {
  const [allRolls, setAllRolls] = useState<StoredRoll[]>([]), [error, setError] = useState('');
  const [trash, setTrash] = useState(false), [loaded, setLoaded] = useState(false), [revision, setRevision] = useState(0);
  const rolls = trash ? allRolls.filter(r => r.trashedAt !== null).sort((a,b) => b.trashedAt! - a.trashedAt!).map((r, shelfSlot) => ({ ...r, shelfSlot })) : allRolls.filter(r => r.trashedAt === null);
  const [arranging, setArranging] = useState(false), [carrying, setCarrying] = useState<string | null>(null);
  const [target, setTarget] = useState<number | null>(null), [status, setStatus] = useState('');
  const [lastMove, setLastMove] = useState<ShelfArranger['lastMove']>(null), [moveError, setMoveError] = useState('');
  const drag = useRef<{ x: number; y: number } | null>(null);
  // Overlay labels render in their own roots and can lag a fast keyboard; actions read this.
  const carryingRef = useRef<string | null>(null);
  const carry = (id: string | null) => { carryingRef.current = id; setCarrying(id); };
  // Arranging offers one empty page after the last, so rolls can spread out.
  const spare = arranging && !trash ? 1 : 0, spareRef = useRef(spare); spareRef.current = spare;
  const pages = trash ? Math.max(1, Math.ceil(rolls.length / 16)) : shelfPageCount(rolls) + spare;
  const [page, setPage] = useState(0), [selection, setSelection] = useState<ShelfSelection | null>(null);
  // Moves apply at once and save in order; reloads wait until the last one lands.
  const saveQueue = useRef<Promise<void>>(Promise.resolve()), pendingSaves = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false, sequence = 0;
    const refresh = async () => {
      const request = ++sequence;
      try {
        let preparationError = '';
        try { if (seedExample) await ensureExampleRoll(repository); } catch (failure) { preparationError = storageMessage(failure); }
        await repository.shelf();
        const saved = await repository.list();
        if (cancelled || request !== sequence || pendingSaves.current) return;
        setAllRolls(saved); setLoaded(true); setError(preparationError);
        setPage(current => Math.min(current, (trash ? Math.max(1, Math.ceil(saved.filter(r => r.trashedAt !== null).length / 16)) : shelfPageCount(saved) + spareRef.current) - 1));
        setSelection(current => current && saved.some(r => r.id === current.id && (trash ? r.trashedAt !== null : r.trashedAt === null)) ? current : null);
      } catch (failure) { if (!cancelled && request === sequence) setError(storageMessage(failure)); }
    };
    void refresh();
    const unsubscribe = repository.subscribe(() => { void refresh(); });
    const focus = () => { if (visible) void refresh(); };
    window.addEventListener('focus', focus);
    return () => { cancelled = true; unsubscribe(); window.removeEventListener('focus', focus); };
  }, [repository, visible, trash, revision, enabled, seedExample]);
  const finish = useCallback(() => {
    setArranging(false); carryingRef.current = null; setCarrying(null); setTarget(null); setStatus(''); drag.current = null;
  }, []);
  useEffect(() => { if (!visible) { close(); finish(); } }, [visible, close, finish]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { if (!arranging) setPage(current => Math.min(current, pages - 1)); }, [arranging, pages]);
  const changePage = (next: number) => { close(); setPage(Math.max(0, Math.min(next, pages - 1))); };
  const changeTrash = (next: boolean) => { close(); finish(); setPage(0); setTrash(next); };
  const saved = reconcileShelfSlots(allRolls).filter(r => r.trashedAt === null);
  const nameOf = (id: string) => saved.find(r => r.id === id)?.name ?? 'Roll';
  const commit = (slots: ShelfArrangement) => {
    setAllRolls(current => reconcileShelfSlots(applyShelfArrangement(current, slots)));
    pendingSaves.current++; setMoveError('');
    saveQueue.current = saveQueue.current.then(() => repository.arrange(slots)).catch(failure => {
      setMoveError(`${storageMessage(failure)} The shelf has been reloaded.`); setLastMove(null);
    }).finally(() => { if (!--pendingSaves.current) setRevision(r => r + 1); });
  };
  const arranger: ShelfArranger = {
    active: arranging && !trash, carrying, target, drag, status, lastMove,
    start: id => {
      close(); setArranging(true); carry(id ?? null); setTarget(null);
      setStatus(id ? `Picked up ${nameOf(id)}. Choose a cubby.` : 'Pick up a roll, then choose a cubby.');
    },
    finish,
    pick: id => {
      carry(id); setTarget(null); drag.current = null;
      setStatus(id ? `Picked up ${nameOf(id)}. Choose a cubby.` : 'Put back. Pick up a roll, then choose a cubby.');
    },
    aim: setTarget,
    place: (slot, id = carryingRef.current ?? undefined) => {
      const moving = saved.find(r => r.id === id);
      carry(null); setTarget(null); drag.current = null;
      if (!moving) return;
      if (moving.shelfSlot === slot) { setStatus(`Put ${moving.name} back.`); return; }
      const occupant = saved.find(r => r.shelfSlot === slot);
      try {
        const next = arrangeShelf(allRolls, moving.id, slot);
        setLastMove({ name: moving.name, previous: Object.fromEntries(saved.map(r => [r.id, r.shelfSlot!])) });
        commit(next);
        setStatus(occupant ? `Swapped ${moving.name} with ${occupant.name}.` : `Moved ${moving.name} to ${cubbyName(slot, pages)}.`);
      } catch (failure) { setMoveError(storageMessage(failure)); }
    },
    undo: () => {
      if (!lastMove) return;
      commit(lastMove.previous); setLastMove(null); carry(null);
      setStatus(`Moved ${lastMove.name} back.`);
    },
    dismiss: () => setLastMove(null),
    choose: (slot, rollId) => { if (carryingRef.current) arranger.place(slot); else if (rollId) arranger.pick(rollId); },
    cancel: () => { if (carryingRef.current) arranger.pick(null); else finish(); },
  };
  return { arranger, rolls, allRolls, loaded, trash, changeTrash, retry: () => { setMoveError(''); setRevision(r => r + 1); }, savedCount: allRolls.filter(r => r.trashedAt === null).length, trashCount: allRolls.filter(r => r.trashedAt !== null).length, error: moveError || error, page, pages, changePage, selection, selectedRoll: rolls.find(r => r.id === selection?.id), show, leave, keep, close };
}
