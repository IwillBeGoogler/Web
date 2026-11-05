import { describe, expect, it } from 'vitest';
import { centerViewport, contentBounds, DEFAULT_VIEWPORT, initialViewport, isViewport } from './viewport';
import { parseProject, serializeProject, createProject } from './project';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramNode } from '../types';

const n = (id: string, x: number, y: number, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id }, ...extra });

describe('centerViewport', () => {
  it('keeps zoom 1 and centres the bounding box (pan only)', () => {
    const v = centerViewport({ x: 100, y: 200, width: 400, height: 200 }, { width: 1000, height: 600 });
    expect(v).toEqual({ x: 1000 / 2 - 300, y: 600 / 2 - 300, zoom: 1 });
  });
  it('content larger than the viewport still stays at 100%', () => {
    const v = centerViewport({ x: 0, y: 0, width: 5000, height: 4000 }, { width: 1000, height: 600 });
    expect(v.zoom).toBe(1);
    expect(v.x).toBe(24); // top-left sits 24px inside the free area (never under the top bar)
    expect(v.y).toBe(24);
  });
  it('insets keep the content clear of the top bar and the panels', () => {
    const ins = { top: 76, left: 300, right: 300, bottom: 70 };
    const big = centerViewport({ x: 10, y: 20, width: 5000, height: 4000 }, { width: 1400, height: 900 }, ins);
    expect({ x: big.x + 10, y: big.y + 20 }).toEqual({ x: 324, y: 100 });
    const small = centerViewport({ x: 0, y: 0, width: 200, height: 100 }, { width: 1400, height: 900 }, ins);
    expect(small.x).toBe(300 + (800 - 200) / 2);
    expect(small.y).toBe(76 + (754 - 100) / 2);
  });
});

describe('contentBounds / initialViewport', () => {
  it('bounds use absolute positions of children', () => {
    const g = n('g', 100, 100, { type: 'group', width: 400, height: 300 });
    const b = contentBounds([g, n('a', 10, 10, { parentId: 'g' })]);
    expect(b).toEqual({ x: 100, y: 100, width: 400, height: 300 });
  });
  it('empty page opens at origin, 100%', () => {
    expect(initialViewport([], undefined, { width: 800, height: 600 })).toEqual(DEFAULT_VIEWPORT);
    expect(DEFAULT_VIEWPORT.zoom).toBe(1);
  });
  it('a saved viewport wins; otherwise the content is centred at zoom 1', () => {
    const saved = { x: 5, y: 6, zoom: 1.5 };
    expect(initialViewport([n('a', 0, 0)], saved, { width: 800, height: 600 })).toEqual(saved);
    const v = initialViewport([n('a', 0, 0)], undefined, { width: 800, height: 600 });
    expect(v.zoom).toBe(1);
    expect(v.x).toBe(400 - 50);
    expect(v.y).toBe(300 - 30);
  });
  it('isViewport', () => {
    expect(isViewport({ x: 1, y: 2, zoom: 1 })).toBe(true);
    expect(isViewport({ x: 1, y: 2, zoom: 0 })).toBe(false);
    expect(isViewport({ x: 'a', y: 2, zoom: 1 })).toBe(false);
  });
});

describe('per-page viewport persistence', () => {
  it('store keeps one viewport per page and survives toProject/loadProject and JSON', () => {
    const s = () => useDiagramStore.getState();
    s().reset();
    const first = s().activePageId;
    s().setPageViewport(first, { x: 10, y: 20, zoom: 1.25 });
    const second = s().addPage('B');
    s().setPageViewport(second, { x: -5, y: 7, zoom: 0.5 });
    const project = s().toProject();
    expect(project.pages.map((p) => p.viewport)).toEqual([{ x: 10, y: 20, zoom: 1.25 }, { x: -5, y: 7, zoom: 0.5 }]);
    const r = parseProject(serializeProject(project));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s().reset();
    s().loadProject(r.project);
    expect(s().viewports[first]).toEqual({ x: 10, y: 20, zoom: 1.25 });
    expect(s().viewports[second]).toEqual({ x: -5, y: 7, zoom: 0.5 });
  });
  it('deleting a page drops its viewport; invalid viewports are rejected on import', () => {
    const s = () => useDiagramStore.getState();
    s().reset();
    const second = s().addPage();
    s().setPageViewport(second, { x: 1, y: 1, zoom: 1 });
    s().deletePage(second);
    expect(s().viewports[second]).toBeUndefined();
    const p = createProject('X');
    const raw = JSON.parse(serializeProject(p));
    raw.pages[0].viewport = { x: 'bad', y: 0, zoom: 1 };
    expect(parseProject(JSON.stringify(raw)).ok).toBe(false);
  });
});
