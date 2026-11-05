import type { MenuItem } from '../lib/menu';
import type { EntryRef } from './types';

export interface ExplorerMenuCtx {
  canEdit: boolean;
  starred: boolean;
  /** file is already open in a tab */
  isOpen: boolean;
}
const it = (id: string, label: string, extra: Partial<MenuItem> = {}): MenuItem => ({ id, label, ...extra });
let n = 0;
const sep = (): MenuItem => ({ id: `xsep-${++n}`, label: '', separator: true });

/** Context-menu items of an explorer row (ref) or of the empty area (null). Ids are handled by FileExplorer. */
export function explorerMenu(ref: EntryRef | null, c: ExplorerMenuCtx): MenuItem[] {
  if (!ref) return c.canEdit ? [it('new-file', 'New file…'), it('new-folder', 'New folder…')] : [];
  if (ref.kind === 'folder') {
    return c.canEdit
      ? [it('new-file', 'New file…'), it('new-folder', 'New folder…'), sep(), it('rename', 'Rename…', { shortcut: 'F2' }), it('duplicate', 'Duplicate'), sep(), it('delete', 'Delete…', { shortcut: 'Del', danger: true })]
      : [];
  }
  const open = [it('open', c.isOpen ? 'Go to tab' : 'Open', { shortcut: 'Enter' }), ...(c.isOpen ? [] : [it('open-background', 'Open in background tab')]), it(c.starred ? 'unstar' : 'star', c.starred ? 'Remove from starred' : 'Add to starred')];
  return c.canEdit ? [...open, sep(), it('rename', 'Rename…', { shortcut: 'F2' }), it('duplicate', 'Duplicate'), sep(), it('delete', 'Delete…', { shortcut: 'Del', danger: true })] : open;
}

/** context menu of a tab */
export function tabMenu(c: { canEdit: boolean; starred: boolean; count: number }): MenuItem[] {
  return [
    it('close', 'Close', { shortcut: '⌘W' }),
    it('close-others', 'Close others', { disabled: c.count < 2 }),
    sep(),
    it('reveal', 'Show in file list'),
    it(c.starred ? 'unstar' : 'star', c.starred ? 'Remove from starred' : 'Add to starred'),
    ...(c.canEdit ? [it('rename', 'Rename…', { shortcut: 'F2' })] : []),
  ];
}
