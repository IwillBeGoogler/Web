import { useMemo, useRef, useState, type DragEvent } from 'react';
import { ChevronRight, Eye, EyeOff, Lock, LockOpen, Search, X } from 'lucide-react';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { buildLayerRows, filterRows, moveLayer, toggleLayerFlag, type LayerRow } from '../../lib/layers/layers';
import { isContainer } from '../../lib/graph';

const KIND: Record<string, string> = { activity: 'Activity', icon: 'Component', group: 'Group', cluster: 'Cluster', text: 'Text', shape: 'Shape', sticky: 'Sticky', draw: 'Drawing', frame: 'Frame', mindmap: 'Topic', stamp: 'Stamp', card: 'Card', junction: 'Junction', table: 'Table', class: 'Class', sequence: 'Sequence', state: 'State', usecase: 'Use case', component: 'Component', deployment: 'Deployment', object: 'Object', participant: 'Participant' };

/**
 * Layers: the node tree of this file. Hidden by default (rail button or ⌘K "Layers"). Click selects (⇧/⌘ adds), double-click renames,
 * the eye hides (hidden layers are not drawn and not exported), the lock locks; drag a row to reorder the z-order or move it into another
 * group, frame-less nodes stay where they are.
 */
export function LayersPanel() {
  const open = useUiStore((s) => s.layersOpen);
  const setDesign = useUiStore((s) => s.setDesign);
  const sidebarOpen = useUiStoreSidebar();
  const nodes = useDiagramStore((s) => s.nodes);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); // everything starts expanded; the PANEL itself is closed until asked for
  const expanded = useMemo(() => new Set(nodes.filter((n) => !collapsed.has(n.id)).map((n) => n.id)), [nodes, collapsed]);
  const [q, setQ] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; where: 'before' | 'after' | 'into' } | null>(null);
  const dragId = useRef<string | null>(null);
  const searching = q.trim().length > 0;
  const rows = useMemo(() => {
    const all = buildLayerRows(nodes, { expanded, all: searching });
    return searching ? filterRows(all, q) : all;
  }, [nodes, expanded, q, searching]);
  if (!open) return null;

  const select = (id: string, add: boolean) => {
    const st = useDiagramStore.getState();
    if (!add) return st.selectOnly('node', id);
    useDiagramStore.setState({ nodes: st.nodes.map((n) => (n.id === id ? { ...n, selected: !n.selected } : n)) });
  };
  const toggle = (id: string) => setCollapsed((e) => { const n = new Set(e); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const flag = (id: string, f: 'hidden' | 'locked') => useDiagramStore.getState().transform((ns, es) => ({ nodes: toggleLayerFlag(ns, id, f), edges: es }));
  const rename = (id: string, label: string) => {
    setRenaming(null);
    const cur = useDiagramStore.getState().nodes.find((n) => n.id === id);
    if (cur && cur.data.label !== label) useDiagramStore.getState().updateNodeData(id, { label });
  };
  const onDrop = (e: DragEvent, row: LayerRow) => {
    e.preventDefault();
    const id = dragId.current;
    const where = drop?.where ?? 'before';
    dragId.current = null;
    setDrop(null);
    if (!id || id === row.id || row.virtual) return;
    useDiagramStore.getState().transform((ns, es) => {
      const target = ns.find((n) => n.id === row.id);
      if (!target) return null;
      let out: typeof ns | null;
      if (where === 'into' && isContainer(target)) out = moveLayer(ns, id, target.id, Number.MAX_SAFE_INTEGER);
      else {
        // rows list the top-most first: "before" a row means ABOVE it = a higher paint index
        const parentId = target.parentId ?? null;
        const sibs = ns.filter((n) => (n.parentId ?? null) === parentId && n.id !== id);
        const at = sibs.findIndex((n) => n.id === target.id);
        out = moveLayer(ns, id, parentId, where === 'before' ? at + 1 : at);
      }
      return out ? { nodes: out, edges: es } : null;
    });
  };

  return (
    <aside className="layers-panel glass" style={{ left: sidebarOpen ? 316 : 64 }} aria-label={t('Layers')} data-testid="layers-panel">
      <div className="layers-head">
        <b>{t('Layers')}</b>
        <label className="layers-search"><Search size={12} aria-hidden /><input type="search" aria-label={t('Filter layers')} placeholder={t('Filter')} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button type="button" className="layers-x" aria-label={t('Close layers')} onClick={() => setDesign({ layersOpen: false })}><X size={13} aria-hidden /></button>
      </div>
      <ul className="layers-list" role="tree">
        {rows.length === 0 && <li className="muted pad">{searching ? t('No matching layers') : t('Nothing on this canvas yet')}</li>}
        {rows.map((r) => {
          const node = nodes.find((n) => n.id === r.id);
          const selected = !!node?.selected;
          const open = searching || expanded.has(r.id);
          return (
            <li
              key={r.id}
              role="treeitem"
              aria-selected={selected}
              aria-expanded={r.hasChildren ? open : undefined}
              data-layer={r.id}
              className={`layer-row${selected ? ' sel' : ''}${r.effectiveHidden ? ' dim' : ''}${drop?.id === r.id ? ` drop-${drop.where}` : ''}`}
              style={{ paddingLeft: 6 + r.depth * 14 }}
              draggable={!r.virtual && !r.effectiveLocked}
              onDragStart={(e) => { dragId.current = r.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); }}
              onDragEnd={() => { dragId.current = null; setDrop(null); }}
              onDragOver={(e) => {
                if (!dragId.current || r.virtual) return;
                e.preventDefault();
                const b = e.currentTarget.getBoundingClientRect();
                const y = (e.clientY - b.top) / b.height;
                const cont = !!node && isContainer(node);
                setDrop({ id: r.id, where: cont && y > 0.3 && y < 0.7 ? 'into' : y < 0.5 ? 'before' : 'after' });
              }}
              onDragLeave={() => setDrop((d) => (d?.id === r.id ? null : d))}
              onDrop={(e) => onDrop(e, r)}
              onClick={(e) => !r.virtual && select(r.id, e.shiftKey || e.metaKey || e.ctrlKey)}
              onDoubleClick={() => !r.virtual && setRenaming(r.id)}
            >
              <button type="button" className={`layer-chev${r.hasChildren ? '' : ' none'}`} aria-label={open ? t('Collapse') : t('Expand')} tabIndex={r.hasChildren ? 0 : -1} onClick={(e) => { e.stopPropagation(); if (r.hasChildren) toggle(r.id); }}>
                <ChevronRight size={12} aria-hidden style={{ transform: open ? 'rotate(90deg)' : undefined }} />
              </button>
              <span className="layer-type" title={t(KIND[r.type] ?? r.type)}>{t(KIND[r.type] ?? r.type).slice(0, 1)}</span>
              {renaming === r.id ? (
                <input className="layer-rename" autoFocus defaultValue={r.label} aria-label={t('Layer name')} onClick={(e) => e.stopPropagation()} onFocus={(e) => e.currentTarget.select()} onBlur={(e) => rename(r.id, e.currentTarget.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} />
              ) : (
                <span className="layer-name">{r.label || t(KIND[r.type] ?? r.type)}</span>
              )}
              {!r.virtual && (
                <span className="layer-flags">
                  <button type="button" className={r.locked || r.effectiveLocked ? 'on' : ''} aria-label={r.locked ? t('Unlock {name}', { name: r.label }) : t('Lock {name}', { name: r.label })} aria-pressed={r.locked} title={t('Lock')} onClick={(e) => { e.stopPropagation(); flag(r.id, 'locked'); }}>
                    {r.locked || r.effectiveLocked ? <Lock size={12} aria-hidden /> : <LockOpen size={12} aria-hidden />}
                  </button>
                  <button type="button" className={r.hidden || r.effectiveHidden ? 'on' : ''} aria-label={r.hidden ? t('Show {name}', { name: r.label }) : t('Hide {name}', { name: r.label })} aria-pressed={r.hidden} title={t('Hide')} onClick={(e) => { e.stopPropagation(); flag(r.id, 'hidden'); }}>
                    {r.hidden || r.effectiveHidden ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

import { useLayoutStore } from '../../store/layoutStore';
import { t } from '../../i18n';
function useUiStoreSidebar(): boolean {
  return useLayoutStore((s) => s.sidebarOpen);
}
