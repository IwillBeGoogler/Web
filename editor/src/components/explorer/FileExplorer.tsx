import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowDownAZ, Clock, Copy, FilePlus, Pencil, Search, Star, Trash2, X } from 'lucide-react';
import type { MenuItem } from '../../lib/menu';
import { canEdit as roleCanEdit } from '../../lib/roles';
import { useWorkspace } from '../../workspace/store';
import { activateTab, deleteDialog, duplicateItem, newFileDialog, openFile, renameDialog, toggleStar } from '../../workspace/actions';
import type { EntryRef } from '../../workspace/types';
import { ContextMenuView } from '../ContextMenu';
import { colorFor } from '../sync/PresenceAvatars';
import { FileKindIcon, KIND_LABEL } from './FileIcon';
import { t } from '../../i18n';

export const SORT_KEY = 'sdd:files-sort';
export type FileSort = 'recent' | 'name';

function readSort(): FileSort {
  try {
    return localStorage.getItem(SORT_KEY) === 'name' ? 'name' : 'recent';
  } catch {
    return 'recent';
  }
}

function PresenceDots({ names }: { names: string[] | undefined }) {
  if (!names?.length) return null;
  return (
    <span className="ex-presence" data-testid="file-presence" title={t('Open now: {names}', { names: names.join(', ') })}>
      {names.slice(0, 3).map((n) => (
        <span key={n} className="ex-dot" style={{ background: colorFor(n) }} />
      ))}
    </span>
  );
}

/**
 * The files of the open project as ONE flat list (Project › Files; every file is a single canvas): search, sort by recent or name,
 * create, rename, duplicate, delete. Rendered inside the Files popover of the top bar.
 */
