import type { Row } from './tree';

export type NavKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End' | 'Enter';
export interface NavResult {
  /** row id (entry id) to focus */
  focus: string | null;
  /** folder to expand (true) or collapse (false) */
  toggle?: { id: string; open: boolean };
  /** open this file */
  open?: string;
}

/** VS Code-style tree keyboard behaviour over the visible rows. */
export function navigate(rows: Row[], focusedId: string | null, key: NavKey): NavResult {
  if (!rows.length) return { focus: null };
  const i = focusedId ? rows.findIndex((r) => r.ref.id === focusedId) : -1;
  const cur = i >= 0 ? rows[i] : null;
  const at = (n: number) => rows[Math.max(0, Math.min(rows.length - 1, n))].ref.id;
  switch (key) {
    case 'ArrowDown':
      return { focus: at(i < 0 ? 0 : i + 1) };
    case 'ArrowUp':
      return { focus: at(i < 0 ? rows.length - 1 : i - 1) };
    case 'Home':
      return { focus: rows[0].ref.id };
    case 'End':
      return { focus: rows[rows.length - 1].ref.id };
    case 'ArrowRight':
      if (!cur) return { focus: at(0) };
      if (cur.ref.kind === 'folder') {
        if (!cur.expanded) return { focus: cur.ref.id, toggle: { id: cur.ref.id, open: true } };
        return { focus: rows[i + 1] && rows[i + 1].parentId === cur.ref.id ? rows[i + 1].ref.id : cur.ref.id };
      }
      return { focus: cur.ref.id };
    case 'ArrowLeft':
      if (!cur) return { focus: at(0) };
      if (cur.ref.kind === 'folder' && cur.expanded) return { focus: cur.ref.id, toggle: { id: cur.ref.id, open: false } };
      return { focus: cur.parentId ?? cur.ref.id };
    case 'Enter':
      if (!cur) return { focus: null };
      if (cur.ref.kind === 'file') return { focus: cur.ref.id, open: cur.ref.id };
      return { focus: cur.ref.id, toggle: { id: cur.ref.id, open: !cur.expanded } };
  }
}
