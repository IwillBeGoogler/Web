import { useEffect, useRef } from 'react';
import { FolderTree } from 'lucide-react';
import { useWorkspace } from '../workspace/store';
import { FileExplorer } from './explorer/FileExplorer';
import { t } from '../i18n';

/**
 * File navigation in the top bar: a button next to the project name that opens a compact popover with the whole file explorer
 * (create file / folder, rename, drag and drop, delete, filter, starred / recent). Esc or a click outside closes it; opening a file closes it.
 */
export function FilesPopover() {
  const open = useWorkspace((s) => s.filesOpen);
  const setOpen = useWorkspace((s) => s.setFilesOpen);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || root.current?.contains(t)) return;
      if (t.closest('[role="menu"], [role="dialog"], [role="alertdialog"], .ctx-menu, .dialog-backdrop, .modal-backdrop')) return; // the explorer's own menus / dialogs
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if ([...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"]')].some((el) => !root.current?.contains(el))) return; // an explorer dialog / menu is on top: it takes the Esc
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return (
    <div className="menu files-menu" ref={root}>
      <button type="button" className="btn btn-icon btn-ghost files-btn" aria-label={t('Switch file')} title={t('Files (⌘P to go to a file)')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <FolderTree size={16} aria-hidden />
      </button>
      {open && (
        <div
          className="files-pop"
          role="dialog"
          aria-label={t('Project files')}
          data-testid="files-popover"
          onClick={(e) => {
            const row = (e.target as HTMLElement).closest('[role="treeitem"]');
            if (row && !(e.target as HTMLElement).closest('button')) setOpen(false); // a file row (bubble phase: the row's own handler has already opened the file)
          }}
        >
          <FileExplorer />
        </div>
      )}
    </div>
  );
}
