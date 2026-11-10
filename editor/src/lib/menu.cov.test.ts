import { describe, expect, it } from 'vitest';
import { getMenuItems, flattenMenu, relKindsFor, type MenuContext, type MenuItem } from './menu';
import { useSmart } from '../store/smartStore';
import type { DiagramEdge, DiagramNode } from '../types';

const n = (id: string, type: string, data: Record<string, unknown> = {}, extra: Partial<DiagramNode> = {}): DiagramNode =>
  ({ id, type, position: { x: 0, y: 0 }, data: { label: id, ...data }, ...extra }) as DiagramNode;
const e = (id: string, source = 'a', target = 'b', extra: Partial<DiagramEdge> = {}): DiagramEdge => ({ id, source, target, ...extra }) as DiagramEdge;
const ctx = (over: Partial<MenuContext> = {}): MenuContext => ({ nodes: [], edges: [], hasClipboard: true, hasStyleClip: true, pageCount: 3, ...over });
const ids = (items: MenuItem[]) => flattenMenu(items).map((i) => i.id);
const find = (items: MenuItem[], id: string) => flattenMenu(items).find((i) => i.id === id);
const node = (x: DiagramNode) => getMenuItems({ type: 'node', id: x.id }, ctx({ nodes: [{ ...x, selected: true }] }));

describe('tab / project / pane menus', () => {
  it('tab: delete disabled for single page', () => {
    expect(find(getMenuItems({ type: 'tab' }, ctx({ pageCount: 1 })), 'delete-page')!.disabled).toBe(true);
    expect(find(getMenuItems({ type: 'tab' }, ctx()), 'delete-page')!.disabled).toBe(false);
  });
  it('project: rename hidden when canRename false', () => {
    expect(ids(getMenuItems({ type: 'project' }, ctx({ canRename: false })))).not.toContain('project.rename');
    expect(ids(getMenuItems({ type: 'project' }, ctx()))).toContain('project.rename');
  });
  it('pane: paste-here follows clipboard; has uml and er', () => {
    const p = getMenuItems({ type: 'pane' }, ctx({ hasClipboard: false }));
    expect(find(p, 'paste-here')!.disabled).toBe(true);
    expect(ids(p)).toEqual(expect.arrayContaining(['uml-add-class', 'er-add-table', 'board-present', 'export-svg']));
  });
});

describe('edge menus', () => {
  const nodes = [n('a', 'class'), n('b', 'class')];
  it('plain edge: manual adds reset-route; locked shows unlock', () => {
    const items = getMenuItems({ type: 'edge', id: 'x' }, ctx({ nodes, edges: [e('x', 'a', 'b', { data: { manual: true, locked: true } })] }));
    expect(ids(items)).toEqual(expect.arrayContaining(['reset-route', 'unlock', 'reverse-edge']));
  });
  it('plain edge without data: no reset-route, lock', () => {
    const items = getMenuItems({ type: 'edge', id: 'x' }, ctx({ nodes, edges: [e('x')] }));
    expect(ids(items)).toContain('lock');
    expect(ids(items)).not.toContain('reset-route');
  });
  it('unknown edge id still builds menu', () => {
    expect(ids(getMenuItems({ type: 'edge', id: 'nope' }, ctx()))).toContain('delete');
  });
  it('uml association between classes: relationship + navigable', () => {
    const items = getMenuItems({ type: 'edge', id: 'x' }, ctx({ nodes, edges: [e('x', 'a', 'b', { data: { uml: { kind: 'association', directed: true } } })] }));
    expect(find(items, 'uml-kind:association')!.label.startsWith('✓')).toBe(true);
    expect(find(items, 'uml-directed')!.label).toMatch(/^✓/);
  });
  it('uml transition on activity: kinds limited, no navigable', () => {
    const nn = [n('a', 'activity'), n('b', 'activity')];
    const items = getMenuItems({ type: 'edge', id: 'x' }, ctx({ nodes: nn, edges: [e('x', 'a', 'b', { data: { uml: { kind: 'transition' } } })] }));
    expect(ids(items).filter((i) => i.startsWith('uml-kind:'))).toEqual(['uml-kind:transition', 'uml-kind:note']);
    expect(ids(items)).not.toContain('uml-directed');
  });
  it('uml edge with no kinds (object) has no relationship submenu', () => {
    const nn = [n('a', 'object'), n('b', 'object')];
    const items = getMenuItems({ type: 'edge', id: 'x' }, ctx({ nodes: nn, edges: [e('x', 'a', 'b', { data: { uml: { kind: 'link' } } })] }));
    expect(ids(items)).not.toContain('uml-rel');
  });
  it('er relation menu: cardinality, junction variants', () => {
    const mk = (rel: Record<string, unknown>) => getMenuItems({ type: 'edge', id: 'x' }, ctx({ nodes: [n('a', 'table'), n('b', 'table')], edges: [e('x', 'a', 'b', { data: { relation: rel } })] }));
    const nm = mk({ cardinality: 'N:M', optional: true, identifying: true });
    expect(find(nm, 'rel-card:N:M')!.label.startsWith('✓')).toBe(true);
    expect(ids(nm)).toContain('rel-junction');
    expect(ids(mk({ cardinality: 'N:M', via: 'j' }))).toContain('rel-nm-expand');
    expect(ids(mk({ cardinality: '1:N' }))).not.toContain('rel-junction');
  });
});

