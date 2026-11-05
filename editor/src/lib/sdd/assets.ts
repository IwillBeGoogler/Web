import type { ProjectAsset } from '../../types';
import { sha256Hex } from './sha256';

export const MAX_ICON_BYTES = 512 * 1024;
const ALL_MIMES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
let allowed = ALL_MIMES;
/** a host backend may take fewer types; `null` = the standalone default */
export const setAllowedIconMimes = (m: readonly string[] | null): void => {
  allowed = m ?? ALL_MIMES;
};
export const allowedIconMimes = (): readonly string[] => allowed;
export const isAllowedIconMime = (m: string): boolean => allowed.includes(m);
const NAMES: Record<string, string> = { 'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP', 'image/gif': 'GIF', 'image/svg+xml': 'SVG' };
const listTypes = (): string => {
  const n = allowed.map((m) => NAMES[m] ?? m);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} or ${n[n.length - 1]}` : (n[0] ?? 'an image');
};

export function assetFromBytes(bytes: Uint8Array, mime: string): { hash: string; asset: ProjectAsset } {
  if (!isAllowedIconMime(mime)) {
    if (mime === 'image/svg+xml') throw new Error(`SVG images are not supported here (they can carry scripts). Use ${listTypes()}.`);
    throw new Error(`Unsupported image type "${mime}" (use ${listTypes()})`);
  }
  if (bytes.length > MAX_ICON_BYTES) throw new Error(`Image is too large (limit ${MAX_ICON_BYTES / 1024} KB)`);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { hash: sha256Hex(bytes), asset: { mime, data: btoa(s) } };
}

export interface StoredAsset { hash: string; mime: string }
export type AssetUploader = (bytes: Uint8Array, mime: string) => Promise<StoredAsset>;
let uploader: AssetUploader | null = null;
/** embedded: the host's asset store takes the bytes (so documents hold no data URIs); `null` = inline base64, the standalone way */
export const setAssetUploader = (u: AssetUploader | null): void => {
  uploader = u;
};
export const hasAssetUploader = (): boolean => uploader !== null;

/**
 * Validate and keep an image. Standalone: inline base64 under the sha256 of the bytes. Embedded: uploaded, and the document
 * keeps only `{ mime }` under the hash the server returns (it can differ from the bytes' own hash: an SVG is sanitized first).
 */
export async function storeImage(bytes: Uint8Array, mime: string): Promise<{ hash: string; asset: ProjectAsset }> {
  const local = assetFromBytes(bytes, mime);
  if (!uploader) return local;
  const r = await uploader(bytes, mime);
  return { hash: r.hash, asset: { mime: r.mime } };
}
