/** Design-tool commands behind menus, ⌘K and shortcuts: `executeDesignAction('create-component', env)`. Returns false for names that are not ours. */
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { useLibraryDoc } from '../library/store';
import { createComponent, detachInstance, instantiate, instanceOf, resetOverrides } from '../library/components';
import { DEFAULT_AUTOLAYOUT, reflowAll, setAutoLayout, wrapInAutoLayout } from '../autolayout/autolayout';
import { flowRef, viewCenter } from '../board/flowRef';
import { newId } from '../graph';
import { toast } from '../../store/toastStore';
import { snippetsFor } from '../devmode/devmode';
import { linkPath, popTrail, pushTrail } from '../links/links';
import { guardedNavigate } from '../router';
import { useWorkspace } from '../../workspace/store';
import type { AutoLayoutConfig, NodeLink } from '../../types';
import { applyStyle, detachStyle, type StyleSlot } from '../library/styles';
import { themeRoot } from '../host';

const st = () => useDiagramStore.getState();

export function zoomToNode(id: string): void {
  const rf = flowRef.current;
  const n = st().nodes.find((x) => x.id === id);
  if (!rf || !n) return;
  st().selectOnly('node', id);
  void rf.fitView({ nodes: [{ id }], duration: 350, padding: 0.6, maxZoom: 1.5 });
}

/** jump to a link target (another file, or a node in it); remembers where we came from for the breadcrumb "back" */
export function followLink(link: NodeLink): void {
  const ws = useWorkspace.getState();
  const here = st().projectId;
  const sel = st().nodes.find((n) => n.selected);
  const ui = useUiStore.getState();
  ui.setDesign({ linkTrail: pushTrail(ui.linkTrail, { fileId: here, ...(sel ? { nodeId: sel.id } : {}) }) });
  if (link.fileId === here) {
    if (link.nodeId) zoomToNode(link.nodeId);
    return;
  }
  if (!ws.projectId || !ws.tree.files.some((f) => f.id === link.fileId)) {
    toast.error('The linked file no longer exists');
    return;
  }
  guardedNavigate(linkPath(ws.projectId, link));
}
export function linkBack(): void {
  const ui = useUiStore.getState();
  const { trail, entry } = popTrail(ui.linkTrail);
  if (!entry) return;
  ui.setDesign({ linkTrail: trail });
  const ws = useWorkspace.getState();
  if (entry.fileId === st().projectId) {
    if (entry.nodeId) zoomToNode(entry.nodeId);
    return;
  }
  if (ws.projectId) guardedNavigate(linkPath(ws.projectId, entry));
}

const selectedIds = () => st().nodes.filter((n) => n.selected).map((n) => n.id);

