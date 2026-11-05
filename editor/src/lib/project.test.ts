import { describe, expect, it } from 'vitest';
import { migrateV1, parseProject, serializeProject, createProject, duplicatePages } from './project';
import { monitoringStack } from '../templates/monitoringStack';

describe('migration v1 -> v2', () => {
  it('wraps single diagram into one-page project', () => {
    const d = monitoringStack();
    const p = migrateV1(d, 'Untitled');
    expect(p.version).toBe(2);
    expect(p.name).toBe('Untitled');
    expect(p.pages).toHaveLength(1);
    expect(p.pages[0].nodes).toHaveLength(25);
    expect(p.activePageId).toBe(p.pages[0].id);
  });
  it('parseProject accepts v1 JSON and migrates', () => {
    const r = parseProject(JSON.stringify(monitoringStack()));
    expect(r.ok && r.project.version).toBe(2);
    expect(r.ok && r.project.pages[0].edges).toHaveLength(17);
  });
});

describe('v2 validation', () => {
  it('round-trips', () => {
    const p = createProject('X');
    p.pages.push({ id: 'p2', name: 'Two', nodes: [], edges: [] });
    const r = parseProject(serializeProject(p));
    expect(r.ok && r.project.pages.map((x) => x.name)).toEqual(['Page 1', 'Two']);
    expect(r.ok && r.project.name).toBe('X');
  });
  const bad = (v: unknown) => parseProject(typeof v === 'string' ? v : JSON.stringify(v));
  const ok = () => JSON.parse(serializeProject(createProject('X')));
  it('rejects garbage', () => {
    expect(bad('{x').ok).toBe(false);
    expect(bad([]).ok).toBe(false);
    expect(bad({ version: 3 }).ok).toBe(false);
  });
  it('rejects empty pages / missing name / dup page ids / bad active page', () => {
    const a = ok(); a.pages = [];
    expect(bad(a).ok).toBe(false);
    const b = ok(); b.pages[0].name = 5;
    expect(bad(b).ok).toBe(false);
    const c = ok(); c.pages.push({ ...c.pages[0] });
    expect(bad(c).ok).toBe(false);
    const d = ok(); d.activePageId = 'nope';
    expect(bad(d).ok).toBe(false);
  });
  it('rejects invalid page content with page context', () => {
    const a = ok();
    a.pages[0].edges = [{ id: 'e', source: 'x', target: 'y' }];
    const r = bad(a);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Page 1/);
  });
});

describe('duplicatePages', () => {
  it('gives fresh page ids and keeps content', () => {
    const p = migrateV1(monitoringStack(), 'A');
    const d = duplicatePages(p.pages);
    expect(d[0].id).not.toBe(p.pages[0].id);
    expect(d[0].nodes).toHaveLength(25);
  });
});
