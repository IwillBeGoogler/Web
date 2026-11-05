import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { parseDiagram, serializeDiagram, validateDiagram } from '../serialization';
import { buildSdd, readSdd } from '../sdd/sdd';
import { buildSddProj, readSddProj } from '../sdd/sddproj';
import { CURRENT_SCHEMA, migratePageFile, migrateProjectFile } from '../sdd/migrations';
import { createProject } from '../project';
import { blankSequence } from '../seq/node';
import { parseStateMermaid } from '../state/mermaid';
import { stateModelToDiagram } from '../state/convert';
import { actorNode, boundaryNode, componentNode, useCaseNode } from './nodes';
import { umlEdge } from '../uml/edges';
import { dominantKind } from '../../workspace/tree';
import type { Diagram } from '../../types';

const stateDiagram = stateModelToDiagram(parseStateMermaid('stateDiagram-v2\n [*] --> A\n A --> B : go [ok] / act\n state B {\n [*] --> C\n }\n A --> A : tick\n').model);
const diagram = (): Diagram => {
  const seq = blankSequence('sq', { x: 0, y: 0 }, 'Login');
  const actor = actorNode('ac', { x: 600, y: 0 }, 'Customer');
  const uc = useCaseNode('uc', { x: 800, y: 0 }, 'Pay');
  const sys = boundaryNode('sys', { x: 780, y: -40 }, 'Shop', 300, 200);
  const comp = componentNode('cp', { x: 600, y: 300 }, 'component', 'Orders');
  const prov = componentNode('pv', { x: 800, y: 300 }, 'provided', 'IOrders');
  return {
    version: 1,
    nodes: [seq, actor, sys, { ...uc, parentId: 'sys', position: { x: 20, y: 40 } }, comp, prov, ...stateDiagram.nodes],
    edges: [umlEdge('e1', 'ac', 'uc', { kind: 'association' }), umlEdge('e2', 'cp', 'pv', { kind: 'assembly' }), umlEdge('e3', 'uc', 'ac', { kind: 'include' }), ...stateDiagram.edges],
  };
};
const project = () => {
  const p = createProject('UML2');
  const d = diagram();
  return { ...p, id: 'prj_u2', activePageId: 'pg_u', pages: [{ ...p.pages[0], id: 'pg_u', nodes: d.nodes, edges: d.edges }] };
};

describe('schema v5 (client)', () => {
  it('is schema 5; every older version migrates one step at a time', () => {
    expect(CURRENT_SCHEMA).toBe(8);
    for (const v of [1, 2, 3, 4]) {
      expect((migratePageFile({ schemaVersion: v, id: 'p', name: 'P', nodes: [], edges: [] }) as { schemaVersion: number }).schemaVersion).toBe(8);
      expect((migrateProjectFile({ schemaVersion: v, id: 'p', name: 'P', activePageId: 'x' }) as { schemaVersion: number }).schemaVersion).toBe(8);
    }
    expect(() => migratePageFile({ schemaVersion: 9, id: 'p' })).toThrow(/newer/);
  });
  it('JSON round trip keeps sequence, state, use case and component data', () => {
    const d = diagram();
    const r = parseDiagram(serializeDiagram(d));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.diagram.nodes.map((n) => n.type)).toEqual(d.nodes.map((n) => n.type));
    expect(r.diagram.nodes[0].data).toEqual(d.nodes[0].data);
    expect(r.diagram.edges.find((e) => e.id === 'e3')?.label).toBe('«include»');
    expect(r.diagram.edges.find((e) => e.id === 'e3')?.data?.uml).toEqual({ kind: 'include' });
  });
  it('validation rejects malformed sequence diagrams', () => {
    const base = () => JSON.parse(serializeDiagram(diagram()));
    const a = base(); delete a.nodes[0].data.participants;
    expect(validateDiagram(a).ok).toBe(false);
    const dup = base(); dup.nodes[0].data.participants[1].id = dup.nodes[0].data.participants[0].id;
    expect(validateDiagram(dup).ok).toBe(false);
    const unk = base(); unk.nodes[0].data.items[0].from = 'ghost';
    expect(validateDiagram(unk).ok).toBe(false);
    const kind = base(); kind.nodes[0].data.items[0].kind = 'teleport';
    expect(validateDiagram(kind).ok).toBe(false);
    const op = base(); op.nodes[0].data.items.push({ type: 'fragment', id: 'f', op: 'while', sections: [{ id: 's', guard: '', items: [] }] });
    expect(validateDiagram(op).ok).toBe(false);
    const pk = base(); pk.nodes[0].data.participants[0].kind = 'robot';
    expect(validateDiagram(pk).ok).toBe(false);
  });
  it('validation rejects bad state / use case / component kinds and unknown relation kinds', () => {
    const base = () => JSON.parse(serializeDiagram(diagram()));
    const s = base(); s.nodes.find((n: { type: string }) => n.type === 'state').data.stateKind = 'zombie';
    expect(validateDiagram(s).ok).toBe(false);
    const u = base(); u.nodes.find((n: { type: string }) => n.type === 'usecase').data.ucKind = 'robot';
    expect(validateDiagram(u).ok).toBe(false);
    const c = base(); c.nodes.find((n: { type: string }) => n.type === 'component').data.compKind = 'blob';
    expect(validateDiagram(c).ok).toBe(false);
    const e = base(); e.edges[0].data.uml.kind = 'friendship';
    expect(validateDiagram(e).ok).toBe(false);
    const v = base(); v.nodes.find((n: { data: { variant?: string } }) => n.data.variant === 'boundary').data.variant = 'weird';
    expect(validateDiagram(v).ok).toBe(false);
  });
  it('.sdd round trip writes schemaVersion 5', () => {
    const p = project();
    const bytes = buildSdd(p);
    expect(JSON.parse(strFromU8(unzipSync(bytes)['project.json'])).schemaVersion).toBe(8);
    const r = readSdd(bytes);
    expect(r.warnings).toEqual([]);
    const pg = r.project.pages[0];
    expect(pg.nodes.map((n) => n.type)).toEqual(p.pages[0].nodes.map((n) => n.type));
    expect(pg.nodes[0].data).toEqual(p.pages[0].nodes[0].data);
    expect(pg.edges.map((e) => e.data?.uml?.kind)).toEqual(p.pages[0].edges.map((e) => e.data?.uml?.kind));
    expect(pg.nodes.find((n) => n.data.variant === 'composite')).toBeTruthy();
  });
  it('.sddproj round trip', () => {
    const p = project();
    const bytes = buildSddProj({ name: 'W', createdAt: 1, updatedAt: 2, folders: [], files: [{ id: 'f1', folderId: null, name: 'Mixed', kind: 'uml', position: 0, doc: p }] });
    const r = readSddProj(bytes);
    const nodes = r.files[0].doc.pages[0].nodes;
    expect(nodes.find((n) => n.type === 'sequence')?.data.label).toBe('Login');
    expect(nodes.filter((n) => n.type === 'state').length).toBeGreaterThan(2);
  });
  it('a file of new UML kinds is a UML file', () => {
    for (const t of ['sequence', 'state', 'usecase', 'component']) expect(dominantKind([{ nodes: [{ type: t }, { type: t }, { type: 'icon' }] }])).toBe('uml');
  });
});
