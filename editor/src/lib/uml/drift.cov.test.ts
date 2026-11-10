import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { applyUmlModel } from './apply';
import { computeDrift, driftKey, type ClassChange, type MemberChange, type RelChange } from './drift';
import { acceptChange } from './driftApply';
import { useDriftStore } from './driftStore';
import { newClassDef, type MemberDef, type UmlClassDef, type UmlModel } from './model';

const s = () => useDiagramStore.getState();
const attr = (name: string, type = 'string'): MemberDef => ({ visibility: '-', name, type });
const op = (name: string, n = 0): MemberDef => ({ visibility: '+', name, type: 'void', params: Array.from({ length: n }, (_, i) => ({ name: `p${i}` })) });
const cls = (name: string, extra: Partial<UmlClassDef> = {}): UmlClassDef => newClassDef(name, extra);
const seed = (m: UmlModel) => applyUmlModel(m, 'page');
const byLabel = (l: string) => s().nodes.find((n) => n.data.label === l)!;
const userData = (l: string) => byLabel(l).data as unknown as { label: string; kind: string; generics?: string; stereotype?: string; attributes: { id: string; name: string; type?: string }[]; operations: { id: string; name: string; params?: unknown[] }[] };

beforeEach(() => {
  s().reset();
  useDriftStore.getState().clear();
});

