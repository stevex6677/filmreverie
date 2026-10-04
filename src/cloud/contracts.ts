import type { StoredRoll, StoredFrame } from '../storage/rollRepository';
import type { OperationProgress } from '../utils/operationProgress';

// Public records deliberately omit source names, hashes, original keys and saved private views.
export interface GalleryImage { url: string; bytes: number; sha256: string }
export interface GalleryFrame {
  id: string; width: number; height: number; rotation: number;
  /** Absent from rolls published before frames recorded which way is up. */
  uprightRotation?: number;
  cropPosition?: { x: number; y: number };
  filmStrength?: number;
  viewing: GalleryImage; thumbnail: GalleryImage;
}
export interface GalleryRoll {
  camera?: string;
  id: string; revision: string; name: string; stockId: StoredRoll['stockId'];
  format: StoredRoll['format']; sizing?: StoredRoll['sizing']; filmStrength?: number;
  framesPerStrip?: number;
  coverId: string; frames: GalleryFrame[]; publishedAt: number;
  /** The owner's cubby; absent until the owner arranges the shelf. */
  shelfSlot?: number;
}
export interface GalleryCatalog { version: 1; rolls: GalleryRoll[] }
// Cloud drafts contain only browser-produced derivatives; guest StoredFrame retains its original fields.
export interface DraftFrame extends Pick<StoredFrame, 'id' | 'rollId' | 'filename' | 'width' | 'height' | 'rotation' | 'uprightRotation' | 'cropPosition' | 'filmStrength' | 'viewingKey' | 'thumbnailKey'> {
  uploadId: string;
  viewingSha256: string;
}
export interface CloudDraft { roll: StoredRoll; frames: DraftFrame[] }
// Normal edits finish in one request. Only unusually large image copies/cleanup
// need a continuation; the same mutation ID makes an interrupted save retryable.
export interface SaveRollRequest extends CloudDraft { mutationId: string; continuation?: string }
export interface PatchRollRequest {
  mutationId: string; updatedAt: number; changes: Partial<StoredRoll>; continuation?: string;
}
export interface RollMutationResult { draft: CloudDraft; pending?: true; continuation?: string }
export type RollMutationEvent = { progress: OperationProgress } | { result: RollMutationResult } | { error: string };
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
// PUT /api/owner/rolls/:id SaveRollRequest -> RollMutationResult (save and publish)
// PATCH /api/owner/rolls/:id PatchRollRequest -> RollMutationResult (edit, trash/restore, or private view)
// GET /api/owner/session -> { email: string }
// POST /api/owner/uploads UploadRequest -> UploadGrant
// POST /api/owner/uploads/:id/complete -> { id: string } (verify grant metadata before use)
// GET /api/owner/drafts -> { drafts: CloudDraft[] }
// PUT /api/owner/drafts/:id CloudDraft -> CloudDraft
// GET /api/owner/drafts/:id -> CloudDraft
// GET /api/owner/uploads/:id/:kind -> private viewing/thumbnail bytes
// GET /api/owner/preferences -> DarkroomPreferences
// PUT /api/owner/preferences DarkroomPreferences -> DarkroomPreferences
// PUT /api/owner/shelf { slots: Record<rollId, shelfSlot> } -> same (also places published rolls)
// POST /api/owner/drafts/:id/publish { updatedAt: number; continuation?: string } -> PublishResult
// DELETE /api/owner/publications/:id -> { withdrawn: boolean } (repeat while false)
