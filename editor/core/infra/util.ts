import { slugId } from '../graph';

export const slug = (s: string): string => slugId(s, 'x');

/** host names that appear in connection strings / URLs inside a value: `http://api:8080`, `postgres://u@db/x`, `cache:6379`, `api.ns.svc.cluster.local` */
export function urlHosts(value: string): string[] {
  const out: string[] = [];
  for (const m of value.matchAll(/[a-z][a-z0-9+.-]*:\/\/(?:[^@\s/]*@)?([A-Za-z0-9._-]+)/gi)) out.push(m[1]);
  for (const m of value.matchAll(/(?:^|[\s,;=])([A-Za-z0-9][A-Za-z0-9._-]*):(\d{2,5})(?=$|[\s,;/])/g)) out.push(m[1]);
  return [...new Set(out)];
}

/** `ghcr.io/acme/web:1.4.2@sha256:..` -> `web` */
export function imageBase(image: string): string {
  return image.replace(/@.*$/, '').replace(/:[^/:]*$/, '').split('/').pop()!.toLowerCase();
}

/** merge edges with the same endpoints: labels are joined, self loops and unknown ends dropped */
export function dedupeEdges<T extends { from: string; to: string; label?: string }>(edges: T[], known?: Set<string>): T[] {
  const map = new Map<string, T>();
  for (const e of edges) {
    if (e.from === e.to) continue;
    if (known && (!known.has(e.from) || !known.has(e.to))) continue;
    const k = `${e.from}\u0000${e.to}`;
    const prev = map.get(k);
    if (!prev) map.set(k, { ...e });
    else if (e.label && !(prev.label ?? '').split(', ').includes(e.label)) prev.label = prev.label ? `${prev.label}, ${e.label}` : e.label;
  }
  return [...map.values()];
}
