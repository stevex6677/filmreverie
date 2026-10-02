import type { StoredRoll } from '../storage/rollRepository';
import { FILM_PACKAGING } from '../data/filmPackaging';

export const SHELF_CAPACITY = 16;
export function validShelfSlot(slot: unknown): slot is number {
  return Number.isSafeInteger(slot) && Number(slot) >= 0;
}
export function firstFreeShelfSlot(rolls: StoredRoll[], exceptId?: string): number {
  const used = new Set(rolls.filter(r => r.id !== exceptId && r.trashedAt === null && validShelfSlot(r.shelfSlot)).map(r => r.shelfSlot));
  let slot = 0;
  while (used.has(slot)) slot++;
  return slot;
}
export function reconcileShelfSlots(rolls: StoredRoll[]): StoredRoll[] {
  const occupied = new Set<number>();
  const ordered = [...rolls].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const assigned = ordered.map(roll => {
    if (roll.trashedAt !== null) return roll.shelfSlot === undefined ? roll : { ...roll, shelfSlot: undefined };
    if (validShelfSlot(roll.shelfSlot) && !occupied.has(roll.shelfSlot)) { occupied.add(roll.shelfSlot); return roll; }
    return { ...roll, shelfSlot: undefined };
  });
  return assigned.map(roll => {
    if (roll.trashedAt !== null || validShelfSlot(roll.shelfSlot)) return roll;
    let slot = 0; while (occupied.has(slot)) slot++;
    occupied.add(slot); return { ...roll, shelfSlot: slot };
  });
}
// Stable pseudo-random decor, with every stock/format represented on page one.
// No roll records, persistence writes or interaction targets for placeholders.
export function placeholderPackaging(slot: number) {
  return FILM_PACKAGING[(slot * 7 + 3 + Math.floor(slot / 10) * 2) % Math.min(10, FILM_PACKAGING.length)];
}
export function shelfPageCount(rolls: StoredRoll[]) {
  return Math.max(1, Math.ceil((Math.max(-1, ...rolls.filter(r => r.trashedAt === null).map(r => r.shelfSlot ?? -1)) + 1) / SHELF_CAPACITY));
}
/** Every saved roll's cubby; moving onto an occupied cubby swaps the two rolls. */
export type ShelfArrangement = Record<string, number>;
export function arrangeShelf(rolls: StoredRoll[], id: string, slot: number): ShelfArrangement {
  const saved = reconcileShelfSlots(rolls).filter(r => r.trashedAt === null);
  const moving = saved.find(r => r.id === id);
  if (!moving || !validShelfSlot(slot)) throw new Error('This roll can no longer be moved. Refresh the shelf.');
  const slots: ShelfArrangement = Object.fromEntries(saved.map(r => [r.id, r.shelfSlot!]));
  const occupant = saved.find(r => r.shelfSlot === slot);
  if (occupant) slots[occupant.id] = moving.shelfSlot!;
  slots[id] = slot;
  return slots;
}
export function validShelfArrangement(value: unknown): value is ShelfArrangement {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const slots = Object.values(value);
  return slots.length <= 10_000 && slots.every(slot => validShelfSlot(slot) && slot < 100_000) && new Set(slots).size === slots.length;
}
/** Arranged rolls own their cubbies; an unlisted roll in one is placed afresh. */
export function applyShelfArrangement<T extends StoredRoll>(rolls: T[], slots: ShelfArrangement): T[] {
  const taken = new Set(Object.values(slots));
  return rolls.map(r => r.trashedAt !== null ? r
    : Object.hasOwn(slots, r.id) ? { ...r, shelfSlot: slots[r.id] }
      : r.shelfSlot !== undefined && taken.has(r.shelfSlot) ? { ...r, shelfSlot: undefined } : r);
}
