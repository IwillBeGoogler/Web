import { useEffect, useState } from 'react';
import { GENERIC_ICONS } from './icons/generic';
import { ICON_REF, PACK_LOADERS } from './icons/index.generated';
import { PROVIDERS } from './cloud';
import { getCustomIcon } from './customIcons';
import { getCachedBrand, getRef, hasRef, loadIcon, registerIconPack, subscribePacks } from './icons/registry';

registerIconPack(ICON_REF, PACK_LOADERS);
// provider packs (AWS, GCP, ...): their refs also override legacy catalog ids with the official icon
for (const p of PROVIDERS) registerIconPack({ ...p.REFS, ...p.OVERRIDES }, p.LOADERS);

/** ids whose pack failed to load / lacks the icon: rendered as a neutral generic glyph, never blank. */
const failed = new Set<string>();
export const markIconFailed = (id: string): void => void failed.add(id);
export const isIconFailed = (id: string): boolean => failed.has(id);
export const resetFailedIcons = (): void => failed.clear();

/** Resolved icon, ready to render. `badge` is ONLY a fallback for unknown ids. */
export type IconDef =
  | { id: string; title: string; kind: 'brand'; viewBox: string; body: string }
  | { id: string; title: string; kind: 'generic'; hex: string; paths: string[] }
  | { id: string; title: string; kind: 'pending' }
  | { id: string; title: string; kind: 'fallback' }
  | { id: string; title: string; kind: 'asset'; src: string }
  | { id: string; title: string; kind: 'badge'; hex: string; initials: string };

/** Sync lookup. Brand icons come from lazily loaded packs: `pending` until loaded. */
export function getIcon(id: string | undefined): IconDef {
  if (id?.startsWith('asset:')) {
    const src = getCustomIcon(id.slice(6));
    return src ? { id, title: 'Custom icon', kind: 'asset', src } : { id, title: id, kind: 'fallback' };
  }
  if (id) {
    const ref = getRef(id);
    if (ref?.startsWith('g:')) {
      const g = GENERIC_ICONS[ref.slice(2)];
      if (g) return { id, title: g.title, kind: 'generic', hex: g.hex, paths: g.paths };
    } else if (ref) {
      const b = getCachedBrand(id);
      if (b) return { id, title: id, kind: 'brand', viewBox: b.viewBox, body: b.body };
      return failed.has(id) ? { id, title: id, kind: 'fallback' } : { id, title: id, kind: 'pending' };
    }
    const g = GENERIC_ICONS[id];
    if (g) return { id, title: g.title, kind: 'generic', hex: g.hex, paths: g.paths };
  }
  const label = id ?? '?';
  return { id: label, title: label, kind: 'badge', hex: '6B7280', initials: label.slice(0, 2).toUpperCase() };
}

/** Async: waits for the pack, then returns the final icon. */
export async function resolveIcon(id: string | undefined): Promise<IconDef> {
  if (id) await loadIcon(id);
  return getIcon(id);
}

export const hasIcon = (id: string): boolean => (id.startsWith('asset:') ? !!getCustomIcon(id.slice(6)) : hasRef(id) || id in GENERIC_ICONS);
export const isBrandIcon = (id: string): boolean => {
  const r = getRef(id);
  return !!r && !r.startsWith('g:');
};

/** React hook: returns the icon now, triggers lazy load and re-renders when ready. */
export function useIcon(id: string | undefined): IconDef {
  const [, tick] = useState(0);
  const icon = getIcon(id);
  const pending = icon.kind === 'pending';
  useEffect(() => {
    if (!pending || !id) return;
    let alive = true;
    void loadIcon(id)
      .then((b) => {
        if (!b) failed.add(id);
        if (alive) tick((n) => n + 1);
      })
      .catch(() => {
        failed.add(id);
        if (alive) tick((n) => n + 1);
      });
    const off = subscribePacks(() => alive && tick((n) => n + 1));
    return () => {
      alive = false;
      off();
    };
  }, [id, pending]);
  return icon;
}
