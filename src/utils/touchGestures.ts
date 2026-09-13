export interface Contact { id: number; x: number; y: number }
export type GestureIntent =
  | { type: 'pan' | 'look'; dx: number; dy: number }
  | { type: 'pinch'; from: Contact; to: Contact; ratio: number }
  | { type: 'tap' | 'doubleTap' | 'loupe'; x: number; y: number }
  | { type: 'swipe'; direction: 'left' | 'right' };
export type GestureMode = 'room' | 'pan' | 'swipe' | 'loupe';

// One owner for an entire gesture; a pinch can never become a tap or swipe.
export class TouchGestures {
  contacts = new Map<number, Contact>();
  private origin: Contact | null = null;
  private mode: GestureMode = 'pan';
  private moved = false;
  private multiple = false;
  private pending: { x: number; y: number; time: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private emit: (intent: GestureIntent) => void) {}
  down(point: Contact, mode: GestureMode) {
    this.contacts.set(point.id, point);
    if (this.contacts.size === 1) {
      this.origin = point; this.mode = mode; this.moved = false; this.multiple = false;
      if (mode === 'loupe') this.emit({ type: 'loupe', ...point });
    } else {
      this.multiple = true; this.clearTap();
    }
  }
  move(point: Contact) {
    const before = this.contacts.get(point.id); if (!before) return;
    const old = [...this.contacts.values()]; this.contacts.set(point.id, point);
    if (this.contacts.size >= 2) {
      if (this.mode === 'room' || this.contacts.size !== 2) return;
      const next = [...this.contacts.values()];
      const center = (p: Contact[]) => ({ id: -1, x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 });
      const distance = (p: Contact[]) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (distance(old) > 8 && distance(next) > 8) this.emit({ type: 'pinch', from: center(old), to: center(next), ratio: distance(old) / distance(next) });
      return;
    }
    if (!this.origin) return;
    const dx = point.x - this.origin.x, dy = point.y - this.origin.y;
    const wasMoved = this.moved;
    this.moved ||= Math.hypot(dx, dy) > 8;
    if (this.moved) this.clearTap();
    if (this.mode === 'loupe' && !this.multiple) this.emit({ type: 'loupe', ...point });
    else if (this.moved && (this.mode === 'pan' || this.mode === 'room' || this.multiple)) {
      // Include movement before threshold exactly once, then use incremental deltas.
      this.emit({ type: this.mode === 'room' ? 'look' : 'pan', dx: wasMoved ? point.x - before.x : dx, dy: wasMoved ? point.y - before.y : dy });
    }
  }
  up(point: Contact, time = Date.now()) {
    if (!this.contacts.has(point.id)) return;
    this.contacts.delete(point.id);
    if (this.contacts.size) { this.origin = [...this.contacts.values()][0]; this.moved = true; return; }
    if (this.origin && !this.multiple && this.mode !== 'loupe') {
      const dx = point.x - this.origin.x, dy = point.y - this.origin.y;
      if (this.mode === 'swipe' && Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.4) this.emit({ type: 'swipe', direction: dx < 0 ? 'right' : 'left' });
      else if (!this.moved && Math.hypot(dx, dy) <= 8) {
        if (this.pending && time - this.pending.time < 300 && Math.hypot(point.x - this.pending.x, point.y - this.pending.y) < 28) {
          this.clearTap(); this.emit({ type: 'doubleTap', ...point });
        } else {
          this.clearTap(); this.pending = { ...point, time };
          this.timer = setTimeout(() => { this.pending = null; this.emit({ type: 'tap', ...point }); }, 300);
        }
      }
    }
    this.origin = null;
  }
  private clearTap() { clearTimeout(this.timer); this.pending = null; }
  cancel() { this.clearTap(); this.contacts.clear(); this.origin = null; this.moved = false; this.multiple = false; }
}