describe('computeDrift extra branches', () => {
  it('header differences: kind, generics, stereotype', () => {
    seed({ classes: [cls('A', { attributes: [attr('x')] })], relations: [] });
    const d = computeDrift(s().nodes, s().edges, { classes: [cls('A', { kind: 'interface', generics: 'T', stereotype: 'svc', attributes: [attr('x')] })], relations: [] });
    expect(d.classes[0].status).toBe('changed');
    expect(d.classes[0].header).toMatchObject({ kind: ['class', 'interface'], generics: [undefined, 'T'], stereotype: [undefined, 'svc'] });
    expect(d.isEmpty).toBe(false);
  });
  it('member field diffs: visibility, default, static, abstract, params', () => {
    seed({ classes: [cls('A', { attributes: [{ visibility: '-', name: 'x', type: 'int' }], operations: [{ visibility: '+', name: 'f', params: [{ name: 'a', type: 'int' }] }] })], relations: [] });
    const d = computeDrift(s().nodes, s().edges, { classes: [cls('A', { attributes: [{ visibility: '+', name: 'x', type: 'int', default: '1', static: true, abstract: true }], operations: [{ visibility: '+', name: 'f', params: [{ name: 'a', type: 'string' }] }] })], relations: [] });
    const m = d.classes[0].members;
    expect(m.find((x) => x.name === 'x')!.fields).toEqual(['visibility', 'default', 'static', 'abstract']);
    expect(m.find((x) => x.name === 'f')!.fields).toEqual(['params']);
  });
  it('external classes are not declared', () => {
    seed({ classes: [cls('A')], relations: [] });
    const d = computeDrift(s().nodes, s().edges, { classes: [cls('A'), cls('Ext', { external: true })], relations: [] });
    expect(d.isEmpty).toBe(true);
  });
  it('detects a rename (same members), keeping the node and reporting a name header', () => {
    seed({ classes: [cls('Old', { attributes: [attr('a'), attr('b'), attr('c')] }), cls('Other', { attributes: [attr('q')] })], relations: [] });
    const d = computeDrift(s().nodes, s().edges, { classes: [cls('New', { attributes: [attr('a'), attr('b'), attr('c')] }), cls('Other', { attributes: [attr('q')] })], relations: [] }, { removed: true });
    const c = d.classes.find((x) => x.name === 'New')!;
    expect(c.status).toBe('changed');
    expect(c.header.name).toEqual(['Old', 'New']);
    expect(c.nodeId).toBe(byLabel('Old').id);
    expect(d.classes.some((x) => x.status === 'removed')).toBe(false);
    // accepting renames the node in place
    expect(acceptChange({ class: c })).toBe(true);
    expect(userData('New').label).toBe('New');
    expect(s().nodes).toHaveLength(2);
  });
  it('no rename when kinds differ, evidence is thin or classes are empty', () => {
    seed({ classes: [cls('Old', { attributes: [attr('a'), attr('b')] }), cls('E1')], relations: [] });
    const d = computeDrift(s().nodes, s().edges, { classes: [cls('New', { kind: 'interface', attributes: [attr('a'), attr('b')] }), cls('E2')], relations: [] }, { removed: true });
    expect(d.classes.filter((c) => c.status === 'added').map((c) => c.name).sort()).toEqual(['E2', 'New']);
    expect(d.classes.filter((c) => c.status === 'removed').map((c) => c.name).sort()).toEqual(['E1', 'Old']);
    // low overlap
    s().reset();
    seed({ classes: [cls('Old', { attributes: [attr('a'), attr('b'), attr('c'), attr('d')] })], relations: [] });
    const d2 = computeDrift(s().nodes, s().edges, { classes: [cls('New', { attributes: [attr('a')] })], relations: [] });
    expect(d2.classes[0].status).toBe('added');
  });
  it('two candidates for one node: best match wins, the other is added', () => {
    seed({ classes: [cls('Old', { attributes: [attr('a'), attr('b'), attr('c')] })], relations: [] });
    const d = computeDrift(s().nodes, s().edges, { classes: [cls('Weak', { attributes: [attr('a'), attr('b'), attr('c'), attr('z')] }), cls('Best', { attributes: [attr('a'), attr('b'), attr('c')] })], relations: [] });
    expect(d.classes.find((c) => c.name === 'Best')!.status).toBe('changed');
    expect(d.classes.find((c) => c.name === 'Weak')!.status).toBe('added');
  });
  it('relations: stale hierarchy edges are removed, hand-drawn ones and notes are not', () => {
    seed({ classes: [cls('A'), cls('B'), cls('C')], relations: [{ from: 'A', to: 'B', kind: 'inheritance' }, { from: 'A', to: 'C', kind: 'association' }, { from: 'B', to: 'C', kind: 'dependency' }] });
    const a = byLabel('A'), c = byLabel('C');
    s().addUmlEdge(a.id, c.id, { kind: 'note' });
    const d = computeDrift(s().nodes, s().edges, { classes: [cls('A'), cls('B'), cls('C')], relations: [{ from: 'A', to: 'C', kind: 'note' }] });
    expect(d.relations).toHaveLength(1);
    expect(d.relations[0]).toMatchObject({ status: 'removed', rel: { from: 'A', to: 'B', kind: 'inheritance' } });
    expect(d.relations[0].edgeId).toBeTruthy();
  });
  it('removed edge to a class missing from the code needs opts.removed', () => {
    seed({ classes: [cls('A'), cls('Gone')], relations: [{ from: 'A', to: 'Gone', kind: 'realization' }] });
    const code = { classes: [cls('A')], relations: [] };
    expect(computeDrift(s().nodes, s().edges, code).relations).toEqual([]);
    expect(computeDrift(s().nodes, s().edges, code, { removed: true }).relations).toHaveLength(1);
  });
  it('added relation to a class that is on canvas but not declared in code', () => {
    seed({ classes: [cls('A'), cls('B')], relations: [] });
    const d = computeDrift(s().nodes, s().edges, { classes: [cls('A')], relations: [{ from: 'A', to: 'B', kind: 'association' }, { from: 'A', to: 'Nope', kind: 'association' }, { from: 'Z', to: 'A', kind: 'association' }] });
    expect(d.relations.map((r) => r.rel.to)).toEqual(['B']);
  });
  it('relations of a renamed class are compared under the new name', () => {
    seed({ classes: [cls('Old', { attributes: [attr('a'), attr('b')] }), cls('P')], relations: [{ from: 'Old', to: 'P', kind: 'inheritance' }] });
    const d = computeDrift(s().nodes, s().edges, { classes: [cls('New', { attributes: [attr('a'), attr('b')] }), cls('P')], relations: [{ from: 'New', to: 'P', kind: 'inheritance' }] });
    expect(d.relations).toEqual([]);
  });
});

