import type { GalleryImage, GalleryRoll } from './contracts';

export interface VerifiedGalleryImage { bytes: ArrayBuffer; mime: string }
const keyFor = (image: GalleryImage) => JSON.stringify([image.url, image.sha256, image.bytes]);

/** Session-only public derivatives, bounded by compressed bytes. Never private images. */
export class GalleryImageCache {
  private entries = new Map<string, VerifiedGalleryImage>();
  private bytes = 0;
  private allowed?: Set<string>;
  constructor(private limit = 48 * 1024 * 1024) {}

  get(image: GalleryImage): VerifiedGalleryImage | undefined {
    const key = keyFor(image), value = this.entries.get(key);
    if (value) { this.entries.delete(key); this.entries.set(key, value); }
    return value;
  }
  /** Only call after size and checksum verification succeeds. */
  put(image: GalleryImage, value: VerifiedGalleryImage) {
    const key = keyFor(image), size = value.bytes.byteLength;
    if (size !== image.bytes || size > this.limit || this.allowed && !this.allowed.has(key)) return;
    this.remove(key);
    while (this.bytes + size > this.limit && this.entries.size) this.remove(this.entries.keys().next().value!);
    this.entries.set(key, value); this.bytes += size;
  }
  retain(rolls: readonly GalleryRoll[]) {
    this.allowed = new Set(rolls.flatMap(roll => roll.frames.flatMap(frame => [keyFor(frame.viewing), keyFor(frame.thumbnail)])));
    for (const key of this.entries.keys()) if (!this.allowed.has(key)) this.remove(key);
  }
  clear() { this.entries.clear(); this.bytes = 0; this.allowed = new Set(); }
  private remove(key: string) {
    const value = this.entries.get(key);
    if (value) { this.bytes -= value.bytes.byteLength; this.entries.delete(key); }
  }
}