describe('relKindsFor', () => {
  const edge = e('x', 'a', 'b');
  const k = (a: DiagramNode, b: DiagramNode, cur = 'association' as never) => relKindsFor([a, b], edge, cur);
  it('by endpoint type', () => {
    expect(k(n('a', 'activity'), n('b', 'class'))).toEqual(['transition', 'note']);
    expect(k(n('a', 'class'), n('b', 'usecase'))).toContain('include');
    expect(k(n('a', 'object'), n('b', 'class'))).toEqual([]);
    expect(k(n('a', 'group', { variant: 'package' }), n('b', 'group', { variant: 'package' }))).toContain('merge');
    expect(k(n('a', 'deployment'), n('b', 'class'))).toContain('deploy');
    expect(k(n('a', 'class'), n('b', 'component'))).toEqual(['assembly', 'dependency']);
    expect(k(n('a', 'state'), n('b', 'state'), 'transition' as never)).toEqual([]);
    expect(k(n('a', 'class'), n('b', 'class')).length).toBeGreaterThan(3);
  });
});

describe('node menus by type', () => {
  it('sequence', () => {
    const it1 = node(n('a', 'sequence', { autonumber: true }));
    expect(find(it1, 'seq-numbering')!.label).toBe('✓ Number messages');
    expect(ids(it1)).toContain('seq-fragment:alt');
    expect(find(node(n('a', 'sequence')), 'seq-numbering')!.label).toBe('Number messages');
  });
  it('state: pseudo vs state', () => {
    expect(ids(node(n('a', 'state', { stateKind: 'state' })))).toContain('rename');
    const p = node(n('a', 'state', { stateKind: 'initial' }));
    expect(ids(p)).not.toContain('rename');
    expect(find(p, 'state-kind:initial')!.label.startsWith('✓')).toBe(true);
  });
  it('usecase actor vs usecase', () => {
    const a = node(n('a', 'usecase', { ucKind: 'actor' }));
    expect(find(a, 'rename')!.label).toBe('Rename actor');
    expect(ids(a)).not.toContain('uc-extension-point');
    const u = node(n('a', 'usecase', { ucKind: 'usecase' }));
    expect(find(u, 'rename')!.label).toBe('Rename use case');
    expect(ids(u)).toContain('uc-extension-point');
  });
  it('activity pseudo vs action', () => {
    expect(ids(node(n('a', 'activity', { actKind: 'initial' })))).not.toContain('rename');
    expect(ids(node(n('a', 'activity', { actKind: 'action' })))).toContain('rename');
  });
  it('deployment nested', () => {
    expect(ids(node(n('a', 'deployment', { depKind: 'node' })))).not.toContain('dep-unnest');
    expect(ids(node(n('a', 'deployment', { depKind: 'node' }, { parentId: 'p' })))).toContain('dep-unnest');
  });
  it('component interface vs component', () => {
    const i = node(n('a', 'component', { compKind: 'provided', facing: 'left' }));
    expect(find(i, 'shape-facing:left')!.label.startsWith('✓')).toBe(true);
    expect(ids(i)).not.toContain('comp-nest');
    const c = node(n('a', 'component', { compKind: 'component' }, { parentId: 'p' }));
    expect(ids(c)).toEqual(expect.arrayContaining(['comp-nest', 'comp-unnest', 'comp-port:provided']));
    expect(find(node(n('a', 'component', { compKind: 'required' })), 'shape-kind:required')!.label).toContain('socket');
  });
  it('timing, object', () => {
    expect(ids(node(n('a', 'timing')))).toContain('timing-add-change');
    expect(ids(node(n('a', 'object')))).toContain('comm-renumber');
  });
  it('class: enum / modelId / collapsed', () => {
    const en = node(n('a', 'class', { kind: 'enum', collapsedAttributes: true, collapsedOperations: true, modelId: 'm' }));
    expect(find(en, 'class-add-attribute')!.label).toBe('Add literal');
    expect(ids(en)).not.toContain('class-add-operation');
    expect(ids(en)).toContain('class-unlink');
    expect(find(en, 'class-toggle:attributes')!.label).toBe('Show attributes');
    const cl = node(n('a', 'class', { kind: 'abstract' }));
    expect(find(cl, 'class-kind:abstract')!.label).toBe('✓ Abstract class');
    expect(find(cl, 'class-toggle:operations')!.label).toBe('Collapse operations');
  });
  it('table: junction, collapsed', () => {
    const tables = [n('t', 'table', { collapsed: true, locked: true }, { selected: true })];
    const items = getMenuItems({ type: 'node', id: 't' }, ctx({ nodes: tables }));
    expect(find(items, 'table-collapse')!.label).toBe('Show all columns');
    expect(ids(items)).toContain('unlock');
    expect(ids(items)).not.toContain('rel-nm-show');
    const cols = [{ id: 'c1', name: 'a_id', type: 'int', pk: true }, { id: 'c2', name: 'b_id', type: 'int', pk: true }];
    const nodes = [n('t', 'table', { columns: cols }, { selected: true }), n('a', 'table'), n('b', 'table')];
    const edges = [
      e('e1', 't', 'a', { data: { relation: { cardinality: 'N:1', fromCol: 'c1', toCol: 'x' } } }),
      e('e2', 't', 'b', { data: { relation: { cardinality: 'N:1', fromCol: 'c2', toCol: 'y' } } }),
    ];
    const withJ = getMenuItems({ type: 'node', id: 't' }, ctx({ nodes, edges }));
    expect(ids(withJ)).toContain('rel-nm-show');
  });
  it('group variants', () => {
    const lane = node(n('g', 'group', { variant: 'lane', laneOrient: 'h' }));
    expect(find(lane, 'lane-orient:v')!.label).toMatch(/columns/);
    expect(find(node(n('g', 'group', { variant: 'lane' })), 'lane-orient:h')!.label).toMatch(/rows/);
    expect(ids(node(n('g', 'group', { variant: 'package' })))).toContain('pkg-nest');
    const comp = node(n('g', 'group', { variant: 'composite' }));
    expect(ids(comp)).toContain('state-self');
    expect(ids(comp)).toContain('repeat:3');
  });
  it('cluster: collapsed / profile', () => {
    const c = node(n('c', 'cluster', { collapsed: true, profileId: 'p' }));
    expect(find(c, 'toggle-collapse')!.label).toBe('Expand cluster');
    expect(ids(c)).toEqual(expect.arrayContaining(['edit-cluster', 'select-similar:preset']));
    expect(ids(c)).not.toContain('repeat:2');
    expect(find(node(n('c', 'cluster')), 'toggle-collapse')!.label).toBe('Collapse cluster');
  });
  it('board nodes', () => {
    expect(ids(node(n('s', 'sticky', { private: true })))).toEqual(expect.arrayContaining(['board-reveal']));
    expect(ids(node(n('s', 'sticky')))).not.toContain('board-reveal');
    expect(ids(node(n('f', 'frame')))).toContain('board-zoom-frame');
    expect(find(node(n('m', 'mindmap', { collapsed: true })), 'board-mm-collapse')!.label).toBe('Expand branch');
    expect(find(node(n('m', 'mindmap')), 'board-mm-collapse')!.label).toBe('Collapse branch');
    expect(ids(node(n('d', 'draw')))).not.toContain('edit-label');
    expect(ids(node(n('d', 'stamp')))).not.toContain('edit-label');
  });
  it('icon with iconId offers same icon', () => {
    expect(ids(node(n('i', 'icon', { iconId: 'x' })))).toContain('select-similar:icon');
  });
});

