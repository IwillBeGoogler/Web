import { describe, expect, it } from 'vitest';
import { buildThumbnail } from './thumbnail';
import { monitoringStack } from '../templates/monitoringStack';
import type { DiagramNode } from '../types';

const n = (id: string, x: number, y: number, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 80, data: { label: id }, ...extra });

describe('buildThumbnail', () => {
  it('empty page yields a valid empty svg', () => {
    const svg = buildThumbnail([], [], { width: 240, height: 150 });
    expect(svg).toMatch(/^<svg[^>]+viewBox="0 0 240 150"/);
    expect(svg).not.toMatch(/<rect[^>]+data-node/);
  });
  it('draws a mark per node and a line per edge, scaled to fit', () => {
    const svg = buildThumbnail([n('a', 0, 0), n('b', 1000, 500)], [{ id: 'e', source: 'a', target: 'b' }], { width: 240, height: 150 });
    expect((svg.match(/data-node/g) ?? []).length).toBe(2);
    expect((svg.match(/data-edge/g) ?? []).length).toBe(1);
    const xs = [...svg.matchAll(/data-node[^>]*\sx="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(Math.max(...xs)).toBeLessThanOrEqual(240);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
  });
  it('uses absolute positions for children and renders groups as dashed boxes', () => {
    const g: DiagramNode = { id: 'g', type: 'group', position: { x: 0, y: 0 }, width: 400, height: 300, data: { label: 'g' } };
    const svg = buildThumbnail([g, n('a', 10, 10, { parentId: 'g' })], [], { width: 240, height: 150 });
    expect(svg).toContain('stroke-dasharray');
    expect((svg.match(/data-node/g) ?? []).length).toBe(2);
  });
  it('is deterministic, escapes nothing unsafe and handles the template', () => {
    const t = monitoringStack();
    const a = buildThumbnail(t.nodes, t.edges, { width: 240, height: 150 });
    expect(a).toBe(buildThumbnail(t.nodes, t.edges, { width: 240, height: 150 }));
    expect(a).not.toMatch(/<script|onload|javascript:/i);
    expect((a.match(/data-node/g) ?? []).length).toBe(t.nodes.length);
  });
});

describe('Board thumbnails', () => {
  const frame = { id: 'f', type: 'frame', position: { x: 0, y: 0 }, width: 400, height: 300, data: { label: 'F' } } as never;
  const sticky = { id: 's', type: 'sticky', position: { x: 20, y: 20 }, width: 160, height: 140, data: { label: '', fill: '#bfe0ff' } } as never;
  const odd = { id: 't', type: 'sticky', position: { x: 220, y: 20 }, width: 160, height: 140, data: { label: '', fill: 'url(javascript:x)' } } as never;
  it('draws a frame as an outline (like a group), not as a filled box', () => {
    const svg = buildThumbnail([frame], [], { width: 200, height: 120 });
    expect(svg).toMatch(/data-node="f"[^>]*fill="none"/);
  });
  it('colours a sticky with its own colour, and ignores anything that is not a hex colour', () => {
    const svg = buildThumbnail([frame, sticky, odd], [], { width: 200, height: 120 });
    expect(svg).toMatch(/data-node="s"[^>]*fill="#bfe0ff"/);
    expect(svg).toMatch(/data-node="t"[^>]*fill="#fde68a"/);
    expect(svg).not.toContain('javascript');
  });
});
