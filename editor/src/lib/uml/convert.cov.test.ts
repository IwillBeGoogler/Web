import { describe, expect, it } from 'vitest';
import type { DiagramEdge } from '../../types';
import { diagramToModel, modelToDiagram } from './convert';
import { umlEdge } from './edges';
import { newClassDef, type UmlClassDef, type UmlModel } from './model';

const c = (name: string, extra: Partial<UmlClassDef> = {}) => newClassDef(name, extra);

describe('modelToDiagram', () => {
  it('assigns ids with prefix; operations without params get []; attribute ids a<i>', () => {
    const m: UmlModel = { classes: [c('A', { attributes: [{ visibility: '-', name: 'x' }], operations: [{ visibility: '+', name: 'f' }] })], relations: [] };
    const d = modelToDiagram(m, { prefix: 'p_' });
    expect(d.nodes[0].id).toBe('p_cls_0');
    const data = d.nodes[0].data as any;
    expect(data.attributes[0]).toMatchObject({ id: 'a0', name: 'x' });
    expect(data.attributes[0].params).toBeUndefined();
    expect(data.operations[0]).toMatchObject({ id: 'o0', params: [] });
  });
  it('keeps generics, stereotype, package on node data', () => {
    const d = modelToDiagram({ classes: [c('A', { generics: 'T', stereotype: 'svc', package: 'p' })], relations: [] }, { layout: false });
    expect(d.nodes[0].data).toMatchObject({ generics: 'T', stereotype: 'svc', package: 'p', label: 'A' });
    expect(d.nodes.every((n) => n.type === 'class')).toBe(true);
  });
  it('relations: skips unknown ends; maps mults/roles/label/directed; links association to attribute row', () => {
    const m: UmlModel = {
      classes: [
        c('A', { attributes: [{ visibility: '-', name: 'items', type: 'List<B>' }, { visibility: '-', name: 'other', type: 'int' }] }),
        c('B'),
      ],
      relations: [
        { from: 'A', to: 'B', kind: 'association', toRole: 'items', fromRole: 'owner', fromMult: '1', toMult: '*', directed: true, label: 'has' },
        { from: 'A', to: 'B', kind: 'association', toRole: 'other' },
        { from: 'A', to: 'B', kind: 'association', toRole: 'missing' },
        { from: 'A', to: 'Ghost', kind: 'inheritance' },
        { from: 'Ghost', to: 'B', kind: 'inheritance' },
      ],
    };
    const d = modelToDiagram(m);
    expect(d.edges).toHaveLength(3);
    const u = (i: number) => d.edges[i].data!.uml as any;
    expect(u(0)).toMatchObject({ kind: 'association', sourceMember: 'a0', directed: true, sourceMult: '1', targetMult: '*', sourceRole: 'owner', targetRole: 'items' });
    expect(d.edges[0].label).toBe('has');
    expect(u(1).sourceMember).toBeUndefined();
    expect(u(2).sourceMember).toBeUndefined();
    expect(d.edges.map((e) => e.id)).toEqual(['rel_0', 'rel_1', 'rel_2']);
  });
  it('association with attribute lacking a type does not link', () => {
    const d = modelToDiagram({ classes: [c('A', { attributes: [{ visibility: '-', name: 'b' }] }), c('B')], relations: [{ from: 'A', to: 'B', kind: 'association', toRole: 'b' }] });
    expect((d.edges[0].data!.uml as any).sourceMember).toBeUndefined();
  });
  it('layout:false skips layout and package groups', () => {
    const d = modelToDiagram({ classes: [c('A', { package: 'p' }), c('B', { package: 'p' })], relations: [] }, { layout: false });
    expect(d.nodes.some((n) => n.type === 'group')).toBe(false);
    expect(d.nodes[0].position).toEqual({ x: 0, y: 0 });
  });
  it('no packages: no groups', () => {
    expect(modelToDiagram({ classes: [c('A')], relations: [] }).nodes.some((n) => n.type === 'group')).toBe(false);
  });
  it('clean package gets a group and children become relative', () => {
    const d = modelToDiagram({ classes: [c('A', { package: 'p' }), c('B', { package: 'p' })], relations: [] });
    const g = d.nodes.filter((n) => n.type === 'group');
    expect(g).toHaveLength(1);
    expect(g[0].data).toMatchObject({ label: 'p', variant: 'package' });
    const kids = d.nodes.filter((n) => n.parentId === g[0].id);
    expect(kids).toHaveLength(2);
    expect(d.nodes[0].id).toBe('pkg_0');
  });
  it('interleaved packages swallow each other: no groups at all', () => {
    const d = modelToDiagram({ classes: [c('A1', { package: 'a' }), c('B1', { package: 'b' }), c('A2', { package: 'a' })], relations: [] });
    expect(d.nodes.filter((n) => n.type === 'group')).toHaveLength(0);
    expect(d.nodes.every((n) => !n.parentId)).toBe(true);
  });
  it('a box swallowing an unpackaged class is dropped; clean ones stay', () => {
    const d = modelToDiagram({ classes: [c('A1', { package: 'a' }), c('Z'), c('A2', { package: 'a' }), c('P1', { package: 'p' })], relations: [{ from: 'P1', to: 'A1', kind: 'inheritance' }] });
    const labels = d.nodes.filter((n) => n.type === 'group').map((n) => n.data.label);
    expect(labels).not.toContain('a');
  });
  it('one package dropped, another kept (partial ok)', () => {
    const d = modelToDiagram({
      classes: [c('A1', { package: 'a' }), c('Z'), c('A2', { package: 'a' }), c('P1', { package: 'p' }), c('P2', { package: 'p' })],
      relations: [{ from: 'P1', to: 'A1', kind: 'inheritance' }, { from: 'P2', to: 'A1', kind: 'inheritance' }],
    });
    const labels = d.nodes.filter((n) => n.type === 'group').map((n) => n.data.label);
    expect(labels).toEqual(['p']);
  });
});

