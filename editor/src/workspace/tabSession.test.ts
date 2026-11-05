import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '../lib/project';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramNode } from '../types';
import { activateFile, captureActive, clearTabSessions, dropTabSession, hasTabSession, liveProject } from './tabSession';

const node = (id: string): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id } }) as DiagramNode;
const doc = (id: string, name: string) => ({ ...createProject(name), id });
const S = () => useDiagramStore.getState();

beforeEach(() => {
  clearTabSessions();
  S().reset();
});

describe('per-tab editor state', () => {
  it('each tab keeps its own undo history: undo in one file never touches another', () => {
    expect(activateFile('A', () => doc('A', 'A'))).toBe(true);
    S().addNode(node('a1'));
    S().addNode(node('a2'));
    captureActive('A');

    expect(activateFile('B', () => doc('B', 'B'))).toBe(true);
    expect(S().projectId).toBe('B');
    expect(S().nodes).toEqual([]);
    expect(S().past).toHaveLength(0); // B starts with a clean history
    S().addNode(node('b1'));
    captureActive('B');

    expect(activateFile('A', () => null)).toBe(true); // restored from the live session, the loader is not needed
    expect(S().nodes.map((n) => n.id)).toEqual(['a1', 'a2']);
    expect(S().past).toHaveLength(2);
    S().undo();
    expect(S().nodes.map((n) => n.id)).toEqual(['a1']);
    captureActive('A');

    activateFile('B', () => null);
    expect(S().nodes.map((n) => n.id)).toEqual(['b1']);
    expect(S().past).toHaveLength(1);
    expect(S().future).toHaveLength(0); // A's undo did not leak into B's redo stack
    S().undo();
    expect(S().nodes).toEqual([]);
    activateFile('A', () => null);
    expect(S().nodes.map((n) => n.id)).toEqual(['a1']);
    expect(S().future).toHaveLength(1); // A can redo what it undid
    S().redo();
    expect(S().nodes.map((n) => n.id)).toEqual(['a1', 'a2']);
  });

  it('selection, active page and viewports survive a tab switch', () => {
    activateFile('A', () => doc('A', 'A'));
    S().addNode(node('x'));
    S().selectOnly('node', 'x');
    const second = S().addPage('Second');
    S().setPageViewport(second, { x: 10, y: 20, zoom: 1.5 });
    captureActive('A');
    activateFile('B', () => doc('B', 'B'));
    captureActive('B');
    activateFile('A', () => null);
    expect(S().activePageId).toBe(second);
    expect(S().viewports[second]).toEqual({ x: 10, y: 20, zoom: 1.5 });
    S().switchPage(S().pages[0].id);
    expect(S().nodes.find((n) => n.id === 'x')?.selected).toBe(true);
  });

  it('a file without a session is loaded from its document; unknown files report false', () => {
    expect(hasTabSession('C')).toBe(false);
    expect(activateFile('C', () => doc('C', 'From storage'))).toBe(true);
    expect(S().projectName).toBe('From storage');
    expect(activateFile('missing', () => null)).toBe(false);
    expect(S().projectId).toBe('C');
  });

  it('activating the file that is already visible keeps its live state', () => {
    activateFile('A', () => doc('A', 'A'));
    S().addNode(node('a1'));
    expect(activateFile('A', () => doc('A', 'reloaded'))).toBe(true);
    expect(S().nodes).toHaveLength(1);
    expect(S().projectName).toBe('A');
  });

  it('captureActive ignores files that are not in the store, dropTabSession forgets', () => {
    activateFile('A', () => doc('A', 'A'));
    captureActive('other');
    expect(hasTabSession('other')).toBe(false);
    captureActive('A');
    expect(hasTabSession('A')).toBe(true);
    dropTabSession('A');
    expect(hasTabSession('A')).toBe(false);
    captureActive(null);
  });

  it('liveProject gives the current document of background tabs (so a late save never writes the wrong file)', () => {
    activateFile('A', () => doc('A', 'File A'));
    S().addNode(node('a1'));
    captureActive('A');
    activateFile('B', () => doc('B', 'File B'));
    const a = liveProject('A')!;
    expect(a.id).toBe('A');
    expect(a.name).toBe('File A');
    expect(a.pages[0].nodes.map((n) => n.id)).toEqual(['a1']);
    expect(liveProject('B')!.id).toBe('B');
    expect(liveProject('nope')).toBeNull();
  });
});
