import { t } from '../i18n';
/** anything listed on the home page: a project (or a legacy file entry) */
export interface Listed {
  name: string;
  updatedAt: number;
}

export type SortKey = 'updated' | 'name';

/** "just now", "5m ago", "3h ago", "2d ago", "3w ago", then a date. */
export function formatRelative(ts: number, now = Date.now()): string {
  const d = Math.max(0, now - ts);
  const min = Math.floor(d / 60000);
  if (min < 1) return t('just now');
  if (min < 60) return t('{n}m ago', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t('{n}h ago', { n: h });
  const days = Math.floor(h / 24);
  if (days < 7) return t('{n}d ago', { n: days });
  if (days < 30) return t('{n}w ago', { n: Math.floor(days / 7) });
  return new Date(ts).toLocaleDateString();
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return t('Working late');
  if (h < 12) return t('Good morning');
  if (h < 18) return t('Good afternoon');
  return t('Good evening');
}

export function filterProjects<T extends Listed>(list: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const terms = q.split(/\s+/);
  return list.filter((p) => terms.every((t) => p.name.toLowerCase().includes(t)));
}

/** Stable sort: newest first for 'updated', A-Z (natural, case-insensitive) for 'name'. */
export function sortProjects<T extends Listed>(list: T[], key: SortKey): T[] {
  const out = [...list];
  if (key === 'name') out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) || b.updatedAt - a.updatedAt);
  else out.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
  return out;
}
