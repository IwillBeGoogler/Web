import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { parseDiagram, serializeDiagram, validateDiagram } from '../serialization';
import { buildSdd, readSdd } from '../sdd/sdd';
import { buildSddProj, readSddProj } from '../sdd/sddproj';
import { CURRENT_SCHEMA, migratePageFile, migrateProjectFile } from '../sdd/migrations';
import { createProject } from '../project';
import { blankClass } from './geometry';
import { umlEdge } from './edges';
import { classOf } from './geometry';

const diagram = () => {
  const a = blankClass('a', { x: 0, y: 0 }, 'interface', 'Repo');
  const b = blankClass('b', { x: 0, y: 200 }, 'class', 'SqlRepo');
  return { version: 1 as const, nodes: [a, b], edges: [umlEdge('e1', 'b', 'a', { kind: 'realization', sourceMult: '1', targetMult: '0..*', sourceRole: 'impl' })] };
};
const projectWith = () => {
  const p = createProject('UML');
  const d = diagram();
  return { ...p, id: 'prj_uml', activePageId: 'pg_u', pages: [{ ...p.pages[0], id: 'pg_u', nodes: d.nodes, edges: d.edges }] };
};

describe('UML serialization (schema v4, client)', () => {
  it('is schema 5; v1 to v4 files migrate step by step', () => {
    expect(CURRENT_SCHEMA).toBe(8);
    for (const v of [1, 2, 3, 4]) {
      expect((migratePageFile({ schemaVersion: v, id: 'p', name: 'P', nodes: [], edges: [] }) as { schemaVersion: number }).schemaVersion).toBe(8);
      expect((migrateProjectFile({ schemaVersion: v, id: 'p', name: 'P', activePageId: 'x' }) as { schemaVersion: number }).schemaVersion).toBe(8);
    }
    expect(() => migratePageFile({ schemaVersion: 9, id: 'p' })).toThrow(/newer/);
  });
  it('JSON round trip keeps classes, members and UML relations', () => {
    const d = diagram();
    const r = parseDiagram(serializeDiagram(d));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(classOf(r.diagram.nodes[0])).toEqual(classOf(d.nodes[0]));
    expect(r.diagram.edges[0].data?.uml).toEqual(d.edges[0].data?.uml);
    expect(r.diagram.edges[0].data?.endMarker).toBe('hollowTriangle');
  });
  it('validation rejects malformed classes and relations', () => {
    const bad = JSON.parse(serializeDiagram(diagram()));
    delete bad.nodes[0].data.operations;
    expect(validateDiagram(bad).ok).toBe(false);
    const dup = JSON.parse(serializeDiagram(diagram()));
    dup.nodes[1].data.operations[0].id = dup.nodes[1].data.attributes[0].id;
    expect(validateDiagram(dup).ok).toBe(false);
    const vis = JSON.parse(serializeDiagram(diagram()));
    vis.nodes[1].data.attributes[0].visibility = '*';
    expect(validateDiagram(vis).ok).toBe(false);
    const kind = JSON.parse(serializeDiagram(diagram()));
    kind.edges[0].data.uml.kind = 'friendship';
    expect(validateDiagram(kind).ok).toBe(false);
    const mk = JSON.parse(serializeDiagram(diagram()));
    mk.edges[0].data.endMarker = 'bogus';
    expect(validateDiagram(mk).ok).toBe(false);
  });
  it('.sdd round trip', () => {
    const p = projectWith();
    const bytes = buildSdd(p);
    const r = readSdd(bytes);
    expect(r.warnings).toEqual([]);
    const pg = r.project.pages[0];
    expect(pg.nodes.map((n) => n.type)).toEqual(['class', 'class']);
    expect(classOf(pg.nodes[1])).toEqual(classOf(p.pages[0].nodes[1]));
    expect(pg.edges[0].data?.uml).toEqual(p.pages[0].edges[0].data?.uml);
    expect(JSON.parse(strFromU8(unzipSync(bytes)['project.json'])).schemaVersion).toBe(8);
  });
  it('.sddproj round trip', () => {
    const p = projectWith();
    const bytes = buildSddProj({ name: 'W', createdAt: 1, updatedAt: 2, folders: [], files: [{ id: 'f1', folderId: null, name: 'Classes', kind: 'uml', position: 0, doc: p }] });
    const r = readSddProj(bytes);
    expect(classOf(r.files[0].doc.pages[0].nodes[0]).label).toBe('Repo');
    expect(r.files[0].doc.pages[0].edges[0].data?.uml?.kind).toBe('realization');
  });
});

import { dominantKind } from '../../workspace/tree';
describe('file kind', () => {
  it('a file full of classes is a UML file, tables an ERD file', () => {
    expect(dominantKind([{ nodes: [{ type: 'class' }, { type: 'class' }, { type: 'icon' }] }])).toBe('uml');
    expect(dominantKind([{ nodes: [{ type: 'table' }, { type: 'table' }, { type: 'icon' }] }])).toBe('erd');
  });
});
