import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import type { Arrows, LineType, StrokeStyle } from '../types';
import type { AlignMode, DistributeAxis } from './arrange';
import { createNodeForTool, type Tool } from './shapes';
import { newId } from './graph';
import { createNodeFromPaletteItem, createNodesFromPaletteItem, getItem } from '../data/palette';
import { addFragment, addMessage, addNote, addParticipant, setNumbering } from './seq/edit';
import type { FragmentOp } from './seq/types';
import type { StateKind } from './state/types';
import { ACTIVITY_DEFAULT_NAME, isPseudo, type ActivityKind } from './activity/types';
import type { SequenceData } from './seq/types';
import { addMessage as addCommMessage, hasMessages, renumber } from './communication/messages';
import { communicationToSequence, sequenceToCommunication } from './communication/convert';
import { addChangeAt, addConstraint, addLifeline, addMessage as addTimingMessage } from './timing/edit';
import type { LifelineKind, TimingData } from './timing/types';
import { addPort } from './component/ports';
import type { ComponentData } from './uml2/types';
import { isStateLike } from './state/convert';
import { isPackageNode } from './package/nodes';
import { useSettingsStore } from '../store/settingsStore';
import { toast } from '../store/toastStore';
import { t } from '../i18n';
import { relationOf, tableOf } from './er/tableData';
import { addColumn, blankTable } from './er/relations';
import { tableSql } from './er/renderSql';
import { diagramToSchema } from './er/convert';
import { openErExport, openErImport } from '../components/er/erDialogs';
import { openUmlExport, openUmlImport } from '../components/uml/umlDialogs';
import { blankClass, KIND_ACCENT } from './uml/geometry';
import { addMember, toggleCompartment } from './uml/edit';
import type { ClassKind, UmlRelationData, UmlRelKind } from './uml/types';
import { executeBoardAction } from './board/commands';
import { executeDesignAction } from './design/actions';
import { executeSmartAction } from './smart/actions';
import { mmPasteText } from './board/actions';
import { useEditorSession } from '../sync/status';
import { describeScope, runAutoArrange } from './autoarrange/apply';
import { deletePageDialog, renameGroupDialog, renamePageDialog, requestDelete, type DeleteTarget } from './dialogActions';

/** Locked elements are never deleted: say so instead of failing silently. */
const kept = (n: number): void => {
  if (n > 0) toast.info(`${n} locked item${n === 1 ? '' : 's'} kept: unlock ${n === 1 ? 'it' : 'them'} to delete`);
};

export interface ProjectActions {
  open: (id: string) => void;
  rename: (id: string) => void;
  /** false for a viewer / commenter (default: allowed) */
  canRename?: (id: string) => boolean;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  export?: (id: string) => void;
}
export interface ActionEnv {
  nodeId?: string;
  edgeId?: string;
  pageId?: string;
  projectId?: string;
  /** flow-space cursor position */
  at?: { x: number; y: number };
  fitView?: () => void;
  exportImage?: (kind: 'png' | 'svg') => void;
  project?: ProjectActions;
}