describe('driftKey', () => {
  const c = { name: 'A', status: 'added' } as ClassChange;
  it('builds distinct keys', () => {
    expect(driftKey({ class: c })).toBe('c:A:added');
    expect(driftKey({ class: c, member: { key: 'a:x' } as MemberChange })).toBe('m:A:a:x');
    expect(driftKey({ relation: { key: 'A>B:inheritance', status: 'removed' } as RelChange })).toBe('r:A>B:inheritance:removed');
  });
});

describe('acceptChange edge cases', () => {
  it('relation removed without edge id fails; with id deletes', () => {
    expect(acceptChange({ relation: { key: 'k', status: 'removed', rel: { from: 'A', to: 'B', kind: 'inheritance' } } })).toBe(false);
    seed({ classes: [cls('A'), cls('B')], relations: [{ from: 'A', to: 'B', kind: 'inheritance' }] });
    const e = s().edges[0];
    expect(acceptChange({ relation: { key: 'k', status: 'removed', rel: { from: 'A', to: 'B', kind: 'inheritance' }, edgeId: e.id } })).toBe(true);
    expect(s().edges).toHaveLength(0);
  });
  it('relation added needs both classes; carries multiplicity / roles / directed', () => {
    const rel = { from: 'A', to: 'B', kind: 'association' as const, directed: true, fromMult: '1', toMult: '*', fromRole: 'owner', toRole: 'items' };
    expect(acceptChange({ relation: { key: 'k', status: 'added', rel } })).toBe(false);
    seed({ classes: [cls('A'), cls('B')], relations: [] });
    expect(acceptChange({ relation: { key: 'k', status: 'added', rel } })).toBe(true);
    expect((s().edges[0].data as { uml: unknown }).uml).toMatchObject({ kind: 'association', directed: true, sourceMult: '1', targetMult: '*', sourceRole: 'owner', targetRole: 'items' });
  });
  it('removed class missing from canvas fails; changed class without node/after fails', () => {
    expect(acceptChange({ class: { name: 'X', status: 'removed', header: {}, members: [] } })).toBe(false);
    expect(acceptChange({ class: { name: 'X', status: 'changed', header: {}, members: [] } })).toBe(false);
    seed({ classes: [cls('X')], relations: [] });
    expect(acceptChange({ class: { name: 'X', status: 'changed', header: {}, members: [] } })).toBe(false);
    expect(acceptChange({ class: { name: 'X', status: 'added', header: {}, members: [] } })).toBe(false);
  });
  it('removed class with a node deletes it', () => {
    seed({ classes: [cls('X')], relations: [] });
    expect(acceptChange({ class: { name: 'X', status: 'removed', nodeId: byLabel('X').id, header: {}, members: [] } })).toBe(true);
    expect(s().nodes).toHaveLength(0);
  });
  it('member changes: no node fails; add op gets params; remove; change keeps id; unknown shapes are no-ops', () => {
    const ch = (status: ClassChange['status']): ClassChange => ({ name: 'X', status, header: {}, members: [] });
    expect(acceptChange({ class: ch('changed'), member: { comp: 'attributes', key: 'a:y', name: 'y', status: 'added', fields: [] } })).toBe(false);
    seed({ classes: [cls('X', { attributes: [attr('y', 'int')], operations: [op('f')] })], relations: [] });
    const before = userData('X');
    expect(acceptChange({ class: ch('changed'), member: { comp: 'operations', key: 'o:g/0', name: 'g', status: 'added', after: { visibility: '+', name: 'g' }, fields: [] } })).toBe(true);
    expect(userData('X').operations.map((o) => o.name)).toEqual(['f', 'g']);
    expect(userData('X').operations[1].params).toEqual([]);
    expect(acceptChange({ class: ch('changed'), member: { comp: 'attributes', key: 'a:y', name: 'y', status: 'changed', before: before.attributes[0] as never, after: attr('y', 'long'), fields: ['type'] } })).toBe(true);
    expect(userData('X').attributes[0]).toMatchObject({ id: before.attributes[0].id, type: 'long' });
    expect(acceptChange({ class: ch('changed'), member: { comp: 'operations', key: 'o:f/0', name: 'f', status: 'removed', before: before.operations[0] as never, fields: [] } })).toBe(true);
    expect(userData('X').operations.map((o) => o.name)).toEqual(['g']);
    const snapshot = JSON.stringify(userData('X'));
    expect(acceptChange({ class: ch('changed'), member: { comp: 'attributes', key: 'a:q', name: 'q', status: 'removed', fields: [] } })).toBe(true);
    expect(JSON.stringify(userData('X'))).toBe(snapshot);
  });
  it('a class found by name when nodeId is stale', () => {
    seed({ classes: [cls('X', { attributes: [attr('a')] })], relations: [] });
    expect(acceptChange({ class: { name: 'X', nodeId: 'stale', status: 'changed', header: {}, members: [] }, member: { comp: 'attributes', key: 'a:b', name: 'b', status: 'added', after: attr('b'), fields: [] } })).toBe(true);
    expect(userData('X').attributes.map((a) => a.name)).toEqual(['a', 'b']);
  });
});

