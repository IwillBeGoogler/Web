import { useFit } from '../hooks/useFit';
import { useResolvedSettings } from '../store/settingsStore';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useUiStore } from '../store/uiStore';
import { useDiagramStore } from '../store/diagramStore';
import { getMenuItems, type MenuItem } from '../lib/menu';
import { executeAction, type ProjectActions } from '../lib/actions';
import { useExport } from '../hooks/useExport';
import { t } from '../i18n';

export interface ContextMenuViewProps {
  x: number;
  y: number;
  items: MenuItem[];
  onRun: (id: string) => void;
  onClose: () => void;
}

/** Presentational menu: clamps to the viewport, closes on Esc / outside click / scroll, submenus open on hover. */
export function ContextMenuView({ x, y, items, onRun, onClose }: ContextMenuViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [openSub, setOpenSub] = useState<string[]>([]);

  useLayoutEffect(() => {
    // layout size, not getBoundingClientRect: the pop-in animation starts scaled down, which under-measured the menu
    // and let a long one run off the bottom of the screen
    const w = ref.current?.offsetWidth || 220;
    const h = ref.current?.offsetHeight || 300;
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - w - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - h - 4)),
    });
    setOpenSub([]);
  }, [x, y, items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('wheel', onClose, { passive: true, capture: true });
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('wheel', onClose, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const flip = pos.x > window.innerWidth - 460;
  /** a submenu opened low on the screen slides up so its last item stays visible */
  const keepOnScreen = (el: HTMLUListElement | null) => {
    if (!el) return;
    el.style.transform = '';
    const over = el.getBoundingClientRect().bottom - (window.innerHeight - 4);
    if (over > 0) el.style.transform = `translateY(${-Math.ceil(over)}px)`;
  };
  const render = (list: MenuItem[], depth: number, path: string[]) => (
    <ul role="menu" className={`ctx-list${depth ? ` ctx-sub${flip ? ' flip' : ''}` : ''}`} ref={depth ? keepOnScreen : undefined}>
      {list.map((it) =>
        it.separator ? (
          <li key={it.id} role="separator" className="ctx-sep" />
        ) : (
          <li key={it.id} role="none" className="ctx-li" onMouseEnter={() => setOpenSub(it.children ? [...path, it.id] : path)}>
            <button
              type="button"
              role="menuitem"
              disabled={it.disabled}
              aria-haspopup={it.children ? 'menu' : undefined}
              aria-expanded={it.children ? openSub.includes(it.id) : undefined}
              className={`ctx-item${it.danger ? ' danger' : ''}`}
              onClick={() => (it.children ? setOpenSub([...path, it.id]) : onRun(it.id))}
            >
              {it.swatch && <span className="ctx-swatch" style={{ background: it.swatch === 'transparent' ? undefined : it.swatch }} />}
              <span className="ctx-label">{t(it.label)}</span>
              {it.shortcut && <span className="ctx-shortcut">{it.shortcut}</span>}
              {it.children && <span className="ctx-arrow">›</span>}
            </button>
            {it.children && openSub.includes(it.id) && render(it.children, depth + 1, [...path, it.id])}
          </li>
        ),
      )}
    </ul>
  );

  return (
    <div ref={ref} className="ctx-menu" style={{ left: pos.x, top: pos.y }} data-testid="context-menu" onContextMenu={(e) => e.preventDefault()}>
      {render(items, 0, [])}
    </div>
  );
}

/** Editor context menu: builds items from the store and routes every action through executeAction (undoable). */
export function ContextMenu({ project }: { project?: ProjectActions }) {
  const menu = useUiStore((s) => s.menu);
  const close = useUiStore((s) => s.closeMenu);
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const clipboard = useDiagramStore((s) => s.clipboard);
  const styleClip = useDiagramStore((s) => s.styleClip);
  const pageCount = useDiagramStore((s) => s.pages.length);
  const userPresets = useResolvedSettings().edgePresets;
  const fit = useFit();
  const doExport = useExport();

  const items = useMemo(
    () => (menu ? getMenuItems(menu.target, { nodes, edges, hasClipboard: !!clipboard, hasStyleClip: !!styleClip, pageCount, userPresets }) : []),
    [menu, nodes, edges, clipboard, styleClip, pageCount, userPresets],
  );
  if (!menu) return null;
  const t = menu.target;
  const run = (id: string) => {
    executeAction(id, {
      nodeId: t.type === 'node' ? t.id : undefined,
      edgeId: t.type === 'edge' ? t.id : undefined,
      pageId: t.type === 'tab' ? t.id : undefined,
      projectId: t.type === 'project' ? t.id : undefined,
      at: menu.at,
      fitView: () => fit(200),
      exportImage: (k) => void doExport(k).catch(() => undefined),
      project,
    });
    close();
  };
  return <ContextMenuView x={menu.x} y={menu.y} items={items} onRun={run} onClose={close} />;
}
