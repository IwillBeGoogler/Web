import { describe, expect, it } from 'vitest';
import { systemDesignBoard, TEMPLATES } from './systemDesignBoard';
import { ALL_TEMPLATES } from './index';
import { parseDiagram, serializeDiagram } from '../lib/serialization';
import { absolutePosition, nodeSize } from '../lib/graph';
import { overlaps } from '../lib/placement';
import { computeRoutes, DEFAULT_ROUTING, rectOf } from '../lib/routing';
import { polylineIntersectsRects } from '../lib/routing/geometry';
import { contrastRatio, isDarkBackground } from '../lib/contrast';
import { resolveSettings, validateSettings } from '../lib/settings';
import { buildThumbnail } from '../lib/thumbnail';

describe('System design board template', () => {
  const t = systemDesignBoard();
  const byId = new Map(t.nodes.map((n) => [n.id, n]));

  it('is registered with the board / system-design tags', () => {
    expect(TEMPLATES).toHaveLength(1);
    expect(TEMPLATES[0]).toMatchObject({ id: 'system-design-board', name: 'System design board' });
    expect(TEMPLATES[0].tags).toEqual(expect.arrayContaining(['board', 'system-design']));
    expect(ALL_TEMPLATES.filter((x) => x.id === 'system-design-board')).toHaveLength(1);
  });
  it('is generic: placeholder title and no brand text', () => {
    expect(byId.get('title')!.data.label).toBe('<System name> system design');
    expect(byId.get('subtitle')!.data.label).toBe('<one line: how one request travels through the system>');
    const all = t.nodes.map((n) => `${n.data.label} ${n.data.subtitle ?? ''}`).join(' ').toLowerCase();
    for (const brand of ['whatsapp', 'kafka', 'redis', 'postgres', 'aws', 'google']) expect(all).not.toContain(brand);
  });
  it('has the sections, the legend and six numbered challenge cards', () => {
    const groups = t.nodes.filter((n) => n.type === 'group').map((n) => n.data.label);
    for (const l of ['A  Clients', 'B  Edge & connection', 'C  Core services', 'D  Main flow', 'E  Storage & queues', 'F  Consumers', 'G  Status semantics', 'L  Observability & reliability', 'System design challenges', 'Legend']) expect(groups, l).toContain(l);
    expect(groups.filter((l) => /^Feature \d/.test(l))).toHaveLength(4);
    const cards = t.nodes.filter((n) => n.parentId === 'ch' && n.type === 'group');
    expect(cards.map((c) => c.data.label)).toEqual(['1  Scale', '2  Latency', '3  Availability', '4  Consistency', '5  Failure handling', '6  Cost']);
    expect(t.nodes.filter((n) => n.data.shape === 'diamond')).toHaveLength(1);
    expect(t.nodes.filter((n) => n.data.shape === 'cylinder')).toHaveLength(1);
    expect(groups.filter((_, i) => t.nodes.filter((n) => n.type === 'group')[i].data.variant === 'dashed').length).toBeGreaterThanOrEqual(15);
  });
  it('every section carries a hand-written note', () => {
    // section -> the note node that sits inside it
    const notes: Record<string, string> = { a: 'a-n', b: 'b-n', c: 'c-n', e: 'e-n', f: 'f-n', d: 'd1-n', g: 'g-n', ft1: 'ft1-notes', ft2: 'ft2-notes', ft3: 'ft3-notes', ft4: 'ft4-notes', l: 'l1-n', ch: 'ch-n' };
    for (const [section, id] of Object.entries(notes)) expect(byId.get(id)?.parentId, `${section} -> ${id}`).toBe(section);
    for (const id of ['a-n', 'b-n', 'c-n', 'f-n', 'g-n', 'ch-n', 'ft1-notes', 'ft2-notes', 'ft3-notes', 'ft4-notes', 'd1-n', 'l1-n']) expect(String(byId.get(id)?.data.label), id).toContain('✎');
  });
  it('section D has the numbered whole-lifecycle list beside the flow and the fork callout next to the diamond', () => {
    const list = String(byId.get('d-life-t')!.data.label).split('\n');
    expect(list).toHaveLength(10);
    list.forEach((l, i) => expect(l.startsWith(`${i + 1}  `), l).toBe(true));
    expect(byId.get('d-life')!.parentId).toBe('d');
    const fork = byId.get('d-fork')!;
    expect(fork.data.label).toBe('The fork everyone asks about');
    expect(fork.data.stroke).toBe('#f2b84b');
    expect(fork.data.strokeStyle).toBe('dashed');
    const fb = { ...absolutePosition(t.nodes, fork), ...nodeSize(fork) };
    const dia = { ...absolutePosition(t.nodes, byId.get('d3')!), ...nodeSize(byId.get('d3')!) };
    expect(Math.abs(fb.x + fb.width / 2 - (dia.x + dia.width / 2))).toBeLessThan(200);
    expect(dia.y - (fb.y + fb.height)).toBeGreaterThan(0);
    expect(dia.y - (fb.y + fb.height)).toBeLessThan(60);
  });
  it('has the status model: four state cards in order, a red dashed classic-bug note', () => {
    expect(['g1', 'g2', 'g3', 'g4'].map((id) => byId.get(id)!.data.label)).toEqual(['pending', 'accepted', 'processed', 'confirmed']);
    for (let i = 1; i < 4; i++) expect(t.edges.some((e) => e.source === `g${i}` && e.target === `g${i + 1}`)).toBe(true);
    const bug = byId.get('g-bug')!;
    expect(bug.data).toMatchObject({ label: 'Classic bug', stroke: '#ef7070', strokeStyle: 'dashed' });
  });
  it('async / warning notes are amber dashed, failure notes red dashed', () => {
    const dashed = (c: string) => t.nodes.filter((n) => n.type === 'group' && n.data.stroke === c && n.data.strokeStyle === 'dashed' && n.parentId).map((n) => n.id);
    expect(dashed('#f2b84b')).toEqual(expect.arrayContaining(['e-n', 'g-async', 'ft3-side', 'd-fork']));
    expect(dashed('#ef7070')).toEqual(expect.arrayContaining(['d-fail', 'g-bug', 'ft4-side', 'l-drill1', 'l-drill2', 'l-drill3']));
  });
  it('feature 1 and 2 compare Option A vs Option B with plus and minus lines', () => {
    for (const f of ['ft1', 'ft2']) {
      for (const k of ['a', 'b']) {
        expect(byId.get(`${f}-opt-${k}`)!.data.label).toBe(`Option ${k.toUpperCase()}`);
        expect(String(byId.get(`${f}-opt-${k}-p`)!.data.label)).toMatch(/^\+ /);
        expect(String(byId.get(`${f}-opt-${k}-m`)!.data.label)).toMatch(/^− /);
      }
      expect(byId.get(`${f}-vs`)!.data.label).toBe('vs');
    }
  });
  it('observability has a second row of three failure drills (dependency down, retries, overload)', () => {
    expect(['l-drill1', 'l-drill2', 'l-drill3'].map((id) => byId.get(id)!.data.label)).toEqual(['Drill 1  Dependency down', 'Drill 2  Retries pile up', 'Drill 3  Overload']);
    expect(t.nodes.filter((n) => n.parentId === 'l' && n.type === 'shape')).toHaveLength(6);
  });
  it('uses all four flow kinds with distinct colours (ACK dotted, async dashed)', () => {
    const kinds = new Map<string, Set<string>>();
    for (const e of t.edges) kinds.set(String(e.data?.flowKind), (kinds.get(String(e.data?.flowKind)) ?? new Set()).add(`${e.data?.color}/${e.data?.strokeStyle}`));
    expect([...kinds.keys()].sort()).toEqual(['ack', 'async', 'fail', 'main']);
    expect([...kinds.values()].every((s) => s.size === 1)).toBe(true);
    expect(new Set([...kinds.values()].map((s) => [...s][0].split('/')[0])).size).toBe(4);
    expect(t.edges.find((e) => e.data?.flowKind === 'ack')!.data?.strokeStyle).toBe('dotted');
  });
  it('sets a dark canvas, light edges and the sketch look', () => {
    const s = resolveSettings(undefined, t.settings);
    expect(isDarkBackground(s.canvas.background)).toBe(true);
    expect(s.canvas.sketch).toBe(true);
    expect(contrastRatio(s.edge.color, s.canvas.background)).toBeGreaterThanOrEqual(7);
    expect(validateSettings(t.settings)).toEqual(t.settings);
  });
  it('every text colour and edge colour is legible on the canvas', () => {
    const bg = t.settings!.canvas!.background!;
    for (const n of t.nodes) expect(contrastRatio(String(n.data.textColor), bg), n.id).toBeGreaterThanOrEqual(4.5);
    for (const e of t.edges) expect(contrastRatio(String(e.data?.color), bg), e.id).toBeGreaterThanOrEqual(3);
  });
  it('unique ids; every edge endpoint exists', () => {
    expect(new Set(t.nodes.map((n) => n.id)).size).toBe(t.nodes.length);
    expect(new Set(t.edges.map((e) => e.id)).size).toBe(t.edges.length);
    for (const e of t.edges) expect(byId.has(e.source) && byId.has(e.target), e.id).toBe(true);
  });
  it('no two leaf nodes overlap', () => {
    const leaves = t.nodes.filter((n) => n.type !== 'group');
    const box = (n: (typeof t.nodes)[number]) => ({ ...absolutePosition(t.nodes, n), ...nodeSize(n) });
    for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) expect(overlaps(box(leaves[i]), box(leaves[j]), 0), `${leaves[i].id} / ${leaves[j].id}`).toBe(false);
  });
  it('children sit inside their parent group', () => {
    for (const n of t.nodes.filter((x) => x.parentId)) {
      const p = byId.get(n.parentId!)!;
      const s = nodeSize(n);
      const ps = nodeSize(p);
      expect(n.position.x, n.id).toBeGreaterThanOrEqual(0);
      expect(n.position.y, n.id).toBeGreaterThanOrEqual(0);
      expect(n.position.x + s.width, n.id).toBeLessThanOrEqual(ps.width);
      expect(n.position.y + s.height, n.id).toBeLessThanOrEqual(ps.height);
    }
  });
  it('round-trips through serialization, settings included', () => {
    const r = parseDiagram(serializeDiagram(t));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect({ nodes: r.diagram.nodes.length, edges: r.diagram.edges.length }).toEqual({ nodes: t.nodes.length, edges: t.edges.length });
      expect(r.diagram.settings).toEqual(t.settings);
      expect(r.diagram.settings?.canvas).toMatchObject({ background: '#101114', sketch: true });
    }
  });
  it('drops malformed settings fields on parse but keeps the valid ones; a diagram without settings stays without', () => {
    const raw = JSON.parse(serializeDiagram(t));
    raw.settings = { canvas: { background: '#101114', sketch: 'yes' }, bogus: 1 };
    const r = parseDiagram(JSON.stringify(raw));
    expect(r.ok && r.diagram.settings).toEqual({ canvas: { background: '#101114' } });
    const plain = parseDiagram(serializeDiagram({ ...t, settings: undefined }));
    expect(plain.ok && 'settings' in plain.diagram).toBe(false);
  });
  it('every edge is routed and none passes through a node', () => {
    const routes = computeRoutes(t.nodes, t.edges, { ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(undefined, undefined).edge });
    const isCont = (n: (typeof t.nodes)[number]) => n.type === 'group' || n.type === 'cluster';
    for (const e of t.edges) {
      const r = routes.get(e.id);
      expect(r, e.id).toBeTruthy();
      expect(r!.routed || r!.manual, `${e.source}->${e.target} fell back`).toBe(true);
      const others = t.nodes.filter((n) => !isCont(n) && n.id !== e.source && n.id !== e.target).map((n) => rectOf(t.nodes, n));
      expect(polylineIntersectsRects(r!.points, others), `${e.source}->${e.target} crosses a node`).toBe(false);
    }
  });
  it('thumbnail paints the dark canvas', () => {
    const svg = buildThumbnail(t.nodes, t.edges, { width: 360, height: 225 }, 10, t.settings!.canvas!.background);
    expect(svg).toContain(`fill="${t.settings!.canvas!.background}"`);
    expect(svg).toContain('#b6bdcb');
  });
});
