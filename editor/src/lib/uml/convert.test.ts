import { describe, expect, it } from 'vitest';
import { diagramToModel, modelToDiagram } from './convert';
import { emptyModel, newClassDef, type UmlModel } from './model';
import { classOf } from './geometry';
import { nodeSize } from '../graph';

const model = (): UmlModel => ({
  classes: [
    newClassDef('Animal', { kind: 'abstract', attributes: [{ visibility: '-', name: 'name', type: 'string' }], operations: [{ visibility: '+', name: 'speak', params: [], type: 'void', abstract: true }] }),
    newClassDef('Dog', { operations: [{ visibility: '+', name: 'speak', params: [] }] }),
    newClassDef('Speaker', { kind: 'interface', operations: [{ visibility: '+', name: 'speak', params: [] }] }),
    newClassDef('Owner', { generics: 'T' }),
    newClassDef('Color', { kind: 'enum', attributes: [{ visibility: '', name: 'RED' }] }),
  ],
  relations: [
    { from: 'Dog', to: 'Animal', kind: 'inheritance' },
    { from: 'Dog', to: 'Speaker', kind: 'realization' },
    { from: 'Owner', to: 'Dog', kind: 'association', directed: true, fromMult: '1', toMult: '0..*', toRole: 'pets', label: 'owns' },
    { from: 'Dog', to: 'Color', kind: 'dependency' },
  ],
});

describe('UML model <-> diagram', () => {
  const d = modelToDiagram(model());
  it('creates a sized class node per class and an edge per relation', () => {
    expect(d.nodes.filter((n) => n.type === 'class')).toHaveLength(5);
    expect(d.edges).toHaveLength(4);
    for (const n of d.nodes) expect(nodeSize(n).height).toBeGreaterThan(30);
    expect(new Set(d.nodes.map((n) => n.id)).size).toBe(5);
    const dog = d.nodes.find((n) => classOf(n).label === 'Dog')!;
    expect(classOf(dog).operations[0].id).toBe('o0');
  });
  it('relation edges carry kind, markers, multiplicities, roles and label', () => {
    const own = d.edges.find((e) => e.data?.uml?.kind === 'association')!;
    expect(own.data?.uml).toMatchObject({ directed: true, sourceMult: '1', targetMult: '0..*', targetRole: 'pets' });
    expect(own.label).toBe('owns');
    expect(own.data?.endMarker).toBe('open');
    expect(d.edges.find((e) => e.data?.uml?.kind === 'realization')!.data).toMatchObject({ endMarker: 'hollowTriangle', strokeStyle: 'dashed' });
  });
  it('is laid out with parents above children', () => {
    const y = (name: string) => d.nodes.find((n) => classOf(n).label === name)!.position.y;
    expect(y('Animal')).toBeLessThan(y('Dog'));
    expect(y('Speaker')).toBeLessThan(y('Dog'));
  });
  it('round-trips back to the same model', () => {
    const back = diagramToModel(d.nodes, d.edges);
    const m = model();
    expect(back.classes.map((c) => c.name).sort()).toEqual(m.classes.map((c) => c.name).sort());
    const dog = back.classes.find((c) => c.name === 'Dog')!;
    expect(dog.operations[0]).toMatchObject({ name: 'speak', visibility: '+' });
    expect(back.classes.find((c) => c.name === 'Animal')!).toMatchObject({ kind: 'abstract', attributes: [{ name: 'name', type: 'string', visibility: '-' }] });
    expect(back.classes.find((c) => c.name === 'Owner')!.generics).toBe('T');
    expect(back.relations).toEqual(expect.arrayContaining(m.relations.map((r) => expect.objectContaining(r))));
    expect(back.relations).toHaveLength(4);
  });
  it('ignores notes and non-UML nodes, and an empty model gives an empty diagram', () => {
    expect(modelToDiagram(emptyModel())).toEqual({ version: 1, nodes: [], edges: [] });
    const m = diagramToModel([...d.nodes, { id: 't', type: 'text', position: { x: 0, y: 0 }, data: { label: 'x' } }], d.edges);
    expect(m.classes).toHaveLength(5);
  });
  it('unknown relation endpoints are skipped', () => {
    const m = model();
    m.relations.push({ from: 'Nope', to: 'Dog', kind: 'association' });
    expect(modelToDiagram(m).edges).toHaveLength(4);
  });
  it('options: prefix keeps ids unique, layout false keeps origin positions', () => {
    const x = modelToDiagram(model(), { prefix: 'p2_', layout: false });
    expect(x.nodes.every((n) => n.id.startsWith('p2_'))).toBe(true);
    expect(x.nodes.every((n) => n.position.x === 0 && n.position.y === 0)).toBe(true);
  });
  it('package grouping when the classes of a package can be boxed without capturing others', () => {
    const m = model();
    m.classes[0].package = 'zoo';
    m.classes[1].package = 'zoo';
    const g = modelToDiagram(m);
    const pk = g.nodes.find((n) => n.type === 'group');
    expect(pk?.data).toMatchObject({ label: 'zoo', variant: 'package' });
    const kids = g.nodes.filter((n) => n.parentId === pk!.id);
    expect(kids.map((k) => classOf(k).label).sort()).toEqual(['Animal', 'Dog']);
    expect(g.nodes.indexOf(pk!)).toBeLessThan(g.nodes.indexOf(kids[0]));
  });
});