describe('multi selection', () => {
  const sel = (arr: DiagramNode[], edges: DiagramEdge[] = []) => getMenuItems({ type: 'selection' }, ctx({ nodes: arr.map((x) => ({ ...x, selected: true })), edges }));
  it('two stickies + tables + edges', () => {
    const items = sel([n('a', 'sticky'), n('b', 'sticky')], [e('e1', 'a', 'b', { selected: true }), e('e2', 'a', 'b', { selected: true })]);
    expect(ids(items)).toEqual(expect.arrayContaining(['board-arrange:grid', 'merge-junction', 'auto-arrange:selection', 'layout-sel:tree', 'board-frame', 'fill:transparent']));
    expect(find(items, 'edges')!.label).toBe('Edges (2)');
    expect(find(items, 'distribute:horizontal')!.disabled).toBe(true);
    expect(find(items, 'align:left')!.disabled).toBe(false);
  });
  it('tables get tidy-er; only frames: no frame selection; locked all', () => {
    expect(ids(sel([n('a', 'table'), n('b', 'table'), n('c', 'table')]))).toContain('tidy-er');
    const fr = sel([n('a', 'frame', { locked: true }), n('b', 'frame', { locked: true })]);
    expect(ids(fr)).not.toContain('board-frame');
    expect(ids(fr)).toContain('unlock');
  });
  it('one node + two edges selected: no node-only layout, edges present, no node style', () => {
    const items = getMenuItems({ type: 'selection' }, ctx({ nodes: [n('a', 'icon', {}, { selected: true })], edges: [e('e1', 'a', 'b', { selected: true }), e('e2', 'a', 'b', { selected: true })] }));
    expect(ids(items)).not.toContain('auto-arrange:selection');
    expect(find(items, 'match-size')!.disabled).toBe(true);
    expect(find(items, 'group')!.disabled).toBe(false);
  });
  it('edges only selection: nodes empty', () => {
    const items = getMenuItems({ type: 'selection' }, ctx({ edges: [e('e1', 'a', 'b', { selected: true }), e('e2', 'a', 'b', { selected: true })] }));
    expect(ids(items)).toContain('merge-junction');
    expect(ids(items)).not.toContain('fill:transparent');
    expect(find(items, 'group')!.disabled).toBe(true);
  });
});

