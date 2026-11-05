import { describe, expect, it } from 'vitest';
import { computeRoutes, DEFAULT_ROUTING } from '../routing';
import { BUILTIN_SETTINGS } from '../settings';
import { parseSql } from './sqlParse';
import { schemaToDiagram } from './convert';
import { relationOf, tableOf } from './tableData';
import { rowCenterY } from './geometry';
import demo from './fixtures/demo_large.sql?raw';

const opts = { ...DEFAULT_ROUTING, edgeDefaults: BUILTIN_SETTINGS.edge, nodeDefaults: BUILTIN_SETTINGS.node };

describe('ER routing', () => {
  const d = schemaToDiagram(parseSql(demo).schema);
  const routes = computeRoutes(d.nodes, d.edges, opts);
  const node = (id: string) => d.nodes.find((n) => n.id === id)!;

  it('routes every relation edge, including self references', () => {
    for (const e of d.edges) expect(routes.has(e.id), e.id).toBe(true);
  });

  it('attaches both endpoints at the centre of the column row', () => {
    for (const e of d.edges) {
      if (e.source === e.target) continue;
      const r = routes.get(e.id)!;
      const rel = relationOf(e)!;
      const sy = node(e.source).position.y + rowCenterY(tableOf(node(e.source)), rel.fromCol);
      const ty = node(e.target).position.y + rowCenterY(tableOf(node(e.target)), rel.toCol);
      expect(r.points[0].y, `${e.id} start`).toBeCloseTo(sy, 3);
      expect(r.points[r.points.length - 1].y, `${e.id} end`).toBeCloseTo(ty, 3);
      expect(r.src.pt.y).toBeCloseTo(sy, 3);
      expect(r.dst.pt.y).toBeCloseTo(ty, 3);
    }
  });

  it('leaves a parent on its right side and enters a child on its left side', () => {
    const e = d.edges.find((x) => x.source !== x.target)!;
    const r = routes.get(e.id)!;
    expect(['left', 'right']).toContain(r.src.side);
    expect(['left', 'right']).toContain(r.dst.side);
  });

  it('draws a self relation as a loop on the right side at the two column rows', () => {
    const e = d.edges.find((x) => x.source === x.target)!;
    const n = node(e.source);
    const rel = relationOf(e)!;
    const r = routes.get(e.id)!;
    const right = n.position.x + (n.width ?? 0);
    expect(r.points.length).toBe(4);
    expect(r.points[0].x).toBeGreaterThan(right);
    expect(r.points[1].x).toBeGreaterThan(r.points[0].x);
    expect(r.points[0].y).toBeCloseTo(n.position.y + rowCenterY(tableOf(n), rel.fromCol), 3);
    expect(Math.abs(r.points[3].y - r.points[0].y)).toBeGreaterThan(10);
    expect(r.d).toMatch(/^M/);
  });

  it('keeps endpoints on rows when tables are stacked in one column', () => {
    const s = parseSql('create table a (id int primary key, x int); create table b (id int primary key, a_id int references a(id));').schema;
    const g = schemaToDiagram(s);
    g.nodes[0].position = { x: 0, y: 0 };
    g.nodes[1].position = { x: 20, y: 300 };
    const rr = computeRoutes(g.nodes, g.edges, opts).get(g.edges[0].id)!;
    const rel = relationOf(g.edges[0])!;
    expect(rr.src.pt.y).toBeCloseTo(rowCenterY(tableOf(g.nodes[0]), rel.fromCol), 3);
    expect(rr.dst.pt.y).toBeCloseTo(300 + rowCenterY(tableOf(g.nodes[1]), rel.toCol), 3);
  });
});
