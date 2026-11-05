import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clickPlace, overlaps, type Rect } from './placement';
import { clickAdd, resetClickAnchor, visibleFlowArea } from './clickAdd';
import { useDiagramStore } from '../store/diagramStore';
import { absolutePosition, nodeSize } from './graph';
import { createNodeFromPaletteItem, getItem } from '../data/palette';
import type { DiagramNode } from '../types';

const icon = (id: string, x: number, y: number, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 120, height: 96, data: { label: id }, ...extra });
const group = (id: string, x: number, y: number, w = 400, h = 300, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'group', position: { x, y }, width: w, height: h, data: { label: id }, ...extra });
const abs = (nodes: DiagramNode[], n: DiagramNode): Rect => ({ ...absolutePosition(nodes, n), ...nodeSize(n) });
const VIEW: Rect = { x: 0, y: 0, width: 900, height: 500 };
const WIDE: Rect = { x: 0, y: 0, width: 1400, height: 500 };
const inView = (r: Rect, v: Rect) => r.x >= v.x && r.y >= v.y && r.x + r.width <= v.x + v.width && r.y + r.height <= v.y + v.height;
const s = () => useDiagramStore.getState();
beforeEach(() => {
  s().reset();
  resetClickAnchor();
});

describe('clickPlace', () => {
  it('centre occupied: lands in a free spot inside the visible viewport', () => {
    const existing = [icon('c', 390, 200)];
    const r = clickPlace(existing, [icon('n', 0, 0)], { view: VIEW });
    const a = abs([...existing, ...r.nodes], r.nodes[0]);
    expect(r.outside).toBe(false);
    expect(inView(a, VIEW)).toBe(true);
    expect(overlaps(a, abs(existing, existing[0]), 16)).toBe(false);
    expect(a.x % 20).toBe(0);
    expect(a.y % 20).toBe(0);
  });
  it('empty viewport: the node goes to the centre', () => {
    const r = clickPlace([], [icon('n', 0, 0)], { view: VIEW });
    const a = abs(r.nodes, r.nodes[0]);
    expect(Math.abs(a.x + a.width / 2 - 450)).toBeLessThanOrEqual(20);
    expect(Math.abs(a.y + a.height / 2 - 250)).toBeLessThanOrEqual(30);
  });
  it('prefers the spot right of the anchor (same row)', () => {
    const anchor = icon('a', 100, 100);
    const r = clickPlace([anchor], [icon('n', 0, 0)], { view: VIEW, anchor });
    const a = abs(r.nodes, r.nodes[0]);
    expect(a.y).toBe(100);
    expect(a.x).toBeGreaterThanOrEqual(100 + 120 + 16);
    expect(a.x).toBeLessThan(100 + 120 + 16 + 40);
  });
  it('5 consecutive clicks form a non-overlapping row, left to right', () => {
    const all: DiagramNode[] = [];
    for (let i = 0; i < 5; i++) {
      const anchor = all[all.length - 1];
      const r = clickPlace(all, [icon(`n${i}`, 0, 0)], { view: WIDE, anchor });
      all.push(r.nodes[0]);
    }
    const rects = all.map((n) => abs(all, n));
    expect(new Set(rects.map((r) => r.y)).size).toBe(1);
    for (let i = 1; i < rects.length; i++) expect(rects[i].x).toBeGreaterThan(rects[i - 1].x);
    for (let i = 0; i < rects.length; i++) {
      expect(inView(rects[i], WIDE)).toBe(true);
      for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j], 16)).toBe(false);
    }
  });
  it('wraps to the next row, starting at the row start', () => {
    const narrow: Rect = { x: 0, y: 0, width: 420, height: 500 };
    const all: DiagramNode[] = [];
    for (let i = 0; i < 4; i++) {
      const r = clickPlace(all, [icon(`n${i}`, 0, 0)], { view: narrow, anchor: all[all.length - 1] });
      all.push(r.nodes[0]);
    }
    const rects = all.map((n) => abs(all, n));
    expect(rects.every((r) => inView(r, narrow))).toBe(true);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j], 16)).toBe(false);
    const rowStart = Math.min(...rects.map((r) => r.x));
    const second = rects.filter((r) => r.y > rects[0].y);
    expect(second.length).toBeGreaterThan(0);
    expect(second[0].x).toBe(rowStart);
  });
  it('no free spot in view: lands outside, flagged', () => {
    const cover = group('cover', -50, -50, 1100, 700);
    const r = clickPlace([cover], [icon('n', 0, 0)], { view: VIEW });
    const a = abs([cover, ...r.nodes], r.nodes[0]);
    expect(r.outside).toBe(true);
    expect(overlaps(a, abs([cover], cover), 0)).toBe(false);
    expect(r.nodes[0].parentId).toBeUndefined();
  });
  it('never lands inside a group unless it is selected', () => {
    const g = group('g', 200, 100, 500, 300);
    const r = clickPlace([g], [icon('n', 0, 0)], { view: VIEW });
    const a = abs([g, ...r.nodes], r.nodes[0]);
    expect(r.nodes[0].parentId).toBeUndefined();
    expect(overlaps(a, abs([g], g), 0)).toBe(false);
  });
  it('selected group: lands inside it, free of its children', () => {
    const g = group('g', 100, 50, 500, 360, { selected: true });
    let nodes: DiagramNode[] = [g];
    for (let i = 0; i < 4; i++) {
      const r = clickPlace(nodes, [icon(`n${i}`, 0, 0)], { view: VIEW, group: g });
      expect(r.nodes[0].parentId, `n${i}`).toBe('g');
      nodes = [...nodes, r.nodes[0]];
    }
    const kids = nodes.slice(1).map((n) => abs(nodes, n));
    const gr = abs(nodes, g);
    for (const k of kids) expect(inView(k, gr)).toBe(true);
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) expect(overlaps(kids[i], kids[j], 16)).toBe(false);
  });
});

