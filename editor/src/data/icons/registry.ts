import type { BrandIcon } from './types';

/**
 * Generic icon-pack registry. A pack is a lazily imported module of { key: BrandIcon }.
 * refs map an icon id to 'g:<generic>' or '<pack>/<key>'. AWS / GCP / Azure packs register the same way.
 */
type Loader = () => Promise<{ default: Record<string, BrandIcon> }>;

const refs = new Map<string, string>();
const loaders = new Map<string, Loader>();
const loaded = new Map<string, Record<string, BrandIcon>>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

export function registerIconPack(r: Record<string, string>, l: Record<string, Loader>): void {
  for (const [k, v] of Object.entries(r)) refs.set(k, v);
  for (const [k, v] of Object.entries(l)) loaders.set(k, v);
}

export const getRef = (id: string): string | undefined => refs.get(id);
export const hasRef = (id: string): boolean => refs.has(id);
export const packNames = (): string[] => [...loaders.keys()];

export function getCachedBrand(id: string): BrandIcon | undefined {
  const ref = refs.get(id);
  if (!ref || ref.startsWith('g:')) return undefined;
  const [pack, key] = [ref.slice(0, ref.indexOf('/')), ref.slice(ref.indexOf('/') + 1)];
  return loaded.get(pack)?.[key];
}

export function loadPack(pack: string): Promise<Record<string, BrandIcon>> {
  const done = loaded.get(pack);
  if (done) return Promise.resolve(done);
  let p = inflight.get(pack);
  if (!p) {
    const loader = loaders.get(pack);
    if (!loader) return Promise.reject(new Error(`unknown icon pack ${pack}`));
    p = loader().then((m) => {
      loaded.set(pack, m.default);
      inflight.delete(pack);
      listeners.forEach((fn) => fn());
    });
    inflight.set(pack, p);
  }
  return p.then(() => loaded.get(pack)!);
}

/** Load the pack containing `id` (no-op for generic / unknown ids). */
export async function loadIcon(id: string): Promise<BrandIcon | undefined> {
  const ref = refs.get(id);
  if (!ref || ref.startsWith('g:')) return undefined;
  const pack = ref.slice(0, ref.indexOf('/'));
  const key = ref.slice(ref.indexOf('/') + 1);
  return (await loadPack(pack))[key];
}

export function subscribePacks(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