export function FileExplorer() {
  const tree = useWorkspace((s) => s.tree);
  const filter = useWorkspace((s) => s.filter);
  const focusId = useWorkspace((s) => s.focusId);
  const tabs = useWorkspace((s) => s.tabs);
  const starred = useWorkspace((s) => s.starred);
  const recent = useWorkspace((s) => s.recent);
  const presence = useWorkspace((s) => s.presenceByFile);
  const project = useWorkspace((s) => s.project);
  const setFilter = useWorkspace((s) => s.setFilter);
  const setFocus = useWorkspace((s) => s.setFocus);
  const canEdit = useWorkspace((s) => roleCanEdit(s.role));
  const [sort, setSort] = useState<FileSort>(readSort);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const rowEls = useRef(new Map<string, HTMLElement>());
  const q = filter.trim().toLowerCase();

  const rows = useMemo(() => {
    const list = tree.files.filter((f) => !q || f.name.toLowerCase().includes(q));
    if (sort === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const rank = (id: string) => {
      const i = recent.indexOf(id);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...list].sort((a, b) => rank(a.id) - rank(b.id) || b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
  }, [tree.files, q, sort, recent]);

  const chooseSort = (s: FileSort) => {
    setSort(s);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {
      /* ignore */
    }
  };
  const focusRow = useCallback(
    (id: string | null) => {
      setFocus(id);
      if (id) queueMicrotask(() => rowEls.current.get(id)?.focus());
    },
    [setFocus],
  );
  const activateOrOpen = (id: string) => (tabs.open.includes(id) ? activateTab(id) : openFile(id));
  const fileRef = (id: string): EntryRef => ({ kind: 'file', id });

  const run = (id: string, fileId: string) => {
    setMenu(null);
    switch (id) {
      case 'rename': return void renameDialog(fileRef(fileId));
      case 'duplicate': return duplicateItem(fileRef(fileId));
      case 'delete': return void deleteDialog(fileRef(fileId));
      case 'open': return activateOrOpen(fileId);
      case 'open-background': return openFile(fileId, { background: true });
      case 'star':
      case 'unstar': return toggleStar(fileId);
    }
  };
  const menuItems = (fileId: string): MenuItem[] => {
    const isOpen = tabs.open.includes(fileId);
    const open: MenuItem[] = [
      { id: 'open', label: isOpen ? t('Go to tab') : t('Open'), shortcut: 'Enter' },
      ...(isOpen ? [] : [{ id: 'open-background', label: t('Open in background tab') }]),
      { id: starred.includes(fileId) ? 'unstar' : 'star', label: starred.includes(fileId) ? t('Remove from starred') : t('Add to starred') },
    ];
    return canEdit
      ? [...open, { id: 'sep1', label: '', separator: true }, { id: 'rename', label: t('Rename…'), shortcut: 'F2' }, { id: 'duplicate', label: t('Duplicate') }, { id: 'sep2', label: '', separator: true }, { id: 'delete', label: t('Delete…'), shortcut: 'Del', danger: true }]
      : open;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') {
      e.stopPropagation(); // nothing typed here may reach the canvas shortcuts
      if (e.key === 'Escape' && filter) {
        e.stopPropagation();
        setFilter('');
        focusRow(rows[0]?.id ?? null);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusRow(rows[0]?.id ?? null);
      }
      return;
    }
    if (e.metaKey || e.ctrlKey) return;
    e.stopPropagation();
    const i = rows.findIndex((r) => r.id === focusId);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, (i < 0 ? 0 : i) + (e.key === 'ArrowDown' ? 1 : -1)));
      focusRow(rows[next]?.id ?? null);
    } else if (e.key === 'Enter' && i >= 0) {
      e.preventDefault();
      activateOrOpen(rows[i].id);
    } else if (e.key === ' ' && i >= 0) {
      e.preventDefault();
      openFile(rows[i].id, { background: true });
    } else if (e.key === 'F2' && i >= 0 && canEdit) {
      e.preventDefault();
      void renameDialog(fileRef(rows[i].id));
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && i >= 0 && canEdit) {
      e.preventDefault();
      void deleteDialog(fileRef(rows[i].id));
    } else if (e.key === 'ContextMenu' && i >= 0) {
      e.preventDefault();
      const r = rowEls.current.get(rows[i].id)?.getBoundingClientRect();
      setMenu({ x: (r?.left ?? 0) + 40, y: r?.bottom ?? 0, id: rows[i].id });
    }
  };

  return (
    <section className="explorer" aria-label={t('Files')} onKeyDown={onKeyDown}>
      <header className="ex-head">
        <strong className="ex-title" title={project?.name}>{project?.name ?? t('Files')}</strong>
        <span className="ex-count muted">{tree.files.length}</span>
        <span className="spacer" />
        <div className="seg ex-sort" role="group" aria-label={t('Sort files')}>
          <button type="button" className={sort === 'recent' ? 'active' : ''} aria-pressed={sort === 'recent'} title={t('Most recently opened first')} onClick={() => chooseSort('recent')}><Clock size={12} aria-hidden /> {t('Recent')}</button>
          <button type="button" className={sort === 'name' ? 'active' : ''} aria-pressed={sort === 'name'} title={t('A to Z')} onClick={() => chooseSort('name')}><ArrowDownAZ size={12} aria-hidden /> {t('Name')}</button>
        </div>
        {canEdit && (
          <button type="button" className="btn btn-icon btn-ghost" aria-label={t('New file')} title={t('New file')} onClick={() => void newFileDialog(null)}><FilePlus size={15} aria-hidden /></button>
        )}
      </header>
      <div className="ex-search">
        <Search size={13} aria-hidden />
        <input type="search" placeholder={t('Search files…')} aria-label={t('Filter files')} value={filter} onChange={(e) => setFilter(e.target.value)} />
        {q && <button type="button" className="ex-clear" aria-label={t('Clear filter')} onClick={() => setFilter('')}><X size={12} aria-hidden /></button>}
      </div>
      <div className="ex-scroll">
        <div role="tree" aria-label={t('Project files')} className="ex-tree" onContextMenu={(e) => e.preventDefault()}>
          {rows.map((f) => {
            const active = tabs.active === f.id;
            const open = tabs.open.includes(f.id);
            return (
              <div
                key={f.id}
                ref={(el) => {
                  if (el) rowEls.current.set(f.id, el);
                  else rowEls.current.delete(f.id);
                }}
                role="treeitem"
                aria-level={1}
                aria-selected={active}
                data-id={f.id}
                data-kind="file"
                data-testid={`ex-file-${f.name}`}
                tabIndex={focusId === f.id || (!focusId && rows[0]?.id === f.id) ? 0 : -1}
                className={`ex-row${active ? ' active' : ''}${open ? ' open' : ''}${focusId === f.id ? ' focused' : ''}`}
                onClick={() => {
                  setFocus(f.id);
                  activateOrOpen(f.id);
                }}
                onFocus={() => focusId !== f.id && setFocus(f.id)}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  setFocus(f.id);
                  setMenu({ x: ev.clientX, y: ev.clientY, id: f.id });
                }}
              >
                <FileKindIcon kind={f.kind} />
                <span className="ex-name" title={`${f.name} · ${t(KIND_LABEL[f.kind])}`}>{f.name}</span>
                <PresenceDots names={presence[f.id]} />
                <span className="ex-actions">
                  {canEdit && (
                    <>
                      <button type="button" tabIndex={-1} className="ex-act" aria-label={t('Rename {name}', { name: f.name })} title={t('Rename')} onClick={(ev) => { ev.stopPropagation(); void renameDialog(fileRef(f.id)); }}><Pencil size={12} aria-hidden /></button>
                      <button type="button" tabIndex={-1} className="ex-act" aria-label={t('Duplicate {name}', { name: f.name })} title={t('Duplicate')} onClick={(ev) => { ev.stopPropagation(); duplicateItem(fileRef(f.id)); }}><Copy size={12} aria-hidden /></button>
                      <button type="button" tabIndex={-1} className="ex-act" aria-label={t('Delete {name}', { name: f.name })} title={t('Delete')} onClick={(ev) => { ev.stopPropagation(); void deleteDialog(fileRef(f.id)); }}><Trash2 size={12} aria-hidden /></button>
                    </>
                  )}
                  <button type="button" tabIndex={-1} className={`ex-star${starred.includes(f.id) ? ' on' : ''}`} aria-label={starred.includes(f.id) ? t('Unstar {name}', { name: f.name }) : t('Star {name}', { name: f.name })} aria-pressed={starred.includes(f.id)} onClick={(ev) => { ev.stopPropagation(); toggleStar(f.id); }}><Star size={13} aria-hidden /></button>
                </span>
              </div>
            );
          })}
          {rows.length === 0 && <p className="ex-empty muted">{q ? t('No files match “{q}”.', { q: filter.trim() }) : canEdit ? t('No files yet. Create one with the button above.') : t('This project has no files.')}</p>}
        </div>
      </div>
      {menu && <ContextMenuView x={menu.x} y={menu.y} items={menuItems(menu.id)} onClose={() => setMenu(null)} onRun={(id) => run(id, menu.id)} />}
    </section>
  );
}