describe('clickAdd (store + viewport pan)', () => {
  it('consecutive clicks with the store: tidy row, no pan', () => {
    const setCenter = vi.fn();
    for (let i = 0; i < 5; i++) clickAdd([createNodeFromPaletteItem(getItem('postgresql')!, { x: 450, y: 250 }, `p${i}`)], { view: VIEW, zoom: 1, setCenter });
    const ns = s().nodes;
    expect(ns).toHaveLength(5);
    const rects = ns.map((n) => abs(ns, n));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j], 16)).toBe(false);
    expect(setCenter).not.toHaveBeenCalled();
  });
  it('full viewport: node goes outside and setCenter pans to it', () => {
    s().addNode(group('cover', -50, -50, 1100, 700));
    const setCenter = vi.fn();
    const out = clickAdd([icon('n', 0, 0)], { view: VIEW, zoom: 1.5, setCenter });
    expect(out.outside).toBe(true);
    expect(setCenter).toHaveBeenCalledOnce();
    const [x, y, o] = setCenter.mock.calls[0];
    const n = s().nodes.find((x2) => x2.id === 'n')!;
    expect(x).toBe(n.position.x + 60);
    expect(y).toBe(n.position.y + 48);
    expect(o).toMatchObject({ zoom: 1.5, duration: 300 });
  });
  it('a selected group receives the node', () => {
    s().addNode(group('g', 100, 50, 500, 360, { selected: true }));
    clickAdd([icon('n', 0, 0)], { view: VIEW, zoom: 1, setCenter: vi.fn() });
    expect(s().nodes.find((n) => n.id === 'n')!.parentId).toBe('g');
  });
  it('drop onto a node is nudged to the nearest free spot (placeNodes)', () => {
    s().addNode(icon('a', 300, 300));
    s().placeNodes([icon('b', 310, 310)]);
    const [a, b] = s().nodes;
    expect(overlaps(abs(s().nodes, a), abs(s().nodes, b), 16)).toBe(false);
    expect(Math.hypot(b.position.x - 310, b.position.y - 310)).toBeLessThan(400);
  });
  it('drop on a free spot stays exactly where it was dropped', () => {
    s().addNode(icon('a', 300, 300));
    s().placeNodes([icon('b', 900, 700)]);
    expect(s().nodes[1].position).toEqual({ x: 900, y: 700 });
  });
});

describe('visibleFlowArea', () => {
  it('applies the insets in flow space (zoom 2, pan 100/50)', () => {
    const toFlow = (p: { x: number; y: number }) => ({ x: (p.x - 100) / 2, y: (p.y - 50) / 2 });
    const a = visibleFlowArea({ left: 0, top: 0, width: 1000, height: 600 }, { top: 100, bottom: 100, left: 300, right: 300 }, toFlow);
    expect(a).toEqual({ x: 100, y: 25, width: 200, height: 200 });
  });
  it('falls back to 1000x700 without a measured pane (jsdom)', () => {
    const a = visibleFlowArea(null, { top: 0, bottom: 0, left: 0, right: 0 }, (p) => p);
    expect(a).toEqual({ x: 0, y: 0, width: 1000, height: 700 });
  });
});
