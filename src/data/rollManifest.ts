import photoSources from "./photoSources.json" with { type: "json" };
export interface RollFrame {
  id: string;
  order: number;
  src: string;
  alt: string;
  title: string;
  aspectRatio: number;
  thumbnailSrc?: string;
  rotation?: number;
  cropPosition?: import('../utils/photoFraming').CropPosition;
  /** Overrides the roll's film effect strength for this frame. */
  filmStrength?: number;
  original?: Blob;
  loadOriginal?: () => Promise<Blob>;
  sourceWidth?: number;
  sourceHeight?: number;
}

export const ROLL_FRAMES: readonly RollFrame[] = photoSources.map(frame => ({ ...frame, thumbnailSrc: frame.src.replace(/\.jpg$/, ".thumb.jpg") }));


export const ROLL_MANIFEST = {
  rollId: "roll-01",
  format: "135" as const,
  framesCount: 5,
  frames: ROLL_FRAMES,
};
