import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { parseSql } from './sqlParse';
import { schemaToDiagram } from './convert';
import { parseDiagram, serializeDiagram, validateDiagram } from '../serialization';
import { buildSdd, readSdd } from '../sdd/sdd';
import { buildSddProj, readSddProj } from '../sdd/sddproj';
import { CURRENT_SCHEMA, migratePageFile } from '../sdd/migrations';
import { createProject } from '../project';
import { relationOf, tableOf } from './tableData';
import demo from './fixtures/demo_large.sql?raw';

const diagram = () => schemaToDiagram(parseSql(demo).schema);
const projectWith = (d = diagram()) => {
  const p = createProject('ER');
  return { ...p, id: 'prj_er', activePageId: 'pg_er', pages: [{ ...p.pages[0], id: 'pg_er', nodes: d.nodes, edges: d.edges }] };
};

describe('ER serialization (client)', () => {
  it('schema version is 4 and v2 pages migrate', () => {
    expect(CURRENT_SCHEMA).toBe(8);
    const m = migratePageFile({ schemaVersion: 2, id: 'p', name: 'P', nodes: [], edges: [] }) as { schemaVersion: number };
    expect(m.schemaVersion).toBe(8);
  });
  it('JSON round trip keeps tables, columns and relations', () => {
    const d = diagram();
    const r = parseDiagram(serializeDiagram(d));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.diagram.nodes.length).toBe(d.nodes.length);
    expect(tableOf(r.diagram.nodes[0])).toEqual(tableOf(d.nodes[0]));
    expect(relationOf(r.diagram.edges[0])).toEqual(relationOf(d.edges[0]));
    expect(r.diagram.edges[0].data?.endMarker).toBe(d.edges[0].data?.endMarker);
  });
  it('validation rejects malformed tables and relations', () => {
    const d = diagram();
    const bad = JSON.parse(serializeDiagram(d));
    delete bad.nodes[0].data.columns;
    expect(validateDiagram(bad).ok).toBe(false);
    const bad2 = JSON.parse(serializeDiagram(d));
    bad2.edges[0].data.relation.cardinality = '2:2';
    expect(validateDiagram(bad2).ok).toBe(false);
    const bad3 = JSON.parse(serializeDiagram(d));
    bad3.edges[0].data.endMarker = 'nope';
    expect(validateDiagram(bad3).ok).toBe(false);
    const dup = JSON.parse(serializeDiagram(d));
    dup.nodes[0].data.columns[1].id = dup.nodes[0].data.columns[0].id;
    expect(validateDiagram(dup).ok).toBe(false);
  });
  it('.sdd round trip', () => {
    const p = projectWith();
    const r = readSdd(buildSdd(p));
    expect(r.warnings).toEqual([]);
    const pg = r.project.pages[0];
    expect(pg.nodes.map((n) => n.type)).toEqual(p.pages[0].nodes.map((n) => n.type));
    expect(tableOf(pg.nodes[3])).toEqual(tableOf(p.pages[0].nodes[3]));
    expect(pg.edges.map((e) => relationOf(e))).toEqual(p.pages[0].edges.map((e) => relationOf(e)));
    const files = unzipSync(buildSdd(p));
    expect(JSON.parse(strFromU8(files['project.json'])).schemaVersion).toBe(8);
  });
  it('opens a v2 .sdd (no tables) unchanged', () => {
    const p = createProject('Old');
    const files = unzipSync(buildSdd(p));
    const proj = JSON.parse(strFromU8(files['project.json']));
    proj.schemaVersion = 2;
    files['project.json'] = strToU8(JSON.stringify(proj));
    // checksum covers the contents: opening without verification mimics an older writer
    const out = readSdd(zipSync({ mimetype: [files.mimetype, { level: 0 }], ...Object.fromEntries(Object.entries(files).filter(([k]) => k !== 'mimetype')) }), {}, { verifyChecksum: false });
    expect(out.project.name).toBe('Old');
  });
  it('.sddproj round trip', () => {
    const p = projectWith();
    const bytes = buildSddProj({ name: 'W', createdAt: 1, updatedAt: 2, folders: [], files: [{ id: 'f1', folderId: null, name: 'Schema', kind: 'erd', position: 0, doc: p }] });
    const r = readSddProj(bytes);
    expect(r.files[0].doc.pages[0].nodes.length).toBe(p.pages[0].nodes.length);
    expect(relationOf(r.files[0].doc.pages[0].edges[0])).toEqual(relationOf(p.pages[0].edges[0]));
  });
});
