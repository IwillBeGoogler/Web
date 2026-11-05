import { useEffect, useRef, useState } from 'react';
import { Ellipsis, X } from 'lucide-react';
import { canEdit as roleCanEdit } from '../lib/roles';
import { usePendingSave } from '../hooks/useProjectPersistence';
import { tabMenu } from '../workspace/menu';
import { activateTab, closeFileTab, closeOtherTabs, expandTo, moveTab, renameDialog, reopenLastClosed, toggleStar } from '../workspace/actions';
import { useWorkspace } from '../workspace/store';
import { useFileStore } from '../store/fileStore';
import { useSyncStore } from '../sync/status';
import { getMeta } from '../sync/meta';
import { ContextMenuView } from './ContextMenu';
import { FileKindIcon } from './explorer/FileIcon';
import type { MenuItem } from '../lib/menu';
import { t } from '../i18n';

const TAB_MIME = 'application/x-sdd-tab';

/** files with changes that are not safe yet: local edits not written, a server upload pending, or an unsaved .sdd file */
export function useDirtyFiles(): Set<string> {
  const open = useWorkspace((s) => s.tabs.open);
  const active = useWorkspace((s) => s.tabs.active);
  const pending = usePendingSave((s) => s.pending);
  const fileDirty = useFileStore((s) => s.dirty && s.fileName !== null);
  useSyncStore((s) => s.queued + s.status); // re-render when the sync state moves
  const out = new Set<string>();
  for (const id of open) {
    if (getMeta(localStorage, id)?.dirty) out.add(id);
    if (id === active && (pending || fileDirty)) out.add(id);
  }
  return out;
}

/** The open files of the project as tabs: middle-click / ✕ / ⌘W close, drag to reorder, overflow scroll with a "…" list, dirty dot. */
export function FileTabs() {
  const tabs = useWorkspace((s) => s.tabs);
  const tree = useWorkspace((s) => s.tree);
  const starred = useWorkspace((s) => s.starred);
  const canEdit = useWorkspace((s) => roleCanEdit(s.role));
  const dirty = useDirtyFiles();
  const strip = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);
  const [over, setOver] = useState<{ id: string; side: 'before' | 'after' } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: 'tab'; id: string } | { x: number; y: number; kind: 'list' } | null>(null);
  const [overflow, setOverflow] = useState(false);

  // keep the active tab visible
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [tabs.active, tabs.open.length]);
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.open.length]);

  const file = (id: string) => tree.files.find((f) => f.id === id);
  const tabItems = tabs.open.map(file).filter((f): f is NonNullable<typeof f> => !!f);

  const dropAt = (target: string, side: 'before' | 'after') => {
    const id = dragId.current;
    dragId.current = null;
    setOver(null);
    if (!id || id === target) return;
    const rest = tabs.open.filter((x) => x !== id);
    const at = rest.indexOf(target) + (side === 'after' ? 1 : 0);
    moveTab(id, at);
  };

  const items: MenuItem[] =
    menu?.kind === 'tab'
      ? tabMenu({ canEdit, starred: starred.includes(menu.id), count: tabs.open.length })
      : menu?.kind === 'list'
        ? [
            ...tabItems.map((f) => ({ id: `go:${f.id}`, label: `${tabs.active === f.id ? '● ' : ''}${f.name}` })),
            { id: 'sep', label: '', separator: true },
            { id: 'reopen', label: 'Reopen closed tab', shortcut: '⌘⇧T', disabled: tabs.closed.length === 0 },
          ]
        : [];
  const runMenu = (id: string) => {
    const m = menu;
    setMenu(null);
    if (!m) return;
    if (m.kind === 'list') {
      if (id === 'reopen') reopenLastClosed();
      else if (id.startsWith('go:')) activateTab(id.slice(3));
      return;
    }
    if (id === 'close') closeFileTab(m.id);
    else if (id === 'close-others') closeOtherTabs(m.id);
    else if (id === 'reveal') {
      expandTo({ kind: 'file', id: m.id });
      useWorkspace.getState().setFilesOpen(true);
      useWorkspace.getState().setFocus(m.id);
    } else if (id === 'star' || id === 'unstar') toggleStar(m.id);
    else if (id === 'rename') void renameDialog({ kind: 'file', id: m.id });
  };

  if (tabs.open.length < 2) return null; // one open file: its name is in the breadcrumb, no tab bar
  return (
    <div className="file-tabs" data-testid="file-tabs">
      <div ref={strip} className="ft-strip" role="tablist" aria-label={t('Open files')} onDragOver={(e) => dragId.current && e.preventDefault()}>
        {tabItems.map((f) => {
          const active = tabs.active === f.id;
          const isDirty = dirty.has(f.id);
          const o = over?.id === f.id ? ` drop-${over.side}` : '';
          return (
            <div
              key={f.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-id={f.id}
              data-testid={`ftab-${f.name}`}
              className={`ft-tab${active ? ' active' : ''}${isDirty ? ' dirty' : ''}${o}`}
              title={f.name}
              draggable
              onDragStart={(e) => {
                dragId.current = f.id;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData(TAB_MIME, f.id);
              }}
              onDragEnd={() => {
                dragId.current = null;
                setOver(null);
              }}
              onDragOver={(e) => {
                if (!dragId.current || dragId.current === f.id) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const side = e.clientX - r.left < r.width / 2 ? 'before' : 'after';
                setOver((cur) => (cur?.id === f.id && cur.side === side ? cur : { id: f.id, side }));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                dropAt(f.id, e.clientX - r.left < r.width / 2 ? 'before' : 'after');
              }}
              onMouseDown={(e) => e.button === 1 && e.preventDefault()} // no autoscroll cursor on middle-click
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  closeFileTab(f.id);
                }
              }}
              onClick={() => activateTab(f.id)}
              onDoubleClick={() => canEdit && void renameDialog({ kind: 'file', id: f.id })}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  activateTab(f.id);
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  const i = tabs.open.indexOf(f.id) + (e.key === 'ArrowRight' ? 1 : -1);
                  const next = tabs.open[(i + tabs.open.length) % tabs.open.length];
                  if (next) activateTab(next);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, kind: 'tab', id: f.id });
              }}
            >
              <FileKindIcon kind={f.kind} size={13} />
              <span className="ft-name">{f.name}</span>
              {isDirty && <span className="ft-dirty" role="status" aria-label={t('Unsaved changes')} title={t('Unsaved changes')} />}
              <button
                type="button"
                className="ft-close"
                tabIndex={-1}
                aria-label={t('Close {name}', { name: f.name })}
                title={t('Close (⌘W)')}
                onClick={(e) => {
                  e.stopPropagation();
                  closeFileTab(f.id);
                }}
              >
                <X size={12} aria-hidden />
              </button>
            </div>
          );
        })}
        {tabItems.length === 0 && <span className="ft-empty muted">{t('No open files')}</span>}
      </div>
      <button
        type="button"
        className={`btn btn-icon btn-ghost ft-more${overflow ? ' needed' : ''}`}
        aria-label={t('Open files list')}
        aria-haspopup="menu"
        title={t('All open files')}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.right - 200, y: r.bottom + 4, kind: 'list' });
        }}
      >
        <Ellipsis size={15} aria-hidden />
      </button>
      {menu && <ContextMenuView x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} onRun={runMenu} />}
    </div>
  );
}
