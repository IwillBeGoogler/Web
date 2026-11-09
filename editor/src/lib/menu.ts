import type { DiagramEdge, DiagramNode } from '../types';
import { FILL_PRESETS, STROKE_PRESETS } from './presets';
import { EDGE_COLORS } from '../types';
import { ROLES } from '../clusters/roles';
import { EDGE_KINDS } from '../clusters/edgeKinds';
import { allEdgePresets, type EdgePreset } from './edgePresets';
import { ACCENTS, relationOf } from './er/tableData';
import { findJunctions } from './er/junction';
import { umlOf, UML_REL_LABEL } from './uml/edges';
import { UML_REL_KINDS, type UmlRelKind } from './uml/types';
import { FRAGMENT_OPS } from './seq/types';
import { STATE_KINDS, stateKindLabel } from './state/types';
import { ACTIVITY_KINDS, ACTIVITY_LABEL, isPseudo, type ActivityKind } from './activity/types';
import { DEPLOYMENT_KINDS, DEPLOYMENT_LABEL, type DeploymentKind } from './deployment/types';
import { COMPONENT_KINDS } from './uml2/types';
import { STICKY_COLORS } from './board/sticky';
import { useSmart } from '../store/smartStore';

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  swatch?: string;
  children?: MenuItem[];
}
export type MenuTarget = { type: 'node' | 'edge' | 'pane' | 'tab' | 'project' | 'selection'; id?: string };
export interface MenuContext {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  hasClipboard: boolean;
  hasStyleClip: boolean;
  pageCount: number;
  /** project cards: the user may rename (default true) */
  canRename?: boolean;
  /** user-defined edge presets (settings) */
  userPresets?: EdgePreset[];
}

export const flattenMenu = (items: MenuItem[]): MenuItem[] => items.flatMap((i) => [i, ...(i.children ? flattenMenu(i.children) : [])]);

let sep = 0;
const SEP = (): MenuItem => ({ id: `sep-${++sep}`, label: '', separator: true });
const it = (id: string, label: string, extra: Partial<MenuItem> = {}): MenuItem => ({ id, label, ...extra });
const sub = (id: string, label: string, children: MenuItem[], extra: Partial<MenuItem> = {}): MenuItem => ({ id, label, children, ...extra });

const arrangeMenu = (): MenuItem =>
  sub('arrange', 'Arrange', [
    it('bring-front', 'Bring to front', { shortcut: '⇧⌘]' }),
    it('bring-forward', 'Bring forward', { shortcut: '⌘]' }),
    it('send-backward', 'Send backward', { shortcut: '⌘[' }),
    it('send-back', 'Send to back', { shortcut: '⇧⌘[' }),
  ]);

const colorChildren = (prefix: string, colors: readonly string[]): MenuItem[] =>
  colors.map((c) => it(`${prefix}:${c}`, c === 'transparent' ? 'None' : c, { swatch: c }));

const styleMenu = (): MenuItem =>
  sub('style', 'Style', [
    sub('style-fill', 'Fill', colorChildren('fill', FILL_PRESETS)),
    sub('style-stroke', 'Stroke', colorChildren('stroke', STROKE_PRESETS)),
    sub('style-line', 'Line', [it('strokeStyle:solid', 'Solid'), it('strokeStyle:dashed', 'Dashed'), it('strokeStyle:dotted', 'Dotted')]),
  ]);

const clipboardBlock = (hasClipboard: boolean, withPaste = true): MenuItem[] => [
  it('cut', 'Cut', { shortcut: '⌘X' }),
  it('copy', 'Copy', { shortcut: '⌘C' }),
  ...(withPaste ? [it('paste', 'Paste', { shortcut: '⌘V', disabled: !hasClipboard })] : []),
  it('duplicate', 'Duplicate', { shortcut: '⌘D' }),
];

const roleMenu = (): MenuItem =>
  sub('set-role', 'Set role', [
    ...ROLES.map((r) => it(`role:${r}`, r)),
    it('role:none', 'No role'),
    it('role-custom', 'Custom…'),
  ]);

const lockItem = (locked: boolean): MenuItem => it(locked ? 'unlock' : 'lock', locked ? 'Unlock' : 'Lock', { shortcut: '⇧⌘L' });
const del = (): MenuItem => it('delete', 'Delete', { shortcut: '⌫', danger: true });

