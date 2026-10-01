import type { StoredRoll, StoredFrame } from '../storage/rollRepository';

// Public records deliberately omit source names, hashes, original keys and saved private views.
export interface GalleryImage { url: string; bytes: number; sha256: string }
export interface GalleryFrame {
  id: string; width: number; height: number; rotation: number;
  cropPosition?: { x: number; y: number };
  filmStrength?: number;
  viewing: GalleryImage; thumbnail: GalleryImage;
}
export interface GalleryRoll {
  id: string; revision: string; name: string; stockId: StoredRoll['stockId'];
  format: StoredRoll['format']; sizing?: StoredRoll['sizing']; filmStrength?: number;
  coverId: string; frames: GalleryFrame[]; publishedAt: number;
}
export interface GalleryCatalog { version: 1; rolls: GalleryRoll[] }
// Cloud drafts contain only browser-produced derivatives; guest StoredFrame retains its original fields.
export interface DraftFrame extends Pick<StoredFrame, 'id' | 'rollId' | 'filename' | 'width' | 'height' | 'rotation' | 'cropPosition' | 'filmStrength' | 'viewingKey' | 'thumbnailKey'> {
  uploadId: string;
  viewingSha256: string;
}
export interface CloudDraft { roll: StoredRoll; frames: DraftFrame[] }
export type UploadKind = 'viewing' | 'thumbnail';
export type UploadRequest = Record<UploadKind, { bytes: number; mime: 'image/jpeg'; sha256: string }>;
export interface UploadGrant {
  id: string; expiresAt: number;
  uploads: Record<UploadKind, { url: string; headers: Record<string, string> }>;
}
export interface PublishPending { pending: true; continuation: string }
export type PublishResult = GalleryRoll | PublishPending;
export interface WithdrawResult { withdrawn: boolean }
// Same-origin Worker routes; private responses and grants must always be no-store.
// GET /api/gallery -> GalleryCatalog
// GET /api/owner/session -> { email: string }
// POST /api/owner/uploads UploadRequest -> UploadGrant
// POST /api/owner/uploads/:id/complete -> { id: string } (verify grant metadata before use)
// GET /api/owner/drafts -> { drafts: CloudDraft[] }
// PUT /api/owner/drafts/:id CloudDraft -> CloudDraft
// GET /api/owner/drafts/:id -> CloudDraft
// GET /api/owner/uploads/:id/:kind -> private viewing/thumbnail bytes
// POST /api/owner/drafts/:id/publish { updatedAt: number; continuation?: string } -> PublishResult
// DELETE /api/owner/publications/:id -> { withdrawn: boolean } (repeat while false)
