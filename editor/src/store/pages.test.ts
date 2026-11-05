import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from './diagramStore';
import { monitoringStack } from '../templates/monitoringStack';
import { createProject } from '../lib/project';
import type { DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const n = (id: string): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id } });
beforeEach(() => s().reset());

describe('pages', () => {
  it('starts with one page', () => {
    expect(s().pages).toHaveLength(1);
    expect(s().activePageId).toBe(s().pages[0].id);
  });
  it('addPage creates and switches to a blank page', () => {
    s().addNode(n('a'));
    const id = s().addPage('Second');
    expect(s().activePageId).toBe(id);
    expect(s().nodes).toHaveLength(0);
    expect(s().pages.map((p) => p.name)).toEqual(['Page 1', 'Second']);
  });
  it('default new page names increment', () => {
    s().addPage();
    expect(s().pages[1].name).toBe('Page 2');
  });
  it('switching preserves each page content', () => {
    const first = s().activePageId;
    s().addNode(n('a'));
    const second = s().addPage();
    s().addNode(n('b'));
    s().addNode(n('c'));
    s().switchPage(first);
    expect(s().nodes.map((x) => x.id)).toEqual(['a']);
    s().switchPage(second);
    expect(s().nodes.map((x) => x.id)).toEqual(['b', 'c']);
  });
  it('undo history is isolated per page', () => {
    const first = s().activePageId;
    s().addNode(n('a'));
    const second = s().addPage();
    s().addNode(n('b'));
    s().undo();
    expect(s().nodes).toHaveLength(0);
    s().undo(); // nothing left on page 2: must NOT touch page 1
    expect(s().activePageId).toBe(second);
    s().switchPage(first);
    expect(s().nodes.map((x) => x.id)).toEqual(['a']);
    s().undo();
    expect(s().nodes).toHaveLength(0);
    s().switchPage(second);
    expect(s().past).toHaveLength(0);
    expect(s().future).toHaveLength(1); // page 2 redo (the b add) survived the round trip
    s().redo();
    expect(s().nodes.map((x) => x.id)).toEqual(['b']);
  });
  it('rename', () => {
    s().renamePage(s().activePageId, 'Overview');
    expect(s().pages[0].name).toBe('Overview');
    s().renamePage(s().activePageId, '   ');
    expect(s().pages[0].name).toBe('Overview');
  });
  it('delete: refuses last page, switches active, drops content', () => {
    const first = s().activePageId;
    expect(s().deletePage(first)).toBe(false);
    s().addNode(n('a'));
    const second = s().addPage();
    s().addNode(n('b'));
    expect(s().deletePage(second)).toBe(true);
    expect(s().activePageId).toBe(first);
    expect(s().nodes.map((x) => x.id)).toEqual(['a']);
    expect(s().toProject().pages).toHaveLength(1);
  });
  it('delete inactive page', () => {
    const first = s().activePageId;
    const second = s().addPage();
    s().switchPage(first);
    s().deletePage(second);
    expect(s().pages.map((p) => p.id)).toEqual([first]);
    expect(Object.keys(s().stash)).not.toContain(second);
  });
  it('duplicatePage copies content to new page after it', () => {
    s().addNode(n('a'));
    const copy = s().duplicatePage(s().activePageId);
    expect(s().pages).toHaveLength(2);
    expect(s().pages[1].id).toBe(copy);
    expect(s().pages[1].name).toMatch(/copy/);
    expect(s().activePageId).toBe(copy);
    expect(s().nodes.map((x) => x.id)).toEqual(['a']);
  });
  it('template loads into a new page', () => {
    s().addNode(n('a'));
    s().addPage('Monitoring stack', monitoringStack());
    expect(s().nodes).toHaveLength(25);
    expect(s().edges).toHaveLength(17);
    expect(s().pages).toHaveLength(2);
    s().switchPage(s().pages[0].id);
    expect(s().nodes.map((x) => x.id)).toEqual(['a']);
  });
  it('toProject / loadProject round trip', () => {
    s().addNode(n('a'));
    s().addPage('Two', { nodes: [n('x'), n('y')], edges: [] });
    const p = s().toProject();
    expect(p.pages.map((x) => x.nodes.length)).toEqual([1, 2]);
    s().reset();
    s().loadProject(p);
    expect(s().projectId).toBe(p.id);
    expect(s().activePageId).toBe(p.activePageId);
    expect(s().nodes.map((x) => x.id)).toEqual(['x', 'y']);
    expect(s().past).toHaveLength(0);
    s().switchPage(p.pages[0].id);
    expect(s().nodes.map((x) => x.id)).toEqual(['a']);
  });
  it('importPages appends with fresh ids', () => {
    const p = createProject('X');
    p.pages[0].nodes = [n('q')];
    s().importPages(p.pages);
    expect(s().pages).toHaveLength(2);
    expect(s().pages[1].id).not.toBe(p.pages[0].id);
  });
});
