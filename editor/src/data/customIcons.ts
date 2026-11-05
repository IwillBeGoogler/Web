import { apiClient } from '../api/api';
import type { ProjectAsset } from '../types';

/** Uploaded icons (from project assets), keyed by sha256: rendered as <img data:...>. */
const icons = new Map<string, string>();
export const dataUri = (a: ProjectAsset): string => `data:${a.mime};base64,${a.data ?? ''}`;
/** where a stored (data-less) asset is served: the host's asset store. Always rendered through <img src>, never inlined as markup. */
export const assetUrl = (hash: string): string => apiClient.url(`/assets/${hash}`);
export function registerCustomIcons(assets: Record<string, ProjectAsset> | undefined): void {
  for (const [hash, a] of Object.entries(assets ?? {})) icons.set(hash, a.data === undefined ? assetUrl(hash) : dataUri(a));
}
export const getCustomIcon = (hash: string): string | undefined => icons.get(hash);
export const clearCustomIcons = (): void => icons.clear();
