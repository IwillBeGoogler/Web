import { beforeEach, describe, expect, it } from 'vitest';
import {
  createStoredProject, deleteProject, duplicateProject, listProjects, loadProject, migrateLegacy,
  renameProject, saveProject, INDEX_KEY, LEGACY_KEY, createProjectFromTemplate,
} from './projects';
import { serializeDiagram } from './serialization';
import { monitoringStack } from '../templates/monitoringStack';

beforeEach(() => localStorage.clear());
const st = () => localStorage;

describe('project CRUD', () => {
  it('creates and lists', () => {
    const p = createStoredProject(st(), 'Alpha');
    const l = listProjects(st());
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ id: p.id, name: 'Alpha', pageCount: 1 });
  });
  it('save/load round-trip, updates index metadata', () => {
    const p = createStoredProject(st(), 'A');
    p.pages.push({ id: 'x2', name: 'Second', nodes: [], edges: [] });
    const saved = saveProject(st(), p, 12345);
    expect(saved.updatedAt).toBe(12345);
    expect(loadProject(st(), p.id)).toEqual(saved);
    expect(listProjects(st())[0]).toMatchObject({ pageCount: 2, updatedAt: 12345 });
  });
  it('renames', () => {
    const p = createStoredProject(st(), 'A');
    renameProject(st(), p.id, 'B');
    expect(loadProject(st(), p.id)!.name).toBe('B');
    expect(listProjects(st())[0].name).toBe('B');
  });
  it('duplicates with new id and page ids', () => {
    const p = createStoredProject(st(), 'A');
    const d = duplicateProject(st(), p.id)!;
    expect(d.id).not.toBe(p.id);
    expect(d.name).toBe('A (copy)');
    expect(d.pages[0].id).not.toBe(p.pages[0].id);
    expect(d.activePageId).toBe(d.pages[0].id);
    expect(listProjects(st())).toHaveLength(2);
  });
  it('deletes project and its data', () => {
    const p = createStoredProject(st(), 'A');
    deleteProject(st(), p.id);
    expect(listProjects(st())).toHaveLength(0);
    expect(loadProject(st(), p.id)).toBeNull();
  });
  it('lists most recently updated first', () => {
    const a = createStoredProject(st(), 'A');
    const b = createStoredProject(st(), 'B');
    saveProject(st(), a, Date.now() + 10_000);
    expect(listProjects(st()).map((x) => x.id)).toEqual([a.id, b.id]);
  });
  it('tolerates corrupt data', () => {
    localStorage.setItem(INDEX_KEY, '{bad');
    expect(listProjects(st())).toEqual([]);
    const p = createStoredProject(st(), 'A');
    localStorage.setItem(`sdd:project:${p.id}`, 'garbage');
    expect(loadProject(st(), p.id)).toBeNull();
  });
});

describe('legacy migration', () => {
  it('imports old single diagram as "Untitled" once', () => {
    localStorage.setItem(LEGACY_KEY, serializeDiagram(monitoringStack()));
    const m = migrateLegacy(st())!;
    expect(m.name).toBe('Untitled');
    expect(loadProject(st(), m.id)!.pages[0].nodes).toHaveLength(25);
    expect(migrateLegacy(st())).toBeNull();
    expect(listProjects(st())).toHaveLength(1);
  });
  it('does nothing without legacy data', () => {
    expect(migrateLegacy(st())).toBeNull();
    expect(listProjects(st())).toHaveLength(0);
  });
});

describe('create from template', () => {
  it('first page holds the template content', () => {
    const t = monitoringStack();
    const p = createProjectFromTemplate(st(), 'From template', t, 'Monitoring');
    const loaded = loadProject(st(), p.id)!;
    expect(loaded.pages).toHaveLength(1);
    expect(loaded.pages[0].name).toBe('Monitoring');
    expect(loaded.pages[0].nodes).toHaveLength(t.nodes.length);
    expect(listProjects(st())[0].name).toBe('From template');
  });
});