/** Every menu/shortcut action funnels through here -> store, so each is undoable. */
export function executeAction(action: string, env: ActionEnv = {}): void {
  const st = useDiagramStore.getState();
  const ui = useUiStore.getState();
  const [name, ...rest] = action.split(':');
  const arg = rest.join(':');
  const selNodeIds = () => st.nodes.filter((n) => n.selected).map((n) => n.id);
  const targetEdges = () => (env.edgeId ? [env.edgeId] : st.edges.filter((e) => e.selected).map((e) => e.id));
  const hasEdgeSel = () => targetEdges().length > 0 && selNodeIds().length === 0;

  switch (name) {
    case 'rename': {
      if (useEditorSession.getState().readOnly) return;
      // groups / clusters: a rename dialog with validation; everything else keeps the inline label editor
      const id = env.nodeId ?? selNodeIds()[0];
      const n = id ? st.nodes.find((x) => x.id === id) : undefined;
      if (n && (n.type === 'group' || n.type === 'cluster')) return void renameGroupDialog(n.id);
      return ui.setEditing(env.nodeId ?? env.edgeId ?? selNodeIds()[0] ?? null);
    }
    case 'edit-label':
      return ui.setEditing(env.nodeId ?? env.edgeId ?? selNodeIds()[0] ?? null);
    case 'change-icon':
      return ui.setIconPicker(env.nodeId ?? selNodeIds()[0] ?? null);
    case 'cut': return st.cut();
    case 'copy': return st.copy();
    case 'paste': {
      const one = st.nodes.filter((n) => n.selected);
      if (one.length === 1 && one[0].type === 'mindmap' && typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        // text / a Markdown list pasted onto a mind map node becomes its children (indentation = depth)
        const id = one[0].id;
        return void navigator.clipboard.readText().then((t) => { if (!mmPasteText(id, t)) st.paste(); }, () => st.paste());
      }
      return st.paste();
    }
    case 'paste-here': return st.paste(env.at);
    case 'duplicate': return st.duplicate();
    case 'copy-style': return st.copyStyle();
    case 'paste-style': return st.pasteStyle();
    case 'delete': {
      // the menu/shortcut target wins when it is not part of the selection; otherwise delete the whole selection
      const selN = selNodeIds();
      const selE = st.edges.filter((e) => e.selected).map((e) => e.id);
      let target: DeleteTarget | undefined;
      if (env.nodeId && !selN.includes(env.nodeId)) target = { nodes: [env.nodeId] };
      else if (env.edgeId && !selE.includes(env.edgeId)) target = { edges: [env.edgeId] };
      // groups with children and selections over 10 items ask first (dialog); everything else deletes right away
      return requestDelete(target, (t) => useDiagramStore.getState().deleteSelection(t), kept);
    }
    case 'toggle-flow': {
      const on = !st.pageFlow[st.activePageId];
      st.setPageFlow(st.activePageId, on);
      if (!on) ui.setTrace(null);
      return;
    }
    case 'select-all': return st.selectAll();
    case 'select-children': return env.nodeId ? st.selectChildren(env.nodeId) : undefined;
    case 'lock':
    case 'unlock':
    case 'toggle-lock': return st.toggleLock();
    case 'ungroup-selection': {
      const groups = st.nodes.filter((n) => n.selected && (n.type === 'group' || n.type === 'cluster')).map((n) => n.id);
      return groups.forEach((g) => useDiagramStore.getState().ungroup(g));
    }
    case 'bring-front': return st.reorderSelection('front');
    case 'bring-forward': return st.reorderSelection('forward');
    case 'send-backward': return st.reorderSelection('backward');
    case 'send-back': return st.reorderSelection('back');
    case 'align': return st.alignSelection(arg as AlignMode);
    case 'distribute': return st.distributeSelection(arg as DistributeAxis);
    case 'group': return st.groupSelection();
    case 'ungroup': return env.nodeId ? st.ungroup(env.nodeId) : undefined;
    case 'remove-from-group': return st.removeFromGroup(env.nodeId ? [env.nodeId] : selNodeIds());
    case 'delete-group-only': return env.nodeId ? st.ungroup(env.nodeId) : undefined;
    case 'delete-group-with-children': return env.nodeId ? kept(st.deleteNodes([env.nodeId])) : undefined;
    case 'wrap-cluster': return st.wrapSelectionInCluster();
    case 'toggle-collapse': return env.nodeId ? st.toggleCollapse(env.nodeId) : undefined;
    case 'add-replica': return env.nodeId ? void st.addReplica(env.nodeId) : undefined;
    case 'edit-cluster': return env.nodeId ? ui.setWizard({ clusterId: env.nodeId }) : undefined;
    case 'role': return void st.setRole(selNodeIds().length ? selNodeIds() : env.nodeId ? [env.nodeId] : [], arg === 'none' ? null : arg);
    case 'role-custom': return ui.setEditing(env.nodeId ?? selNodeIds()[0] ?? null), ui.setFocusRole(true);
    case 'edgeKind': return arg === 'none' ? undefined : st.updateEdges(targetEdges(), { kind: arg as never });
    case 'reset-route': return env.edgeId ? st.resetRoute(env.edgeId) : targetEdges().forEach((id) => useDiagramStore.getState().resetRoute(id));
    case 'match-size': return void st.matchSelectionSize();
    case 'reset-style': return st.resetSelectionStyle();
    case 'select-similar': {
      const anchor = env.nodeId ? { kind: 'node' as const, id: env.nodeId } : env.edgeId ? { kind: 'edge' as const, id: env.edgeId } : undefined;
      return void st.selectSimilar(arg as 'type' | 'icon' | 'preset', anchor);
    }
    case 'preset': return st.applyEdgePreset(targetEdges(), arg, useSettingsStore.getState().global.edgePresets);
    case 'labelSide': return st.updateEdges(targetEdges(), { labelSide: arg as 'auto' | 'on' | 'left' | 'right' });
    case 'repeat': return env.nodeId ? st.repeatGroup(env.nodeId, Number(arg)) : undefined;
    case 'merge-junction':
      if (!st.mergeIntoJunction(st.edges.filter((e) => e.selected).map((e) => e.id))) toast.info('Select edges that share the same source or target');
      return;
    case 'tidy-edges': return st.tidyEdges();
    case 'auto-arrange': { // auto-arrange[:selection]; options come from the per-file Auto layout prefs
      if (useEditorSession.getState().readOnly) return;
      const r = runAutoArrange(arg === 'page' ? {} : arg === 'inside' && env.nodeId ? { selection: [env.nodeId] } : { selection: describeScope() !== 'page' });
      return void (r.moved && env.fitView?.());
    }
    case 'tidy-er': {
      const n = st.tidyEr();
      return void (n ? toast.success(n === 1 ? t('Arranged {n} table', { n }) : t('Arranged {n} tables', { n })) : toast.info(t('No tables on this page')));
    }
    case 'er-add-table': {
      const at = env.at ?? { x: 0, y: 0 };
      const node = blankTable(newId('n'), { x: at.x - 130, y: at.y - 60 });
      st.placeNodes([node]);
      return ui.setEditing(node.id);
    }
    case 'er-select-related': {
      // the table plus every table joined to it, so the group can be moved or styled together
      const id = env.nodeId ?? selNodeIds()[0];
      if (!id) return;
      const ids = new Set([id, ...st.edges.filter((e) => !e.hidden && relationOf(e) && (e.source === id || e.target === id)).flatMap((e) => [e.source, e.target])]);
      return useDiagramStore.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: ids.has(n.id) })), edges: s.edges.map((e) => (e.selected ? { ...e, selected: false } : e)) }));
    }
    case 'er-sql-panel': return ui.setDesign({ sqlPanelOpen: !ui.sqlPanelOpen });
    case 'er-collapse-all':
    case 'er-expand-all': {
      const ids = st.nodes.filter((n) => n.type === 'table').map((n) => n.id);
      return void (ids.length && st.updateNodesData(ids, { collapsed: name === 'er-collapse-all' } as never));
    }
    case 'er-import': return void openErImport();
    case 'er-export': return void openErExport();
    case 'er-copy-sql': {
      const id = env.nodeId ?? selNodeIds()[0];
      const n = st.nodes.find((x) => x.id === id);
      if (!n || n.type !== 'table') return;
      const schema = diagramToSchema(st.nodes, st.edges);
      const def = schema.tables.find((t) => t.name === tableOf(n).label);
      if (!def) return void toast.info('Enums have no CREATE TABLE');
      return void navigator.clipboard?.writeText(tableSql('postgres', def, schema)[0]).then(() => toast.success('Copied CREATE TABLE'));
    }
    case 'table-collapse': return env.nodeId ? st.updateNodeData(env.nodeId, { collapsed: !st.nodes.find((n) => n.id === env.nodeId)?.data.collapsed }) : undefined;
    case 'table-add-column': return env.nodeId ? st.updateTable(env.nodeId, (d) => addColumn(d)) : undefined;
    case 'table-accent': return (env.nodeId ? [env.nodeId] : selNodeIds()).forEach((id) => useDiagramStore.getState().updateNodeData(id, { accent: arg }));
    case 'rel-card': return st.setCardinality(targetEdges(), arg as never);
    case 'rel-optional':
    case 'rel-identifying': {
      const ids = targetEdges();
      const first = st.edges.find((e) => e.id === ids[0]);
      const r = first && relationOf(first);
      if (!r) return;
      return st.updateRelations(ids, name === 'rel-optional' ? { optional: !r.optional } : { identifying: !r.identifying });
    }
    case 'rel-junction': {
      const id = targetEdges()[0];
      const j = id ? st.makeJunction(id) : null;
      return void (j ? toast.success('Created junction table') : toast.info('Only many-to-many relations can become a junction table'));
    }
    case 'rel-nm-show': {
      const id = env.nodeId ?? selNodeIds()[0];
      return void (id && st.foldJunction(id) ? toast.success('Showing the junction table as a many-to-many relation') : toast.info('Not a junction table (needs two foreign keys that make up its composite key)'));
    }
    case 'rel-nm-expand': {
      const id = targetEdges()[0];
      return void (id && st.unfoldJunction(id) ? toast.success('Showing the junction table') : toast.info('This relation has no junction table behind it'));
    }
    case 'uml-connect': {
      const kind = arg as UmlRelKind;
      const selE = st.edges.filter((e) => e.selected);
      const sel = st.nodes.filter((n) => n.selected);
      if (selE.length && !sel.length) return st.updateUml(selE.map((e) => e.id), { kind });
      if (kind === 'note') {
        const note = sel.find((n) => n.type === 'sticky');
        const cls = sel.find((n) => n.type === 'class');
        if (!note || !cls) return void toast.info('Select a note and a class to attach it');
        return void st.addUmlEdge(note.id, cls.id, { kind });
      }
      // classes, states (also composite), use cases, actors, components and interfaces all connect the same way
      const umlish = sel.filter((n) => n.type === 'class' || n.type === 'usecase' || n.type === 'activity' || n.type === 'component' || n.type === 'deployment' || n.type === 'object' || isPackageNode(n) || isStateLike(n));
      if (umlish.length < 2 && !(umlish.length === 1 && kind === 'transition')) return void toast.info('Select two UML elements (or a relation) first');
      return void st.addUmlEdge(umlish[0].id, (umlish[1] ?? umlish[0]).id, { kind });
    }
    case 'uml-add': {
      const item = getItem(arg);
      if (!item) return;
      const at = env.at ?? { x: 0, y: 0 };
      const made = createNodesFromPaletteItem(item, { x: at.x - 70, y: at.y - 40 }, newId);
      st.placeNodes(made);
      return made[0].type === 'state' || made[0].type === 'usecase' || made[0].type === 'component' || made[0].type === 'deployment' || made[0].type === 'object' || made[0].type === 'timing' || (made[0].type === 'activity' && !isPseudo(made[0].data.actKind as ActivityKind)) ? ui.setEditing(made[0].id) : undefined;
    }
    case 'seq-add-participant':
    case 'seq-add-message':
    case 'seq-add-note':
    case 'seq-fragment':
    case 'seq-numbering': {
      const id = env.nodeId ?? st.nodes.find((n) => n.selected && n.type === 'sequence')?.id;
      if (!id) return;
      const f: Record<string, (d: SequenceData) => SequenceData> = {
        'seq-add-participant': (d) => addParticipant(d) as SequenceData,
        'seq-add-message': (d) => addMessage(d) as SequenceData,
        'seq-add-note': (d) => addNote(d) as SequenceData,
        'seq-fragment': (d) => addFragment(d, arg as FragmentOp) as SequenceData,
        'seq-numbering': (d) => setNumbering(d, !d.autonumber) as SequenceData,
      };
      return st.updateSequence(id, f[name]);
    }
    case 'state-self': {
      const id = env.nodeId ?? selNodeIds()[0];
      return void (id && st.addUmlEdge(id, id, { kind: 'transition' }));
    }
    case 'state-kind': return (env.nodeId ? [env.nodeId] : selNodeIds()).forEach((id) => useDiagramStore.getState().updateState(id, (d) => ({ ...d, stateKind: arg as StateKind, label: arg === 'state' && !d.label ? 'State' : d.label })));
    case 'tidy-state': {
      const n = st.tidyStates();
      return void (n ? toast.success(n === 1 ? t('Arranged {n} state', { n }) : t('Arranged {n} states', { n })) : toast.info(t('No states on this page')));
    }
    case 'tidy-packages': {
      const n = st.tidyPackages();
      return void (n ? toast.success(n === 1 ? t('Arranged {n} package diagram element', { n }) : t('Arranged {n} package diagram elements', { n })) : toast.info(t('No packages on this page')));
    }
    case 'pkg-nest': {
      const id = st.nestPackages(env.nodeId && !selNodeIds().includes(env.nodeId) ? [env.nodeId] : undefined);
      return void (id ? ui.setEditing(id) : toast.info('Select one or more packages or classes to put into a new package'));
    }
    case 'comm-add-message': {
      // the selected link, or the link between two selected objects (made when it does not exist yet)
      let edge = st.edges.find((e) => e.selected && e.data?.uml?.kind === 'link');
      if (!edge) {
        const objs = st.nodes.filter((n) => n.selected && n.type === 'object');
        if (objs.length < 2) return void toast.info('Select a link between two objects (or two objects) first');
        const have = st.edges.find((e) => e.data?.uml?.kind === 'link' && ((e.source === objs[0].id && e.target === objs[1].id) || (e.source === objs[1].id && e.target === objs[0].id)));
        const eid = have?.id ?? st.addUmlEdge(objs[0].id, objs[1].id, { kind: 'link' });
        edge = useDiagramStore.getState().edges.find((e) => e.id === eid);
      }
      if (!edge) return;
      const eid = edge.id;
      useDiagramStore.getState().editEdges((es) => addCommMessage(es, eid).edges);
      return void toast.success('Message added: edit its text in the link inspector');
    }
    case 'comm-renumber': {
      if (!hasMessages(st.edges)) return void toast.info('No numbered messages on this page');
      st.editEdges((es) => renumber(es));
      return void toast.success('Messages renumbered');
    }
    case 'seq-to-comm': {
      const seq = st.nodes.find((n) => n.id === (env.nodeId ?? '') && n.type === 'sequence') ?? st.nodes.find((n) => n.selected && n.type === 'sequence');
      if (!seq) return void toast.info('Select a sequence frame to convert');
      const r = sequenceToCommunication(seq);
      st.insertContent(r.diagram);
      return void toast.info(r.lossy.length ? `Converted to a communication diagram. Not carried over: ${r.lossy.join('; ')}` : 'Converted to a communication diagram. Nothing was lost');
    }
    case 'comm-to-seq': {
      const sel = st.nodes.filter((n) => n.selected && n.type === 'object');
      const nodes = sel.length >= 2 ? sel : st.nodes.filter((n) => n.type === 'object');
      const ids = new Set(nodes.map((n) => n.id));
      const edges = st.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
      if (!hasMessages(edges)) return void toast.info('No numbered messages to convert: add messages to the links first');
      const r = communicationToSequence(nodes, edges, 'Sequence');
      st.insertContent(r.diagram);
      return void toast.info(r.lossy.length ? `Converted to a sequence diagram. Not carried over: ${r.lossy.join('; ')}` : 'Converted to a sequence diagram. Nothing was lost');
    }
    case 'timing-add-lifeline':
    case 'timing-add-change':
    case 'timing-add-message':
    case 'timing-add-constraint': {
      const id = env.nodeId ?? st.nodes.find((n) => n.selected && n.type === 'timing')?.id ?? st.nodes.find((n) => n.type === 'timing')?.id;
      if (!id) return void toast.info('Add a timing frame first');
      const f: Record<string, (d: TimingData) => TimingData> = {
        'timing-add-lifeline': (d) => addLifeline(d, ((arg as LifelineKind) || 'robust')),
        'timing-add-change': (d) => { const l = d.lifelines.filter((x) => x.kind !== 'clock').slice(-1)[0]; return l ? addChangeAt(d, l.id, d.end / 2).data : d; },
        'timing-add-message': (d) => addTimingMessage(d).data,
        'timing-add-constraint': (d) => addConstraint(d).data,
      };
      return st.updateTiming(id, f[name]);
    }
    case 'tidy-timing': {
      const n = st.tidyTiming();
      return void (n ? toast.success(n === 1 ? t('Tidied {n} timing diagram', { n }) : t('Tidied {n} timing diagrams', { n })) : toast.info(t('No timing diagrams on this page')));
    }
    case 'tidy-objects': {
      const n = st.tidyObjects();
      return void (n ? toast.success(n === 1 ? t('Arranged {n} object', { n }) : t('Arranged {n} objects', { n })) : toast.info(t('No objects on this page')));
    }
    case 'instantiate-class': {
      const ids = st.instantiateClasses(env.nodeId && !selNodeIds().includes(env.nodeId) ? [env.nodeId] : undefined);
      if (!ids.length) return void toast.info('Select a class to create an object from');
      toast.success(`Created ${ids.length} object${ids.length === 1 ? '' : 's'}`);
      return ids.length === 1 ? ui.setEditing(ids[0]) : undefined;
    }
    case 'obj-add-slot': {
      const id = env.nodeId ?? selNodeIds()[0];
      return void (id && st.updateShape(id, (d) => {
        const slots = (d.slots as { id: string; name: string; value: string }[] | undefined) ?? [];
        let k = slots.length;
        while (slots.some((s) => s.id === `s${k}`)) k++;
        return { ...d, slots: [...slots, { id: `s${k}`, name: 'attribute', value: '' }] };
      }));
    }
    case 'tidy-deployment': {
      const n = st.tidyDeployment();
      return void (n ? toast.success(n === 1 ? t('Arranged {n} deployment element', { n }) : t('Arranged {n} deployment elements', { n })) : toast.info(t('No deployment elements on this page')));
    }
    case 'dep-nest': {
      const id = st.nestDeployment(env.nodeId && !selNodeIds().includes(env.nodeId) ? [env.nodeId] : undefined);
      return void (id ? ui.setEditing(id) : toast.info('Select one or more deployment elements to put into a node'));
    }
    case 'dep-unnest': return void (st.unnestDeployment(env.nodeId ? [env.nodeId] : undefined) || toast.info('Select an element that sits inside a node'));
    case 'dep-kind': return (env.nodeId ? [env.nodeId] : selNodeIds()).forEach((id) => useDiagramStore.getState().updateShape(id, (d) => ({ ...d, depKind: arg })));
    case 'tidy-activity': {
      const n = st.tidyActivity();
      return void (n ? toast.success(n === 1 ? t('Arranged {n} activity element', { n }) : t('Arranged {n} activity elements', { n })) : toast.info(t('No activity elements on this page')));
    }
    case 'act-kind': return (env.nodeId ? [env.nodeId] : selNodeIds()).forEach((id) => useDiagramStore.getState().updateShape(id, (d) => ({ ...d, actKind: arg, ...(!d.label && !isPseudo(arg as ActivityKind) ? { label: ACTIVITY_DEFAULT_NAME[arg as ActivityKind] } : {}) })));
    case 'lane-orient': {
      const ids = (env.nodeId ? [env.nodeId] : selNodeIds()).filter((id) => st.nodes.find((n) => n.id === id)?.data.variant === 'lane');
      if (!ids.length) return;
      st.updateNodesData(ids, { laneOrient: arg === 'h' ? 'h' : 'v' } as never);
      return void useDiagramStore.getState().tidyActivity();
    }
    case 'tidy-usecase': {
      const n = st.tidyUseCase();
      return void (n ? toast.success(n === 1 ? t('Arranged {n} use case element', { n }) : t('Arranged {n} use case elements', { n })) : toast.info(t('No use case elements on this page')));
    }
    case 'tidy-component': {
      const n = st.tidyComponents();
      return void (n ? toast.success(n === 1 ? t('Arranged {n} component', { n }) : t('Arranged {n} components', { n })) : toast.info(t('No components on this page')));
    }
    case 'comp-nest': {
      const id = st.nestComponents(env.nodeId && !selNodeIds().includes(env.nodeId) ? [env.nodeId] : undefined);
      return void (id ? ui.setEditing(id) : toast.info('Select one or more components to put into a node'));
    }
    case 'comp-unnest': return void (st.unnestComponents(env.nodeId ? [env.nodeId] : undefined) || toast.info('Select a component that sits inside a node'));
    case 'comp-port': {
      const ids = env.nodeId ? [env.nodeId] : selNodeIds();
      const kind = arg === 'required' ? 'required' : 'provided';
      return ids.forEach((id) => useDiagramStore.getState().updateShape(id, (d) => (d.compKind === 'provided' || d.compKind === 'required' ? d : addPort(d as unknown as ComponentData, kind) as unknown as Record<string, unknown>)));
    }
    case 'uc-extension-point': {
      const ids = (env.nodeId ? [env.nodeId] : selNodeIds()).filter((id) => st.nodes.find((n) => n.id === id)?.data.ucKind === 'usecase');
      return ids.forEach((id) => useDiagramStore.getState().updateShape(id, (d) => ({ ...d, extensionPoints: [...((d.extensionPoints as string[] | undefined) ?? []), `point ${((d.extensionPoints as string[] | undefined)?.length ?? 0) + 1}`] })));
    }
    case 'shape-kind':
    case 'shape-facing':
    case 'shape-accent': {
      const ids = env.nodeId ? [env.nodeId] : selNodeIds();
      const key = name === 'shape-kind' ? (st.nodes.find((n) => n.id === ids[0])?.type === 'usecase' ? 'ucKind' : 'compKind') : name === 'shape-facing' ? 'facing' : 'accent';
      return ids.forEach((id) => useDiagramStore.getState().updateShape(id, (d) => ({ ...d, [key]: arg, ...(key === 'compKind' && (arg === 'provided' || arg === 'required') && !d.facing ? { facing: 'right' } : {}) })));
    }
    case 'uml-anchor-toggle': {
      ui.toggleUmlAnchorRows();
      return void toast.info(useUiStore.getState().umlAnchorRows ? 'Associations attach at the attribute row' : 'Associations attach at the class edge');
    }
    case 'uml-kind': return st.updateUml(targetEdges(), { kind: arg as UmlRelKind });
    case 'uml-directed': {
      const e = st.edges.find((x) => x.id === targetEdges()[0]);
      return e ? st.updateUml(targetEdges(), { directed: !(e.data?.uml as UmlRelationData | undefined)?.directed }) : undefined;
    }
    case 'uml-add-class': {
      const at = env.at ?? { x: 0, y: 0 };
      const node = blankClass(newId('n'), { x: at.x - 90, y: at.y - 60 }, (arg || 'class') as ClassKind);
      st.placeNodes([node]);
      return ui.setEditing(node.id);
    }
    case 'class-unlink': {
      if (!env.nodeId) return;
      return void (st.unlinkClass(env.nodeId) && toast.success(t('Unlinked: this copy is now independent')));
    }
    case 'class-link-refs': {
      if (!env.nodeId) return;
      const n = st.linkRefsToClass(env.nodeId);
      return void toast.info(n ? t('Linked {n} lifelines / objects to this class', { n }) : t('No lifeline or object has this class name'));
    }
    case 'class-add-attribute':
    case 'class-add-operation': {
      if (!env.nodeId) return;
      const kind = name === 'class-add-attribute' ? 'attribute' : 'operation';
      let memberId = '';
      st.updateClass(env.nodeId, (d) => { const n = addMember(d, kind); memberId = (kind === 'attribute' ? n.attributes : n.operations).at(-1)?.id ?? ''; return n; });
      if (memberId) useUiStore.getState().setMemberEdit({ nodeId: env.nodeId, memberId }); // the node opens the new member for inline editing
      return;
    }
    case 'class-kind': return (env.nodeId ? [env.nodeId] : selNodeIds()).forEach((id) => useDiagramStore.getState().updateClass(id, (d) => ({ ...d, kind: arg as ClassKind, accent: d.accent === KIND_ACCENT[d.kind] ? KIND_ACCENT[arg as ClassKind] : d.accent })));
    case 'class-toggle': return env.nodeId ? st.updateClass(env.nodeId, (d) => toggleCompartment(d, arg as 'attributes' | 'operations')) : undefined;
    case 'class-accent': return (env.nodeId ? [env.nodeId] : selNodeIds()).forEach((id) => useDiagramStore.getState().updateClass(id, (d) => ({ ...d, accent: arg })));
    case 'tidy-uml': {
      const n = st.tidyUml();
      return void (n ? toast.success(n === 1 ? t('Arranged {n} class', { n }) : t('Arranged {n} classes', { n })) : toast.info(t('No classes on this page')));
    }
    case 'uml-import': return void openUmlImport();
    case 'uml-export': return void openUmlExport();
    case 'marker-start': return st.updateEdges(targetEdges(), { startMarker: arg as never });
    case 'marker-end': return st.updateEdges(targetEdges(), { endMarker: arg as never });
    case 'reverse-edge': return env.edgeId ? st.reverseEdge(env.edgeId) : undefined;

    case 'fill':
    case 'stroke':
    case 'strokeStyle': {
      if (name === 'strokeStyle' && targetEdges().length) st.updateEdges(targetEdges(), { strokeStyle: arg as StrokeStyle }); // mixed selections style both
      if (hasEdgeSel()) return;
      const ids = selNodeIds();
      return ids.length ? st.updateNodesData(ids, { [name]: arg }) : undefined;
    }
    case 'color': return st.updateEdges(targetEdges(), { color: arg });
    case 'lineType': return st.updateEdges(targetEdges(), { lineType: arg as LineType });
    case 'arrows': return st.updateEdges(targetEdges(), { arrows: arg as Arrows });

    case 'add': {
      const at = env.at ?? { x: 0, y: 0 };
      const id = newId('n');
      const node =
        arg === 'group'
          ? createNodeFromPaletteItem(getItem('group')!, at, id)
          : createNodeForTool(arg as Tool, { x: at.x - 70, y: at.y - 45, width: 140, height: 90 }, id);
      if (!node) return;
      if (arg === 'group') node.position = { x: at.x - 160, y: at.y - 110 };
      return st.addNode(node);
    }

    case 'zoom-fit': return env.fitView?.();
    case 'export-png': return env.exportImage?.('png');
    case 'export-svg': return env.exportImage?.('svg');
    case 'toggle-grid': return ui.toggleGrid();
    case 'toggle-snap': return ui.toggleSnap();

    case 'rename-page': return useEditorSession.getState().readOnly ? undefined : void renamePageDialog(env.pageId ?? st.activePageId);
    case 'duplicate-page': return void st.duplicatePage(env.pageId ?? st.activePageId);
    case 'delete-page': return void deletePageDialog(env.pageId ?? st.activePageId);

    case 'project.open': return env.projectId ? env.project?.open(env.projectId) : undefined;
    case 'project.rename': return env.projectId && env.project?.canRename?.(env.projectId) !== false ? env.project?.rename(env.projectId) : undefined;
    case 'project.duplicate': return env.projectId ? env.project?.duplicate(env.projectId) : undefined;
    case 'project.export': return env.projectId ? env.project?.export?.(env.projectId) : undefined;
    case 'project.delete': return env.projectId ? env.project?.remove(env.projectId) : undefined;
    default:
      if (executeSmartAction(action)) return;
      if (executeDesignAction(action, { nodeId: env.nodeId, at: env.at })) return;
      executeBoardAction(action, { nodeId: env.nodeId, at: env.at });
      return;
  }
}
