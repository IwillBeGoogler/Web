/** Open-tab state of one project (pure). Tabs are file ids. */
export interface TabsState {
  open: string[];
  active: string | null;
  /** most recently closed first (⌘⇧T reopens the first) */
  closed: string[];
}
export const emptyTabs = (): TabsState => ({ open: [], active: null, closed: [] });
const MAX_CLOSED = 20;

/** open (or just activate) a tab. `after` places a new tab next to an existing one (default: the end). */
export function openTab(s: TabsState, id: string, o: { after?: string | null; activate?: boolean } = {}): TabsState {
  const closed = s.closed.filter((c) => c !== id);
  if (s.open.includes(id)) return { ...s, closed, active: o.activate === false ? s.active : id };
  const at = o.after && s.open.includes(o.after) ? s.open.indexOf(o.after) + 1 : s.open.length;
  const open = [...s.open.slice(0, at), id, ...s.open.slice(at)];
  return { open, closed, active: o.activate === false ? s.active : id };
}

/** close a tab; if it was active the neighbour to the right (else left) becomes active */
export function closeTab(s: TabsState, id: string): TabsState {
  const i = s.open.indexOf(id);
  if (i < 0) return s;
  const open = s.open.filter((x) => x !== id);
  const active = s.active === id ? (open[i] ?? open[i - 1] ?? null) : s.active;
  return { open, active, closed: [id, ...s.closed.filter((c) => c !== id)].slice(0, MAX_CLOSED) };
}

export function closeOthers(s: TabsState, id: string): TabsState {
  if (!s.open.includes(id)) return s;
  return { open: [id], active: id, closed: [...s.open.filter((x) => x !== id).reverse(), ...s.closed].slice(0, MAX_CLOSED) };
}

/** move a tab so it ends up at `toIndex` of the resulting list */
export function reorderTab(s: TabsState, id: string, toIndex: number): TabsState {
  const from = s.open.indexOf(id);
  if (from < 0) return s;
  const rest = s.open.filter((x) => x !== id);
  const at = Math.max(0, Math.min(toIndex, rest.length));
  if (at === from) return s;
  return { ...s, open: [...rest.slice(0, at), id, ...rest.slice(at)] };
}

/** ⌘⇧T: bring back the most recently closed tab that still exists */
export function reopenClosed(s: TabsState, exists: (id: string) => boolean): { state: TabsState; id: string | null } {
  const id = s.closed.find(exists) ?? null;
  if (!id) return { state: { ...s, closed: s.closed.filter(exists) }, id: null };
  return { state: openTab({ ...s, closed: s.closed.filter((c) => c !== id) }, id), id };
}

/** drop tabs of deleted files; keep a valid active tab */
export function pruneTabs(s: TabsState, exists: (id: string) => boolean): TabsState {
  const open = s.open.filter(exists);
  const active = s.active && open.includes(s.active) ? s.active : (open[open.length - 1] ?? null);
  return { open, active, closed: s.closed.filter(exists) };
}

/** next/previous tab (⌃Tab style) */
export function cycleTab(s: TabsState, dir: 1 | -1): string | null {
  if (!s.open.length) return null;
  const i = s.active ? s.open.indexOf(s.active) : -1;
  return s.open[(i + dir + s.open.length) % s.open.length];
}

export function parseTabs(raw: unknown): TabsState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<TabsState>;
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const open = [...new Set(strs(r.open))];
  return { open, active: typeof r.active === 'string' && open.includes(r.active) ? r.active : (open[0] ?? null), closed: strs(r.closed).slice(0, MAX_CLOSED) };
}
