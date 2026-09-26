import type { R2Bucket } from '@cloudflare/workers-types';
import type { CloudDraft, GalleryRoll, UploadRequest } from '../src/cloud/contracts';

export interface Env {
  PRIVATE_BUCKET: R2Bucket;
  PUBLIC_BUCKET: R2Bucket;
  APP_ORIGIN: string;
  PHOTO_ORIGIN: string;
  ACCESS_ISSUER: string;
  ACCESS_AUDIENCE: string;
  OWNER_EMAIL: string;
  R2_ACCOUNT_ID: string;
  PRIVATE_BUCKET_NAME: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}
export const kinds = ['viewing', 'thumbnail'] as const;
export type Kind = typeof kinds[number];
export interface ImageRecord { key: string; bytes: number; sha256: string; mime: 'image/jpeg' }
export interface PendingUpload { id: string; expiresAt: number; request: UploadRequest }
export interface CompletedUpload { id: string; images: Record<Kind, ImageRecord> }
export interface DraftHead { snapshot: string }
export interface CatalogState {
  catalogKey: string | null;
  withdrawals: Record<string, { generation: number; token: string; nextGeneration?: number }>;
  generations: Record<string, number>;
  revision: string;
}
export interface PendingPublication {
  id: string; revision: string; snapshot: string; updatedAt: number;
  catalogEtag?: string; catalogKey: string | null; generation: number; nextFrame: number;
  publication: GalleryRoll; cleanup?: boolean;
}
export interface DraftSnapshot { draft: CloudDraft }
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new HttpError(400, message);
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validId(value: unknown): value is string { return typeof value === 'string' && uuidPattern.test(value); }
export async function hash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