describe('design / chaos submenus', () => {
  it('create-component / instance / main / layouts / link / hidden', () => {
    expect(ids(node(n('a', 'icon')))).toContain('create-component');
    const inst = ids(node(n('a', 'icon', { instance: true, link: 'x', autoLayout: { dir: 'row' }, hidden: true })));
    expect(inst).toEqual(expect.arrayContaining(['detach-instance', 'link-follow', 'toggle-hidden']));
    expect(inst).not.toContain('auto-layout');
    const main = node(n('a', 'icon', { componentMain: true, autoLayout: true }));
    expect(ids(main)).toContain('auto-layout:off');
    expect(find(main, 'toggle-hidden')!.label).toBe('Hide');
    expect(find(node(n('a', 'icon', { hidden: true })), 'toggle-hidden')).toBeDefined();
  });
  it('instance found through parent chain', () => {
    const nodes = [n('p', 'group', { instance: true }), n('a', 'icon', {}, { parentId: 'p', selected: true })];
    expect(ids(getMenuItems({ type: 'node', id: 'a' }, ctx({ nodes })))).toContain('detach-instance');
  });
  it('design target missing yields base menu; target by selection', () => {
    expect(ids(getMenuItems({ type: 'node', id: 'zz' }, ctx()))).not.toContain('design');
    const sel = getMenuItems({ type: 'selection' }, ctx({ nodes: [n('a', 'icon', {}, { selected: true }), n('b', 'icon', {}, { selected: true })] }));
    expect(ids(sel)).toContain('design');
  });
  it('chaos states', () => {
    useSmart.setState({ chaosNodes: { a: 'down', b: 'slow' } } as never);
    const a = node(n('a', 'icon'));
    expect(find(a, 'chaos-down:a')!.label).toBe('Bring back up');
    expect(find(a, 'chaos-slow:a')!.label).toMatch(/Slow down/);
    expect(find(node(n('b', 'card')), 'chaos-slow:b')!.label).toBe('Back to normal speed');
    useSmart.setState({ chaosNodes: {} } as never);
    expect(find(node(n('a', 'cluster')), 'chaos-down:a')!.label).toBe('Take down');
    expect(ids(node(n('a', 'shape')))).not.toContain('chaos');
  });
  it('design placed even when menu lacks delete (sequence has delete; group has delete) and no-delete fallback', () => {
    const items = getMenuItems({ type: 'node', id: 'a' }, ctx({ nodes: [n('a', 'icon', {}, { selected: true })] }));
    const di = items.findIndex((i) => i.id === 'design');
    expect(items[di + 2]?.id ?? items[di + 1]?.id).toBe('delete');
  });
});