/** relationship kinds a UML edge can switch between, by what it connects */
export function relKindsFor(nodes: DiagramNode[], e: DiagramEdge, current: UmlRelKind): UmlRelKind[] {
  const t = (id: string) => nodes.find((n) => n.id === id)?.type;
  const isPackageGroup = (ty: string | undefined, id: string) => ty === 'group' && nodes.find((n) => n.id === id)?.data.variant === 'package';
  const a = t(e.source), b = t(e.target);
  if (a === 'activity' || b === 'activity') return ['transition', 'note'];
  if (a === 'usecase' || b === 'usecase') return ['association', 'include', 'extend', 'generalization'];
  if (a === 'object' || b === 'object') return [];
  if (isPackageGroup(a, e.source) && isPackageGroup(b, e.target)) return ['import', 'access', 'merge', 'dependency'];
  if (a === 'deployment' || b === 'deployment') return ['communication', 'deploy', 'manifest'];
  if (a === 'component' || b === 'component') return ['assembly', 'dependency'];
  if (current === 'transition') return [];
  return UML_REL_KINDS;
}

/** the "Design" submenu: components, auto layout, layers, links (kept in one place so the menu stays short) */
function designMenu(target: MenuTarget, ctx: MenuContext): MenuItem | null {
  const sel = ctx.nodes.filter((n) => n.selected);
  const node = ctx.nodes.find((n) => n.id === target.id) ?? sel[0];
  if (!node) return null;
  const picked = sel.length ? sel : [node];
  const inInstance = (() => {
    let cur: DiagramNode | undefined = node;
    for (let i = 0; cur && i < 20; i++) {
      if (cur.data.instance && !cur.data.componentMain) return true;
      cur = cur.parentId ? ctx.nodes.find((n) => n.id === cur!.parentId) : undefined;
    }
    return false;
  })();
  const isMain = !!node.data.componentMain;
  const hidden = picked.every((n) => n.data.hidden);
  const kids: MenuItem[] = [];
  if (inInstance) kids.push(it('detach-instance', 'Detach instance'), it('go-to-main', 'Go to main component'), it('reset-overrides', 'Reset overrides'), SEP());
  else if (isMain) kids.push(it('go-to-main', 'Go to main component'), SEP());
  else kids.push(it('create-component', 'Create component'), SEP());
  const layoutable = picked.some((n) => !n.data.hidden);
  if (layoutable) {
    kids.push(
      sub('auto-layout', 'Auto layout', [
        it('auto-layout:row', 'Row'), it('auto-layout:column', 'Column'), it('auto-layout:grid', 'Grid'),
        ...(node.data.autoLayout ? [SEP(), it('auto-layout:off', 'Remove auto layout')] : []),
      ]),
    );
  }
  kids.push(it('toggle-hidden', hidden ? 'Show' : 'Hide'), it('layers-toggle', 'Layers panel'));
  if (node.data.link) kids.push(SEP(), it('link-follow', 'Follow link', { shortcut: '⌘ click' }));
  return sub('design', 'Design', kids);
}

function chaosMenu(target: MenuTarget, ctx: MenuContext): MenuItem | null {
  if (target.type !== 'node') return null;
  const node = ctx.nodes.find((n) => n.id === target.id);
  if (!node || !['icon', 'cluster', 'card'].includes(node.type ?? '')) return null;
  const ch = useSmart.getState().chaosNodes[node.id];
  return sub('chaos', 'Chaos', [it(`chaos-down:${node.id}`, ch === 'down' ? 'Bring back up' : 'Take down'), it(`chaos-slow:${node.id}`, ch === 'slow' ? 'Back to normal speed' : 'Slow down (x5 latency)')]);
}

export function getMenuItems(target: MenuTarget, ctx: MenuContext): MenuItem[] {
  const base = baseMenuItems(target, ctx);
  if (target.type !== 'node' && target.type !== 'selection') return base;
  const dm = designMenu(target, ctx);
  const cm = chaosMenu(target, ctx);
  const d = dm && cm ? [cm, dm] : dm ? [dm] : cm ? [cm] : null;
  if (!d) return base;
  const at = base.findIndex((i) => i.id === 'delete');
  if (at < 0) return [...base, SEP(), ...d];
  const sepBefore = at > 0 && base[at - 1].separator;
  return [...base.slice(0, sepBefore ? at - 1 : at), ...d, ...base.slice(sepBefore ? at - 1 : at)];
}