describe('drift store', () => {
  const st = () => useDriftStore.getState();
  const v2: UmlModel = { classes: [cls('A', { attributes: [attr('x'), attr('y')], operations: [op('run')] }), cls('New', { attributes: [attr('n')] })], relations: [{ from: 'New', to: 'A', kind: 'inheritance' }] };
  const v1: UmlModel = { classes: [cls('A', { attributes: [attr('x', 'int'), attr('gone')] }), cls('Old', { attributes: [attr('zz')] })], relations: [] };

  it('refresh without code is a no-op; start computes and clear resets', () => {
    st().refresh();
    expect(st().drift).toBeNull();
    expect(st().visible()).toBeNull();
    expect(st().marksFor('nope')).toMatchObject({ count: 0, ghosts: [] });
    st().rejectAll();
    expect(st().dismissed.size).toBe(0);
    seed(v1);
    st().start(v2, 'src.ts', { removed: true });
    expect(st().drift!.isEmpty).toBe(false);
    expect(st().source).toBe('src.ts');
    st().clear();
    expect(st()).toMatchObject({ code: null, drift: null, source: '' });
  });
  it('start twice replaces the subscription; the review follows canvas edits', () => {
    seed(v1);
    st().start(v2, 's');
    st().start(v2, 's2', { removed: true });
    expect(st().source).toBe('s2');
    const before = st().drift;
    s().updateClass(byLabel('A').id, (d) => ({ ...d, label: 'A' }));
    expect(st().drift).not.toBe(before);
  });
  it('marksFor: removed class, changed class (ghost rows, member ids, header count), same class', () => {
    seed(v1);
    st().start(v2, 's', { removed: true });
    const a = st().marksFor(byLabel('A').id);
    expect(a.classStatus).toBe('changed');
    expect(a.ghosts).toEqual(expect.arrayContaining([{ comp: 'attributes', text: '- y: string' }, { comp: 'operations', text: '+ run(): void' }]));
    expect(a.byMemberId.size).toBe(2); // x changed, gone removed
    expect(a.members.get('a:gone')).toBe('removed');
    expect(a.count).toBe(4);
    const old = st().marksFor(byLabel('Old').id);
    expect(old).toMatchObject({ classStatus: 'removed', count: 1 });
    st().clear();
    seed({ classes: [cls('S')], relations: [] });
    st().start({ classes: [cls('S')], relations: [] }, 's');
    expect(st().marksFor(byLabel('S').id).count).toBe(0);
  });
  it('marksFor counts a header-only change', () => {
    seed({ classes: [cls('S')], relations: [] });
    st().start({ classes: [cls('S', { generics: 'T' })], relations: [] }, 's');
    const m = st().marksFor(byLabel('S').id);
    expect(m).toMatchObject({ classStatus: 'changed', count: 1 });
  });
  it('reject hides items; visible filters classes by status', () => {
    seed(v1);
    st().start(v2, 's', { removed: true });
    const all = st().visible()!;
    expect(all.classes.map((c) => c.status).sort()).toEqual(['added', 'changed', 'removed']);
    const add = all.classes.find((c) => c.status === 'added')!;
    st().reject(driftKey({ class: add }));
    st().reject(driftKey({ class: all.classes.find((c) => c.status === 'removed')! }));
    st().reject(driftKey({ relation: all.relations[0] }));
    const v = st().visible()!;
    expect(v.classes.map((c) => c.status)).toEqual(['changed']);
    expect(v.relations).toEqual([]);
    // dismiss every member of the changed class: only its header remains (none) -> class disappears
    const ch = v.classes[0];
    for (const m of ch.members) st().reject(driftKey({ class: ch, member: m }));
    expect(st().visible()!.classes).toEqual([]);
    expect(st().visible()!.isEmpty).toBe(true);
  });
  it('a changed class with only a header change stays unless that header is rejected', () => {
    seed({ classes: [cls('S')], relations: [] });
    st().start({ classes: [cls('S', { generics: 'T' })], relations: [] }, 's');
    const c = st().visible()!.classes[0];
    expect(c.members).toEqual([]);
    st().reject(driftKey({ class: c }));
    expect(st().visible()!.classes).toEqual([]);
  });
  it('accept applies one item and refreshes', () => {
    seed(v1);
    st().start(v2, 's');
    const n = st().visible()!.classes.find((c) => c.status === 'added')!;
    st().accept({ class: n });
    expect(s().nodes.some((x) => x.data.label === 'New')).toBe(true);
    expect(st().drift!.classes.find((c) => c.name === 'New')!.status).toBe('same');
  });
  it('rejectAll dismisses everything visible; "same" classes stay', () => {
    seed(v1);
    st().start(v2, 's', { removed: true });
    st().rejectAll();
    const v = st().visible()!;
    expect(v.isEmpty).toBe(true);
    expect(v.relations).toEqual([]);
  });
  it('acceptAll converges the canvas to the code (classes, members, header, relations)', () => {
    seed({ classes: [cls('A', { attributes: [attr('x', 'int'), attr('gone')] }), cls('Old', { attributes: [attr('zz')] }), cls('H')], relations: [] });
    const code: UmlModel = { classes: [cls('A', { attributes: [attr('x'), attr('y')], operations: [op('run')] }), cls('New', { attributes: [attr('n')] }), cls('H', { generics: 'T' })], relations: [{ from: 'New', to: 'A', kind: 'inheritance' }] };
    st().start(code, 's', { removed: true });
    st().acceptAll();
    expect(s().nodes.map((n) => n.data.label).sort()).toEqual(['A', 'H', 'New']);
    expect(userData('A').attributes.map((a) => a.name)).toEqual(['x', 'y']);
    expect(userData('H').generics).toBe('T');
    expect(s().edges).toHaveLength(1);
    expect(st().drift!.isEmpty).toBe(true);
    st().acceptAll(); // nothing left: stops at once
    expect(st().drift!.isEmpty).toBe(true);
  });
  it('acceptAll with nothing started does nothing', () => {
    st().acceptAll();
    expect(st().drift).toBeNull();
  });
});