export function executeDesignAction(action: string, env: { nodeId?: string; at?: { x: number; y: number } } = {}): boolean {
  const [name, ...rest] = action.split(':');
  const arg = rest.join(':');
  const ui = useUiStore.getState();
  const lib = useLibraryDoc.getState();
  switch (name) {
    case 'layers-toggle': ui.setDesign({ layersOpen: !ui.layersOpen }); return true;
    case 'outline-toggle': ui.setDesign({ outlineOpen: !ui.outlineOpen }); return true;
    case 'connect-start': {
      // the node with keyboard focus counts even when it is not selected yet
      const focused = (document.activeElement as HTMLElement | null)?.closest?.('.react-flow__node[data-id]')?.getAttribute('data-id') ?? undefined;
      const from = env.nodeId ?? focused ?? selectedIds()[0];
      if (!from) { toast.info('Select a node first, then press Shift+C to connect it'); return true; }
      ui.setConnectFrom(from);
      return true;
    }
    case 'rulers-toggle': ui.setDesign({ rulers: !ui.rulers }); return true;
    case 'dev-toggle': ui.setDesign({ devMode: !ui.devMode }); return true;
    case 'plugins-open': ui.setDesign({ pluginsOpen: !ui.pluginsOpen }); return true;
    case 'toggle-hidden': {
      const ids = new Set(env.nodeId && !selectedIds().includes(env.nodeId) ? [env.nodeId] : selectedIds());
      if (!ids.size) return true;
      const hide = !st().nodes.filter((n) => ids.has(n.id)).every((n) => n.data.hidden);
      st().transform((nodes, edges) => ({ edges, nodes: nodes.map((n) => (ids.has(n.id) ? { ...n, data: { ...n.data, hidden: hide }, selected: hide ? false : n.selected } : n)) }));
      return true;
    }
    case 'create-component': {
      const ids = selectedIds();
      const first = st().nodes.find((n) => n.id === ids[0]);
      const label = ids.length === 1 && first?.data.label ? String(first.data.label) : `Component ${Object.keys(lib.doc.components).length + 1}`;
      const made = createComponent(st().nodes, st().edges, ids, label, lib.doc, newId);
      if (!made) { toast.info('Select something to turn into a component'); return true; }
      const def = { ...made.library.components[made.componentId], mainFileId: st().projectId };
      st().transform(() => ({ nodes: made.nodes.map((n) => ({ ...n, selected: n.id === made.mainId })), edges: made.edges }));
      useLibraryDoc.getState().update((d) => ({ ...d, components: { ...d.components, [made.componentId]: def } }));
      toast.success(`Created component “${label}”`);
      return true;
    }
    case 'insert-component': {
      const def = lib.doc.components[arg];
      if (!def) return true;
      const at = env.at ?? viewCenter();
      const r = instantiate(def, { x: at.x - def.width / 2, y: at.y - def.height / 2 }, newId);
      st().transform((nodes, edges) => ({ nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...r.nodes], edges: [...edges, ...r.edges] }));
      return true;
    }
    case 'detach-instance': {
      const id = env.nodeId ?? selectedIds()[0];
      if (!id) return true;
      st().transform((nodes, edges) => ({ nodes: detachInstance(nodes, instanceGroupId(id) ?? id), edges }));
      return true;
    }
    case 'reset-overrides': {
      const id = env.nodeId ?? selectedIds()[0];
      if (!id) return true;
      st().transform((nodes, edges) => ({ nodes: resetOverrides(nodes, instanceGroupId(id) ?? id, lib.doc), edges }));
      return true;
    }
    case 'go-to-main': {
      const id = env.nodeId ?? selectedIds()[0];
      const cid = id ? instanceOf(st().nodes, id) ?? (st().nodes.find((n) => n.id === id)?.data.componentMain as string | undefined) ?? null : null;
      const def = cid ? lib.doc.components[cid] : undefined;
      if (!def?.mainNodeId) { toast.info('The main component was deleted'); return true; }
      followLink({ fileId: def.mainFileId ?? st().projectId, nodeId: def.mainNodeId });
      return true;
    }
    case 'auto-layout': {
      const sel = selectedIds();
      const target = env.nodeId ?? sel[0];
      const node = st().nodes.find((n) => n.id === target);
      if (arg === 'off') {
        if (node) st().transform((nodes, edges) => ({ nodes: setAutoLayout(nodes, node.id, null), edges }));
        return true;
      }
      const mode = (arg === 'column' || arg === 'grid' ? arg : 'row') as AutoLayoutConfig['mode'];
      if (node?.type === 'group' && sel.length <= 1) {
        const cfg: AutoLayoutConfig = { ...DEFAULT_AUTOLAYOUT, ...(node.data.autoLayout ?? {}), mode, ...(mode === 'grid' ? { columns: node.data.autoLayout?.columns ?? 3 } : {}) };
        st().transform((nodes, edges) => ({ nodes: setAutoLayout(nodes, node.id, cfg), edges }));
        return true;
      }
      const wrapped = wrapInAutoLayout(st().nodes, sel, newId('al'), { mode, ...(mode === 'grid' ? { columns: 3 } : {}) });
      if (!wrapped) { toast.info('Select cards, stickies or icons to lay out'); return true; }
      st().transform((_n, edges) => ({ nodes: wrapped.nodes, edges }));
      return true;
    }
    case 'style-apply': {
      const [slot, id] = arg.split(':') as [StyleSlot, string];
      const theme = themeRoot().dataset.theme === 'dark' ? 'dark' : 'light';
      st().transform((nodes, edges) => ({ nodes: applyStyle(nodes, selectedIds(), slot, id, lib.doc, theme), edges }));
      return true;
    }
    case 'style-detach': {
      const slot = arg as StyleSlot;
      const ids = env.nodeId ? [env.nodeId] : selectedIds();
      st().transform((nodes, edges) => ({ nodes: detachStyle(nodes, ids, slot), edges }));
      return true;
    }
    case 'link-open': {
      const [fileId, nodeId] = [arg.slice(0, arg.indexOf(':')), arg.slice(arg.indexOf(':') + 1)];
      followLink({ fileId, ...(nodeId ? { nodeId } : {}) });
      return true;
    }
    case 'link-follow': {
      const n = st().nodes.find((x) => x.id === (env.nodeId ?? selectedIds()[0]));
      if (n?.data.link) followLink(n.data.link);
      return true;
    }
    case 'link-back': linkBack(); return true;
    case 'copy-snippet': {
      const n = st().nodes.find((x) => x.id === (env.nodeId ?? selectedIds()[0]));
      const snip = n && snippetsFor(n, st().nodes, st().edges).find((s) => s.id === arg);
      if (snip) void navigator.clipboard?.writeText(snip.code).then(() => toast.success(`Copied ${snip.label}`), () => toast.error('Could not use the clipboard'));
      return true;
    }
    case 'reflow': st().transform((nodes, edges) => { const out = reflowAll(nodes); return out === nodes ? null : { nodes: out, edges }; }); return true;
  }
  return false;
}

function instanceGroupId(id: string): string | null {
  const nodes = st().nodes;
  let cur = nodes.find((n) => n.id === id);
  for (let i = 0; cur && i < 20; i++) {
    if (cur.data.instance && !cur.data.componentMain) return cur.id;
    cur = cur.parentId ? nodes.find((n) => n.id === cur!.parentId) : undefined;
  }
  return null;
}

/** the link of the node under a screen point (presentation mode: a click on a linked node follows it instead of stepping on) */
export function linkAtPoint(clientX: number, clientY: number): NodeLink | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const id = el.closest?.('.react-flow__node[data-id]')?.getAttribute('data-id');
    if (!id) continue;
    const link = st().nodes.find((n) => n.id === id)?.data.link;
    if (link) return link;
  }
  return null;
}