function baseMenuItems(target: MenuTarget, ctx: MenuContext): MenuItem[] {
  switch (target.type) {
    case 'tab':
      return [it('rename-page', 'Rename'), it('duplicate-page', 'Duplicate page'), it('delete-page', 'Delete page', { disabled: ctx.pageCount <= 1, danger: true })];
    case 'project':
      return [it('project.open', 'Open'), ...(ctx.canRename === false ? [] : [it('project.rename', 'Rename')]), it('project.duplicate', 'Duplicate'), it('project.export', 'Export project (.sdd)'), it('project.delete', 'Delete', { danger: true })];
    case 'pane':
      return [
        it('paste-here', 'Paste here', { disabled: !ctx.hasClipboard }),
        sub('add', 'Add', [
          it('add:rect', 'Rectangle'), it('add:ellipse', 'Ellipse'), it('add:diamond', 'Diamond'),
          it('add:text', 'Text'), it('add:sticky', 'Note'), it('add:group', 'Group'),
        ]),
        sub('board', 'Board', [
          it('board-sticky', 'Sticky note here'), it('board-frame', 'Frame here'), it('board-mindmap', 'Mind map here'),
          SEP(),
          it('board-frames', 'Frames…'), it('board-present', 'Present'), it('board-summon', 'Bring everyone to me'), it('show-help', 'Keyboard shortcuts', { shortcut: '?' }),
        ]),
        SEP(),
        sub('uml', 'UML', [
          it('uml-add-class', 'Add class'),
          it('uml-add-class:interface', 'Add interface'),
          it('uml-add:uml-sequence', 'Add sequence diagram'),
          it('uml-add:uml-state', 'Add state'),
          it('uml-add:uml-initial', 'Add initial state'),
          it('uml-add:uml-actor', 'Add actor'),
          it('uml-add:uml-usecase', 'Add use case'),
          it('uml-add:uml-act-action', 'Add activity action'),
          it('uml-add:uml-act-decision', 'Add activity decision'),
          it('uml-add:uml-act-lane-v', 'Add swimlane'),
          it('uml-add:uml-component', 'Add component'),
          it('uml-add:uml-dep-node', 'Add deployment node'),
          it('uml-add:uml-dep-artifact', 'Add deployment artifact'),
          it('uml-add:uml-package', 'Add package'),
          it('uml-add:uml-obj', 'Add object'),
          it('uml-import', 'Import code or diagram…'),
          it('uml-export', 'Export UML…'),
          it('tidy-uml', 'Tidy UML (auto-layout classes)'),
          it('tidy-state', 'Tidy states (auto-layout)'),
          it('tidy-usecase', 'Tidy use cases (auto-layout)'),
          it('tidy-activity', 'Tidy activity (auto-layout, lanes respected)'),
          it('tidy-component', 'Tidy components (auto-layout)'),
          it('tidy-deployment', 'Tidy deployment (auto-layout)'),
          it('tidy-packages', 'Tidy packages (layered by dependency)'),
          it('tidy-objects', 'Tidy objects (auto-layout)'),
          it('uml-anchor-toggle', 'Toggle: attach associations at attribute rows'),
        ]),
        sub('er', 'Database (ER)', [
          it('er-add-table', 'Add table'),
          it('er-import', 'Import schema…'),
          it('er-export', 'Export schema…'),
          it('tidy-er', 'Tidy ER (auto-layout tables)'),
          it('er-collapse-all', 'Collapse all tables (keys only)'),
          it('er-expand-all', 'Expand all tables'),
          it('er-sql-panel', 'Toggle live SQL preview'),
        ]),
        SEP(),
        it('select-all', 'Select all', { shortcut: '⌘A' }),
        it('auto-arrange:page', 'Auto layout page', { shortcut: '⇧L' }),
        it('tidy-edges', 'Re-route all edges'),
        it('zoom-fit', 'Zoom to fit', { shortcut: '⇧1' }),
        it('toggle-grid', 'Toggle grid'),
        it('toggle-snap', 'Toggle snap'),
        SEP(),
        it('export-png', 'Export page as PNG'),
        it('export-svg', 'Export page as SVG'),
      ];
    case 'edge': {
      const edge0 = ctx.edges.find((e) => e.id === target.id) ?? ({} as DiagramEdge);
      const rel = relationOf(edge0);
      const uml = umlOf(edge0);
      const kinds = uml ? relKindsFor(ctx.nodes, edge0, uml.kind) : [];
      return [
        ...(uml
          ? [
              ...(kinds.length ? [sub('uml-rel', 'Relationship', kinds.map((k) => it(`uml-kind:${k}`, `${uml.kind === k ? '✓ ' : ''}${UML_REL_LABEL[k]}`)))] : []),
              ...(uml.kind === 'association' && ctx.nodes.find((n) => n.id === edge0.source)?.type === 'class' ? [it('uml-directed', `${uml.directed ? '✓ ' : ''}Navigable (open arrow)`)] : []),
              ...(uml.kind === 'transition' && edge0.source !== edge0.target ? [] : []),
              ...(kinds.length || uml.kind === 'association' ? [SEP()] : []),
            ]
          : []),
        ...(rel
          ? [
              sub('rel-card', 'Cardinality', ([['1:1', 'One to one (1:1)'], ['1:N', 'One to many (1:N)'], ['N:1', 'Many to one (N:1)'], ['N:M', 'Many to many (N:M)']] as const).map(([c, l]) => it(`rel-card:${c}`, `${rel.cardinality === c ? '✓ ' : ''}${l}`))),
              it('rel-optional', `${rel.optional ? '✓ ' : ''}Optional (nullable key)`),
              it('rel-identifying', `${rel.identifying ? '✓ ' : ''}Identifying (solid line)`),
              ...(rel.cardinality === 'N:M' ? [rel.via ? it('rel-nm-expand', 'Show junction table') : it('rel-junction', 'Create junction table')] : []),
              SEP(),
            ]
          : []),
        it('edit-label', 'Edit label', { shortcut: 'F2' }),
        SEP(),
        sub('line-type', 'Line type', [it('lineType:orthogonal', 'Orthogonal (smart)'), it('lineType:step-rounded', 'Rounded steps'), it('lineType:straight', 'Straight'), it('lineType:curved', 'Curved')]),
        sub('edge-style', 'Style', [it('strokeStyle:solid', 'Solid'), it('strokeStyle:dashed', 'Dashed'), it('strokeStyle:dotted', 'Dotted')]),
        sub('arrowheads', 'Arrowheads', [it('arrows:none', 'None'), it('arrows:start', 'Start'), it('arrows:end', 'End'), it('arrows:both', 'Both')]),
        sub('edge-color', 'Color', EDGE_COLORS.map((c) => it(`color:${c.value}`, c.name, { swatch: c.value }))),
        sub('edge-preset', 'Preset', allEdgePresets(ctx.userPresets).map((p) => it(`preset:${p.id}`, p.name, { swatch: p.color }))),
        sub('label-side', 'Label position', [it('labelSide:auto', 'Beside vertical lines'), it('labelSide:on', 'On the line'), it('labelSide:left', 'Left of line'), it('labelSide:right', 'Right of line')]),
        sub('edge-kind', 'Cluster edge', [...EDGE_KINDS.map((k) => it(`edgeKind:${k}`, k[0].toUpperCase() + k.slice(1))), it('edgeKind:none', 'None')]),
        ...(ctx.edges.find((e) => e.id === target.id)?.data?.manual ? [it('reset-route', 'Reset route')] : []),
        it('reverse-edge', 'Reverse direction'),
        sub('similar', 'Select similar', [it('select-similar:preset', 'Same preset'), it('select-similar:type', 'All edges')]),
        SEP(),
        it('copy-style', 'Copy style', { shortcut: '⌥⌘C' }),
        it('paste-style', 'Paste style', { shortcut: '⌥⌘V', disabled: !ctx.hasStyleClip }),
        lockItem(!!ctx.edges.find((e) => e.id === target.id)?.data?.locked),
        SEP(),
        del(),
      ];
    }
    default:
      break;
  }

  const selected = ctx.nodes.filter((n) => n.selected);
  const total = selected.length + ctx.edges.filter((e) => e.selected).length;
  const node = ctx.nodes.find((n) => n.id === target.id);

  if (total > 1) {
    const nodeCount = selected.length;
    const anyLocked = [...selected, ...ctx.edges.filter((e) => e.selected)].every((x) => x.data?.locked);
    const align = (m: string, label: string) => it(`align:${m}`, label, { disabled: nodeCount < 2 });
    const stickies = selected.filter((x) => x.type === 'sticky').length;
    // kept short: the everyday actions stay on top, the rest is folded into Layout / Edges / Style
    const edgeCount = ctx.edges.filter((e) => e.selected).length;
    const layout: MenuItem[] = [
      ...(nodeCount >= 2 ? [it('auto-arrange:selection', 'Auto layout', { shortcut: '⇧L' })] : []),
      sub('align', 'Align', [align('left', 'Left'), align('center', 'Center'), align('right', 'Right'), align('top', 'Top'), align('middle', 'Middle'), align('bottom', 'Bottom')]),
      sub('distribute', 'Distribute', [
        it('distribute:horizontal', 'Horizontally', { disabled: nodeCount < 3 }),
        it('distribute:vertical', 'Vertically', { disabled: nodeCount < 3 }),
      ]),
      arrangeMenu(),
      ...(nodeCount >= 2 ? [sub('tidy-selection', 'Tidy selection', [it('layout-sel:layered', 'Layered'), it('layout-sel:grid', 'Compact grid'), it('layout-sel:tree', 'Tree'), it('layout-sel:radial', 'Radial'), it('layout-sel:force', 'Force-directed')])] : []),
      ...(selected.filter((n) => n.type === 'table').length >= 2 ? [it('tidy-er', 'Tidy ER (arrange selected tables)')] : []),
      ...(stickies >= 2 ? [it('board-arrange:grid', 'Arrange as grid'), it('board-arrange:color', 'Group by colour')] : []),
      ...(nodeCount >= 1 && selected.some((x) => x.type !== 'frame') ? [it('board-frame', 'Frame selection')] : []),
      it('match-size', 'Match size', { disabled: nodeCount < 2 }),
    ];
    const edges: MenuItem[] = [
      sub('line-type', 'Line type', [it('lineType:orthogonal', 'Orthogonal (smart)'), it('lineType:step-rounded', 'Rounded steps'), it('lineType:straight', 'Straight'), it('lineType:curved', 'Curved')]),
      sub('arrowheads', 'Arrowheads', [it('arrows:none', 'None'), it('arrows:start', 'Start'), it('arrows:end', 'End'), it('arrows:both', 'Both')]),
      sub('edge-color', 'Colour', EDGE_COLORS.map((c) => it(`color:${c.value}`, c.name, { swatch: c.value }))),
      sub('edge-preset-multi', 'Preset', allEdgePresets(ctx.userPresets).map((p) => it(`preset:${p.id}`, p.name, { swatch: p.color }))),
      ...(edgeCount >= 2 ? [it('merge-junction', 'Merge into junction')] : []),
    ];
    const style: MenuItem[] = [
      ...(selected.length ? styleMenu().children ?? [] : []),
      ...(selected.length ? [SEP()] : []),
      it('copy-style', 'Copy style', { shortcut: '⌥⌘C' }),
      it('paste-style', 'Paste style', { shortcut: '⌥⌘V', disabled: !ctx.hasStyleClip }),
      it('reset-style', 'Reset style'),
    ];
    return [
      ...clipboardBlock(ctx.hasClipboard, false),
      SEP(),
      it('group', 'Group', { shortcut: '⌘G', disabled: nodeCount < 1 }),
      it('wrap-cluster', 'Wrap in cluster', { shortcut: '⌥⌘G', disabled: nodeCount < 1 }),
      lockItem(anyLocked),
      SEP(),
      sub('layout', 'Layout', layout),
      ...(edgeCount ? [sub('edges', `Edges (${edgeCount})`, edges)] : []),
      sub('style-all', 'Style', style),
      SEP(),
      del(),
    ];
  }

  if (node?.type === 'sequence') {
    return [
      it('rename', 'Rename diagram', { shortcut: 'F2' }),
      it('seq-add-participant', 'Add participant'),
      it('seq-add-message', 'Add message'),
      it('seq-add-note', 'Add note'),
      sub('seq-fragment', 'Add fragment', FRAGMENT_OPS.map((o) => it(`seq-fragment:${o}`, o))),
      it('seq-numbering', node.data.autonumber ? '✓ Number messages' : 'Number messages'),
      it('seq-to-comm', 'Convert to communication diagram'),
      SEP(),
      it('uml-export', 'Export sequence diagram…'),
      it('uml-import', 'Import Mermaid / PlantUML…'),
      SEP(),
      ...clipboardBlock(ctx.hasClipboard),
      SEP(),
      arrangeMenu(),
      lockItem(!!node.data.locked),
      SEP(),
      del(),
    ];
  }

  if (node?.type === 'state') {
    const pseudo = node.data.stateKind !== 'state';
    return [
      ...(pseudo ? [] : [it('rename', 'Rename state', { shortcut: 'F2' })]),
      it('state-self', 'Add self transition'),
      sub('state-kind', 'Kind', STATE_KINDS.map((k) => it(`state-kind:${k}`, `${node.data.stateKind === k ? '✓ ' : ''}${stateKindLabel(k)}`))),
      sub('shape-accent', 'Colour', ACCENTS.map((c) => it(`shape-accent:${c}`, c, { swatch: c }))),
      SEP(),
      it('tidy-state', 'Tidy states (auto-layout)'),
      it('uml-export', 'Export state machine…'),
      SEP(),
      ...clipboardBlock(ctx.hasClipboard),
      SEP(),
      arrangeMenu(),
      lockItem(!!node.data.locked),
      SEP(),
      del(),
    ];
  }

  if (node?.type === 'usecase') {
    return [
      it('rename', node.data.ucKind === 'actor' ? 'Rename actor' : 'Rename use case', { shortcut: 'F2' }),
      sub('shape-kind', 'Shape', [it('shape-kind:actor', `${node.data.ucKind === 'actor' ? '✓ ' : ''}Actor`), it('shape-kind:usecase', `${node.data.ucKind === 'usecase' ? '✓ ' : ''}Use case`)]),
      sub('shape-accent', 'Colour', ACCENTS.map((c) => it(`shape-accent:${c}`, c, { swatch: c }))),
      SEP(),
      sub('relate', 'Connect to selected', (['association', 'include', 'extend', 'generalization'] as const).map((k) => it(`uml-connect:${k}`, UML_REL_LABEL[k]))),
      ...(node.data.ucKind === 'usecase' ? [it('uc-extension-point', 'Add extension point')] : []),
      SEP(),
      it('tidy-usecase', 'Tidy use cases (auto-layout)'),
      it('uml-export', 'Export use case diagram…'),
      SEP(),
      ...clipboardBlock(ctx.hasClipboard),
      SEP(),
      arrangeMenu(),
      lockItem(!!node.data.locked),
      SEP(),
      del(),
    ];
  }

  if (node?.type === 'activity') {
    const k = node.data.actKind as ActivityKind;
    return [
      ...(isPseudo(k) ? [] : [it('rename', 'Rename', { shortcut: 'F2' })]),
      sub('act-kind', 'Element', ACTIVITY_KINDS.map((x) => it(`act-kind:${x}`, `${k === x ? '✓ ' : ''}${ACTIVITY_LABEL[x]}`))),
      sub('shape-accent', 'Colour', ACCENTS.map((c) => it(`shape-accent:${c}`, c, { swatch: c }))),
      SEP(),
      it('uml-connect:transition', 'Connect to selected (control flow)'),
      SEP(),
      it('tidy-activity', 'Tidy activity (auto-layout)'),
      it('uml-export', 'Export activity diagram…'),
      SEP(),
      ...clipboardBlock(ctx.hasClipboard),
      SEP(),
      arrangeMenu(),
      lockItem(!!node.data.locked),
      SEP(),
      del(),
    ];
  }

  if (node?.type === 'deployment') {
    const k = node.data.depKind as DeploymentKind;
    return [
      it('rename', 'Rename', { shortcut: 'F2' }),
      sub('dep-kind', 'Kind', DEPLOYMENT_KINDS.map((x) => it(`dep-kind:${x}`, `${k === x ? '✓ ' : ''}${DEPLOYMENT_LABEL[x]}`))),
      sub('shape-accent', 'Colour', ACCENTS.map((c) => it(`shape-accent:${c}`, c, { swatch: c }))),
      SEP(),
      sub('relate', 'Connect to selected', (['communication', 'deploy', 'manifest'] as const).map((x) => it(`uml-connect:${x}`, UML_REL_LABEL[x]))),
      SEP(),
      it('dep-nest', 'Put into a new node'),
      ...(node.parentId ? [it('dep-unnest', 'Take out of its node')] : []),
      SEP(),
      it('tidy-deployment', 'Tidy deployment (auto-layout)'),
      it('uml-export', 'Export deployment diagram…'),
      SEP(),
      ...clipboardBlock(ctx.hasClipboard),
      SEP(),
      arrangeMenu(),
      lockItem(!!node.data.locked),
      SEP(),
      del(),
    ];
  }

  if (node?.type === 'component') {
    const iface = node.data.compKind === 'provided' || node.data.compKind === 'required';
    return [
      it('rename', 'Rename', { shortcut: 'F2' }),
      sub('shape-kind', 'Kind', COMPONENT_KINDS.map((k) => it(`shape-kind:${k}`, `${node.data.compKind === k ? '✓ ' : ''}${k === 'provided' ? 'Provided interface (lollipop)' : k === 'required' ? 'Required interface (socket)' : k[0].toUpperCase() + k.slice(1)}`))),
      ...(iface ? [sub('shape-facing', 'Facing', (['right', 'left', 'up', 'down'] as const).map((f) => it(`shape-facing:${f}`, `${node.data.facing === f ? '✓ ' : ''}${f[0].toUpperCase() + f.slice(1)}`)))] : []),
      sub('shape-accent', 'Colour', ACCENTS.map((c) => it(`shape-accent:${c}`, c, { swatch: c }))),
      SEP(),
      sub('relate', 'Connect to selected', (['assembly', 'dependency'] as const).map((k) => it(`uml-connect:${k}`, UML_REL_LABEL[k]))),
      ...(iface ? [] : [
        sub('comp-port', 'Add interface port', [it('comp-port:provided', 'Provided (lollipop)'), it('comp-port:required', 'Required (socket)')]),
        it('comp-nest', 'Put into a new node'),
        ...(node.parentId ? [it('comp-unnest', 'Take out of its node')] : []),
      ]),
      SEP(),
      it('tidy-component', 'Tidy components (auto-layout)'),
      it('uml-export', 'Export component diagram…'),
      SEP(),
      ...clipboardBlock(ctx.hasClipboard),
      SEP(),
      arrangeMenu(),
      lockItem(!!node.data.locked),
      SEP(),
      del(),
    ];
  }

  if (node?.type === 'timing') {
    return [
      it('rename', 'Rename diagram', { shortcut: 'F2' }),
      sub('timing-lifeline', 'Add lifeline', (['robust', 'concise', 'binary', 'clock'] as const).map((k) => it(`timing-add-lifeline:${k}`, k))),
      it('timing-add-change', 'Add state change'),
      it('timing-add-message', 'Add message'),
      it('timing-add-constraint', 'Add duration constraint'),
      it('tidy-timing', 'Tidy timing diagram'),
      SEP(),
      it('uml-export', 'Export timing diagram…'),
      it('uml-import', 'Import PlantUML…'),
      SEP(),
      ...clipboardBlock(ctx.hasClipboard),
      SEP(),
      arrangeMenu(),
      lockItem(!!node.data.locked),
      SEP(),
      del(),
    ];
  }

  if (node?.type === 'object') {
    return [
      it('rename', 'Rename object', { shortcut: 'F2' }),
      it('obj-add-slot', 'Add slot'),
      sub('shape-accent', 'Colour', ACCENTS.map((c) => it(`shape-accent:${c}`, c, { swatch: c }))),
      SEP(),
      sub('relate', 'Link to selected object', [it('uml-connect:link', UML_REL_LABEL.link)]),
      it('tidy-objects', 'Tidy objects (auto-layout)'),
      it('comm-add-message', 'Communication: add numbered message'),
      it('comm-renumber', 'Communication: renumber messages'),
      it('comm-to-seq', 'Communication: convert to sequence diagram'),
      it('uml-export', 'Export object diagram…'),
      SEP(),
      ...clipboardBlock(ctx.hasClipboard),
      SEP(),
      arrangeMenu(),
      lockItem(!!node.data.locked),
      SEP(),
      del(),
    ];
  }

  if (node?.type === 'class') {
    return [
      it('rename', 'Rename class', { shortcut: 'F2' }),
      it('class-add-attribute', node.data.kind === 'enum' ? 'Add literal' : 'Add attribute'),
      ...(node.data.kind === 'enum' ? [] : [it('class-add-operation', 'Add operation')]),
      sub('class-kind', 'Kind', (['class', 'interface', 'abstract', 'enum'] as const).map((k) => it(`class-kind:${k}`, `${node.data.kind === k ? '✓ ' : ''}${k === 'abstract' ? 'Abstract class' : k[0].toUpperCase() + k.slice(1)}`))),
      sub('class-toggle', 'Compartments', [it('class-toggle:attributes', node.data.collapsedAttributes ? 'Show attributes' : 'Collapse attributes'), it('class-toggle:operations', node.data.collapsedOperations ? 'Show operations' : 'Collapse operations')]),
      sub('class-accent', 'Header colour', ACCENTS.map((c) => it(`class-accent:${c}`, c, { swatch: c }))),
      SEP(),
      sub('relate', 'Connect to selected class', UML_REL_KINDS.filter((k) => k !== 'note').map((k) => it(`uml-connect:${k}`, UML_REL_LABEL[k]))),
      it('instantiate-class', 'Create object (instantiate)'),
      ...(node.data.modelId ? [it('class-unlink', 'Unlink from shared class')] : []),
      it('class-link-refs', 'Link lifelines and objects with this class name'),
      it('uml-export', 'Export UML…'),
      it('tidy-uml', 'Tidy UML (auto-layout)'),
      SEP(),
      ...clipboardBlock(ctx.hasClipboard),
      SEP(),
      arrangeMenu(),
      lockItem(!!node.data.locked),
      SEP(),
      del(),
    ];
  }

  if (node?.type === 'table') {
    return [
      it('rename', 'Rename table', { shortcut: 'F2' }),
      it('table-add-column', 'Add column'),
      ...(findJunctions(ctx.nodes, ctx.edges).some((j) => j.tableId === node.id) ? [it('rel-nm-show', 'Show as many-to-many (hide table)')] : []),
      it('er-select-related', 'Select related tables'),
      it('table-collapse', node.data.collapsed ? 'Show all columns' : 'Show keys only'),
      sub('table-accent', 'Header colour', ACCENTS.map((c) => it(`table-accent:${c}`, c, { swatch: c }))),
      SEP(),
      sub('table-export', 'Export as', [it('er-copy-sql', 'Copy CREATE TABLE (SQL)'), it('er-export', 'Export schema…')]),
      it('tidy-er', 'Tidy ER (auto-layout)'),
      SEP(),
      ...clipboardBlock(ctx.hasClipboard),
      SEP(),
      arrangeMenu(),
      lockItem(!!node.data.locked),
      SEP(),
      del(),
    ];
  }

  if (node?.type === 'group' || node?.type === 'cluster') {
    const isCluster = node.type === 'cluster';
    return [
      it('rename', 'Rename', { shortcut: 'F2' }),
      it('auto-arrange:inside', `Auto layout inside ${isCluster ? 'cluster' : 'group'}`, { shortcut: '⇧L' }),
      SEP(),
      ...clipboardBlock(ctx.hasClipboard),
      SEP(),
      ...(isCluster
        ? [
            it('toggle-collapse', node.data.collapsed ? 'Expand cluster' : 'Collapse cluster'),
            it('add-replica', 'Add replica'),
            ...(node.data.profileId ? [it('edit-cluster', 'Edit cluster…')] : []),
            SEP(),
          ]
        : []),
      ...(node.data.variant === 'lane' ? [it(`lane-orient:${node.data.laneOrient === 'h' ? 'v' : 'h'}`, node.data.laneOrient === 'h' ? 'Lanes as columns (flow top down)' : 'Lanes as rows (flow left to right)'), it('tidy-activity', 'Tidy activity (auto-layout)'), SEP()] : []),
      ...(node.data.variant === 'package' ? [sub('relate', 'Connect to selected package', (['import', 'access', 'merge', 'dependency'] as const).map((x) => it(`uml-connect:${x}`, UML_REL_LABEL[x]))), it('tidy-packages', 'Tidy packages (layered by dependency)'), it('pkg-nest', 'Put selection into a new package'), SEP()] : []),
      ...(node.data.variant === 'composite' ? [it('state-self', 'Add self transition'), it('tidy-state', 'Tidy states (auto-layout)'), SEP()] : []),
      ...(!isCluster ? [sub('repeat-group', 'Repeat group', [2, 3, 4, 5, 6, 8].map((n) => it(`repeat:${n}`, `${n} copies (name-1 … name-${n})`)))] : []),
      it('select-children', 'Select children'),
      sub('similar', 'Select similar', [it('select-similar:type', 'Same type'), ...(node.data.profileId ? [it('select-similar:preset', 'Same profile')] : [])]),
      it('ungroup', 'Ungroup (keep children)', { shortcut: '⇧⌘G' }),
      it('delete-group-only', 'Delete group only'),
      it('delete-group-with-children', 'Delete group with children', { danger: true }),
      lockItem(!!node.data.locked),
      arrangeMenu(),
    ];
  }

  const isIcon = node?.type === 'icon';
  const styled = node?.type === 'shape' || node?.type === 'sticky' || node?.type === 'draw';
  const boardItems: MenuItem[] =
    node?.type === 'sticky'
      ? [sub('board-color', 'Colour', STICKY_COLORS.map((c) => it(`board-color:${c.id}`, c.name, { swatch: c.fill }))), ...(node.data.private ? [it('board-reveal', 'Reveal')] : []), SEP()]
      : node?.type === 'frame'
      ? [it('board-present', 'Present from here'), it('board-zoom-frame', 'Zoom to frame'), it('board-frame-link', 'Copy link to frame'), SEP()]
      : node?.type === 'mindmap'
      ? [it('board-mm-child', 'Add child', { shortcut: 'Tab' }), it('board-mm-sibling', 'Add sibling', { shortcut: 'Enter' }), it('board-mm-collapse', node.data.collapsed ? 'Expand branch' : 'Collapse branch'), it('board-mm-layout', 'Auto-layout mind map'), it('board-mm-export', 'Copy outline (Markdown)'), SEP()]
      : [];
  return [
    ...(node?.type !== 'draw' && node?.type !== 'stamp' ? [it('edit-label', 'Edit label', { shortcut: 'F2' }), SEP()] : []),
    ...boardItems,
    ...clipboardBlock(ctx.hasClipboard),
    SEP(),
    it('copy-style', 'Copy style', { shortcut: '⌥⌘C' }),
    it('paste-style', 'Paste style', { shortcut: '⌥⌘V', disabled: !ctx.hasStyleClip }),
    ...(isIcon ? [it('change-icon', 'Change icon…')] : []),
    sub('similar', 'Select similar', [it('select-similar:type', 'Same type'), ...(node?.data.iconId ? [it('select-similar:icon', 'Same icon')] : [])]),
    it('reset-style', 'Reset style'),
    ...(styled ? [styleMenu()] : []),
    arrangeMenu(),
    SEP(),
    it('group', 'Group selection', { shortcut: '⌘G' }),
    it('wrap-cluster', 'Wrap selection in cluster', { shortcut: '⌥⌘G' }),
    roleMenu(),
    ...(node?.parentId ? [it('remove-from-group', 'Remove from group')] : []),
    lockItem(!!node?.data.locked),
    SEP(),
    del(),
  ];
}