describe('diagramToModel', () => {
  it('round-trips classes, members (ids stripped), package, generics, stereotype and relations', () => {
    const m: UmlModel = {
      classes: [
        c('A', { generics: 'T', stereotype: 'svc', package: 'p', attributes: [{ visibility: '-', name: 'x', type: 'int' }], operations: [{ visibility: '+', name: 'f', params: [] }] }),
        c('B', { package: 'p' }),
      ],
      relations: [{ from: 'A', to: 'B', kind: 'association', directed: true, fromMult: '1', toMult: '*', fromRole: 'r1', toRole: 'r2', label: 'uses' }],
    };
    const d = modelToDiagram(m);
    const back = diagramToModel(d.nodes, d.edges);
    expect(back.classes.map((x) => x.name)).toEqual(['A', 'B']);
    expect(back.classes[0]).toMatchObject({ generics: 'T', stereotype: 'svc', package: 'p' });
    expect(back.classes[0].attributes[0]).toEqual({ visibility: '-', name: 'x', type: 'int' });
    expect(back.relations).toEqual([{ from: 'A', to: 'B', kind: 'association', directed: true, fromMult: '1', toMult: '*', fromRole: 'r1', toRole: 'r2', label: 'uses' }]);
  });
  it('package taken from parent group when class has none; omitted otherwise', () => {
    const d = modelToDiagram({ classes: [c('A', { package: 'p' }), c('B', { package: 'p' })], relations: [] });
    const nodes = d.nodes.map((n) => (n.type === 'class' ? { ...n, data: { ...n.data, package: undefined } } : n));
    expect(diagramToModel(nodes, []).classes.map((x) => x.package)).toEqual(['p', 'p']);
    const free = modelToDiagram({ classes: [c('A')], relations: [] });
    expect(diagramToModel(free.nodes, []).classes[0]).not.toHaveProperty('package');
    // parent that is not a package group
    const orphan = free.nodes.map((n) => ({ ...n, parentId: 'nowhere' }));
    expect(diagramToModel(orphan, []).classes[0].package).toBeUndefined();
  });
  it('skips note edges, non-uml edges, edges to non-class nodes; ignores non-string labels', () => {
    const d = modelToDiagram({ classes: [c('A'), c('B')], relations: [] });
    const [a, b] = d.nodes.map((n) => n.id);
    const edges: DiagramEdge[] = [
      umlEdge('n', a, b, { kind: 'note' }),
      { id: 'plain', source: a, target: b } as DiagramEdge,
      umlEdge('x', a, 'zzz', { kind: 'dependency' }),
      umlEdge('ok', a, b, { kind: 'dependency' }, { label: 5 as unknown as string }),
    ];
    const r = diagramToModel(d.nodes, edges).relations;
    expect(r).toEqual([{ from: 'A', to: 'B', kind: 'dependency' }]);
  });
});
