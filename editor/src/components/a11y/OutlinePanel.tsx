import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { useLayoutStore } from '../../store/layoutStore';
import { buildOutline, type OutlineNode } from '../../lib/a11y/outline';
import { focusNode } from '../../lib/a11y/keyboard';
import { zoomToNode } from '../../lib/design/actions';
import { t } from '../../i18n';

/**
 * Screen-reader outline: the diagram as a tree (pages > nodes > connections), the text alternative to the canvas. Hidden by
 * default; Shift+O, the View menu or ⌘K "Outline" toggles it. Activating an item selects it on the canvas (switching page first).
 */
export function OutlinePanel() {
  const open = useUiStore((s) => s.outlineOpen);
  const setDesign = useUiStore((s) => s.setDesign);
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const pages = useDiagramStore((s) => s.pages);
  const activePageId = useDiagramStore((s) => s.activePageId);
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const stash = useDiagramStore((s) => s.stash);
  const tree = useMemo(
    () => (open ? buildOutline(pages, activePageId, (id) => (id === activePageId ? { nodes, edges } : stash[id] ?? { nodes: [], edges: [] })) : []),
    [open, pages, activePageId, nodes, edges, stash],
  );
  if (!open) return null;

  const go = (pageId: string, then?: () => void) => {
    const st = useDiagramStore.getState();
    if (st.activePageId !== pageId) st.switchPage(pageId);
    then?.();
  };
  const pickNode = (pageId: string, id: string) =>
    go(pageId, () => {
      focusNode(id);
      zoomToNode(id);
    });
  const pickEdge = (pageId: string, id: string) => go(pageId, () => useDiagramStore.getState().selectOnly('edge', id));

  const renderNode = (pageId: string, n: OutlineNode): React.JSX.Element => (
    <li key={n.id} role="treeitem" aria-expanded={n.children.length ? true : undefined} aria-selected={false}>
      <button type="button" className="outline-node" onClick={() => pickNode(pageId, n.id)}>
        {n.label} <span className="outline-kind">{n.type}</span>
      </button>
      {(n.connections.length > 0 || n.children.length > 0) && (
        <ul role="group">
          {n.connections.map((c) => (
            <li key={`${n.id}-${c.id}-${c.direction}`} role="treeitem" aria-selected={false}>
              <button type="button" className="outline-conn" onClick={() => pickEdge(pageId, c.id)}>
                {c.text}
              </button>
            </li>
          ))}
          {n.children.map((k) => renderNode(pageId, k))}
        </ul>
      )}
    </li>
  );

  return (
    <aside className="outline-panel glass" style={{ left: sidebarOpen ? 316 : 64 }} aria-label={t('Outline')} data-testid="outline-panel">
      <div className="outline-head">
        <b id="outline-h">{t('Outline')}</b>
        <button type="button" className="layers-x" aria-label={t('Close outline')} onClick={() => setDesign({ outlineOpen: false })}>
          <X size={13} aria-hidden />
        </button>
      </div>
      <ul className="outline-tree" role="tree" aria-label={t('Diagram outline')}>
        {tree.map((p) => (
          <li key={p.id} role="treeitem" aria-expanded aria-selected={p.active}>
            <button type="button" className="outline-page" aria-current={p.active ? 'page' : undefined} onClick={() => go(p.id)}>
              {p.name}
            </button>
            <ul role="group">
              {p.nodes.length === 0 && <li role="none" className="muted pad">{t('Nothing on this page')}</li>}
              {p.nodes.map((n) => renderNode(p.id, n))}
            </ul>
          </li>
        ))}
      </ul>
    </aside>
  );
}
