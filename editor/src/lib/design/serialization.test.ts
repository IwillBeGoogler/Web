import { describe, expect, it } from 'vitest';
import { validateDiagram } from '../serialization';
import { buildSdd, readSdd } from '../sdd/sdd';
import { buildSddProj, readSddProj } from '../sdd/sddproj';
import { CURRENT_SCHEMA, migratePageFile, migrateProjectFile } from '../sdd/migrations';
import { createProject, validateProject } from '../project';
import type { DiagramNode } from '../../types';

const node = (data: Record<string, unknown>): DiagramNode => ({ id: 'n', type: 'card', position: { x: 0, y: 0 }, data: { label: 'n', ...data } }) as DiagramNode;
const ok = (data: Record<string, unknown>) => validateDiagram({ version: 1, nodes: [node(data)], edges: [] }).ok;

describe('schema v7', () => {
  it('is 7; v1..v6 files migrate; v8 is refused', () => {
    expect(CURRENT_SCHEMA).toBe(8);
    for (const v of [1, 2, 3, 4, 5, 6]) {
      expect((migrateProjectFile({ schemaVersion: v, id: 'p', activePage: 'a' }) as { schemaVersion: number }).schemaVersion).toBe(8);
      expect((migratePageFile({ schemaVersion: v, id: 'p', nodes: [], edges: [] }) as { schemaVersion: number }).schemaVersion).toBe(8);
    }
    expect(() => migrateProjectFile({ schemaVersion: 9 })).toThrow(/newer/);
  });
  it('accepts every new field', () => {
    expect(ok({
      hidden: true, instKey: 'k', componentMain: 'c1', source: 'src/a.ts:10',
      instance: { componentId: 'c1', rev: 2, overrides: { k: { label: 'x' } } },
      autoLayout: { mode: 'grid', gap: 8, padding: 8, align: 'start', justify: 'between', columns: 2, hugW: true, hugH: false },
      layoutSizing: { w: 'fill', h: 'hug' }, constraints: { h: 'right', v: 'scale' }, link: { fileId: 'f', nodeId: 'n2' },
      styles: { fill: 's1', text: 's2', effect: 's3' },
    })).toBe(true);
  });
  it('rejects malformed new fields', () => {
    for (const bad of [
      { hidden: 'yes' }, { instance: { componentId: 'c' } }, { instKey: 5 }, { autoLayout: { mode: 'flex', gap: 1, padding: 1, align: 'start', justify: 'start', hugW: true, hugH: true } },
      { autoLayout: { mode: 'row', gap: 'x', padding: 1, align: 'start', justify: 'start', hugW: true, hugH: true } }, { layoutSizing: { w: 'big', h: 'fixed' } },
      { constraints: { h: 'top', v: 'top' } }, { link: { fileId: '' } }, { link: { nodeId: 'x' } }, { styles: { fill: 3 } }, { source: 'x'.repeat(2001) },
    ]) expect(ok(bad), JSON.stringify(bad)).toBe(false);
  });
  it('validateProject keeps and checks page guides', () => {
    const p = createProject('P');
    p.pages[0].guides = [{ id: 'g1', axis: 'x', pos: 120 }];
    const r = validateProject(JSON.parse(JSON.stringify(p)));
    expect(r.ok && r.project.pages[0].guides).toEqual([{ id: 'g1', axis: 'x', pos: 120 }]);
    const bad = JSON.parse(JSON.stringify(p));
    bad.pages[0].guides = [{ id: 'g1', axis: 'z', pos: 1 }];
    expect(validateProject(bad).ok).toBe(false);
  });
  it('.sdd and .sddproj round-trip the new fields and guides', () => {
    const p = createProject('P');
    p.pages[0].nodes = [node({ autoLayout: { mode: 'row', gap: 8, padding: 8, align: 'start', justify: 'start', hugW: true, hugH: true }, link: { fileId: 'f' }, hidden: true })];
    p.pages[0].guides = [{ id: 'g', axis: 'y', pos: 40 }];
    const back = readSdd(buildSdd(p)).project;
    expect(back.pages[0].nodes[0].data).toMatchObject({ link: { fileId: 'f' }, hidden: true });
    expect(back.pages[0].guides).toEqual([{ id: 'g', axis: 'y', pos: 40 }]);
    const bytes = buildSddProj({ name: 'W', createdAt: 1, updatedAt: 1, folders: [], files: [{ id: 'f1', folderId: null, name: 'F', kind: 'sdd', position: 0, doc: p }] });
    expect(JSON.stringify(readSddProj(bytes))).toContain('"guides"');
  });
});
