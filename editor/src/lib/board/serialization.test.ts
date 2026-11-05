import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { parseDiagram, serializeDiagram, validateDiagram } from '../serialization';
import { buildSdd, readSdd } from '../sdd/sdd';
import { buildSddProj, readSddProj } from '../sdd/sddproj';
import { CURRENT_SCHEMA, migratePageFile, migrateProjectFile } from '../sdd/migrations';
import { createProject } from '../project';
import { ptsValid, validateBoardNodeData } from './validate';
import { createFrame } from './frames';
import { createSticky } from './sticky';
import { createStrokeNode } from './freehand';
import { addChild, createRoot } from './mindmap';
import type { Diagram, DiagramNode } from '../../types';

const stamp = (id = 'st1'): DiagramNode => ({ id, type: 'stamp', position: { x: 5, y: 5 }, width: 56, height: 56, data: { label: '', emoji: '🎉' } });
const diagram = (): Diagram => {
  const root = createRoot('mm', { x: 0, y: 600 });
  const c = addChild([root], [], 'mm', 'mm2', 'me1', 'Child');
  const stroke = createStrokeNode('dr', [0, 1, 2, 3, 4, 5].map((i) => ({ x: i * 7, y: i * 3, p: 0.3 + i / 10 })), { color: '#ff0000', size: 4, brush: 'highlighter' })!;
  const frame = createFrame('fr', { x: 0, y: 0, width: 500, height: 400 }, 'Intro');
  frame.data.order = 0;
  return { version: 1, nodes: [frame, { ...createSticky('sk', { x: 100, y: 100 }, { color: 'pink', author: 'Ann', authorId: 'u1', private: true, label: 'idea' }) }, stroke, root, c.node, stamp()], edges: [c.edge] };
};

describe('schema version 6', () => {
  it('is 8', () => expect(CURRENT_SCHEMA).toBe(8));
  it('migrates v1..v5 project and page files up to 6', () => {
    for (const v of [1, 2, 3, 4, 5]) {
      expect((migrateProjectFile({ schemaVersion: v, id: 'p', activePage: 'a' }) as { schemaVersion: number }).schemaVersion).toBe(8);
      expect((migratePageFile({ schemaVersion: v, id: 'p', nodes: [], edges: [] }) as { schemaVersion: number }).schemaVersion).toBe(8);
    }
    expect(() => migrateProjectFile({ schemaVersion: 9 })).toThrow(/newer/);
  });
  it('v5 pages with legacy sticky / draw nodes open unchanged', () => {
    const page = { schemaVersion: 5, id: 'pg', name: 'P', nodes: [{ id: 'd', type: 'draw', position: { x: 0, y: 0 }, data: { label: '', path: 'M0 0 L5 5' } }], edges: [] };
    const m = migratePageFile(page) as { nodes: unknown[] };
    expect(m.nodes).toEqual(page.nodes);
  });
});

describe('board nodes validate', () => {
  it('accepts a diagram with every new kind and round-trips as JSON', () => {
    const d = diagram();
    const r = parseDiagram(serializeDiagram(d));
    expect(r.ok, r.ok ? '' : r.error).toBe(true);
    if (r.ok) expect(r.diagram.nodes.find((n) => n.id === 'sk')!.data).toMatchObject({ author: 'Ann', private: true, autoFont: true });
  });
  const bad = (n: DiagramNode) => validateDiagram({ version: 1, nodes: [n], edges: [] }).ok;
  it('rejects malformed board data', () => {
    const d = diagram();
    const [frame, sticky, stroke, root, , st] = d.nodes;
    expect(bad({ ...frame, width: undefined })).toBe(false);
    expect(bad({ ...frame, width: -5 })).toBe(false);
    expect(bad({ ...frame, data: { ...frame.data, order: 'first' } })).toBe(false);
    expect(bad({ ...sticky, data: { ...sticky.data, private: 'yes' } })).toBe(false);
    expect(bad({ ...stroke, data: { ...stroke.data, brush: 'crayon' } })).toBe(false);
    expect(bad({ ...stroke, data: { ...stroke.data, pts: 'garbage in' } })).toBe(false);
    expect(bad({ ...root, data: { ...root.data, side: 'up' } })).toBe(false);
    expect(bad({ ...st, data: { ...st.data, emoji: '' } })).toBe(false);
    expect(bad({ ...st, data: { ...st.data, emoji: 'x'.repeat(40) } })).toBe(false);
    expect(bad(frame)).toBe(true);
  });
  it('ptsValid', () => {
    expect(ptsValid('a 1 2 3 4')).toBe(true);
    expect(ptsValid('b 1 2 3')).toBe(true);
    expect(ptsValid('a 1 2 3')).toBe(false);
    expect(ptsValid('c 1 2')).toBe(false);
    expect(validateBoardNodeData('draw', { label: '', path: 'M0 0' }, {})).toBeNull();
  });
});

describe('.sdd / .sddproj round trip', () => {
  const proj = () => {
    const p = createProject('Board');
    p.pages[0].nodes = diagram().nodes;
    p.pages[0].edges = diagram().edges;
    return p;
  };
  it('.sdd keeps frames, stickies, strokes, mind map and stamps and writes the current schema', () => {
    const p = proj();
    const bytes = buildSdd(p);
    const files = unzipSync(bytes);
    expect(JSON.parse(strFromU8(files['project.json'])).schemaVersion).toBe(CURRENT_SCHEMA);
    const nodes = readSdd(bytes).project.pages[0].nodes;
    expect(nodes.map((n) => n.type).sort()).toEqual(p.pages[0].nodes.map((n) => n.type).sort());
    expect(nodes.find((n) => n.type === 'draw')!.data.pts).toBe(p.pages[0].nodes.find((n) => n.type === 'draw')!.data.pts);
    expect(nodes.find((n) => n.type === 'frame')!.data.order).toBe(0);
    expect(nodes.find((n) => n.type === 'sticky')!.data.private).toBe(true);
  });
  it('.sddproj keeps them too', () => {
    const p = proj();
    const r = readSddProj(buildSddProj({ name: 'W', createdAt: 1, updatedAt: 2, folders: [], files: [{ id: 'f', folderId: null, name: 'Board', kind: 'sdd', position: 0, doc: { ...p, id: 'f', name: 'Board' } }] }));
    const nodes = r.files[0].doc.pages[0].nodes;
    expect(nodes.filter((n) => n.type === 'mindmap')).toHaveLength(2);
    expect(nodes.find((n) => n.type === 'stamp')!.data.emoji).toBe('🎉');
  });
});
