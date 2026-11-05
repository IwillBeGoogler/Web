import { describe, expect, it } from 'vitest';
import { ALL_TEMPLATES } from './index';
import { parseDiagram, serializeDiagram } from '../lib/serialization';
import { orderedFrames } from '../lib/board/frames';
import { nodeSize } from '../lib/graph';
import type { DiagramNode } from '../types';

const IDS = ['board-retro', 'board-brainstorm', 'board-journey', 'board-c4', 'board-stride', 'board-postmortem', 'board-kanban'];
const by = (id: string) => ALL_TEMPLATES.find((t) => t.id === id)!;

describe('Board templates (phase 4)', () => {
  it('are registered with the board tag and distinct names', () => {
    for (const id of IDS) {
      expect(by(id), id).toBeDefined();
      expect(by(id).tags).toEqual(expect.arrayContaining(['board']));
    }
    expect(new Set(IDS.map((i) => by(i).name)).size).toBe(7);
    expect(by('board-retro').name).toMatch(/Retro/);
    expect(by('board-retro').tags).toEqual(expect.arrayContaining(['retro']));
    expect(by('board-c4').tags).toEqual(expect.arrayContaining(['c4']));
    expect(by('board-stride').tags).toEqual(expect.arrayContaining(['security']));
  });
  for (const id of IDS) {
    describe(id, () => {
      const d = by(id).build();
      it('has unique ids, valid edges and a JSON round trip', () => {
        const ids = new Set(d.nodes.map((n) => n.id));
        expect(ids.size).toBe(d.nodes.length);
        for (const e of d.edges) { expect(ids.has(e.source), e.id).toBe(true); expect(ids.has(e.target), e.id).toBe(true); }
        expect(parseDiagram(serializeDiagram(d)).ok).toBe(true);
      });
      it('has presentable frames in a stable order', () => {
        const fr = orderedFrames(d.nodes);
        expect(fr.length).toBeGreaterThanOrEqual(1);
        expect(fr.every((f) => typeof f.data.label === 'string' && f.data.label.length > 0)).toBe(true);
        expect(fr.every((f) => typeof f.data.order === 'number')).toBe(true);
      });
      it('stickies and shapes do not overlap each other', () => {
        const rs = d.nodes.filter((n) => n.type === 'sticky' || n.type === 'shape').map((n) => ({ n, ...n.position, ...nodeSize(n) }));
        for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
          const a = rs[i], b = rs[j];
          expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height, `${a.n.id} / ${b.n.id}`).toBe(false);
        }
      });
      it('every sticky sits inside a frame', () => {
        const fr = orderedFrames(d.nodes);
        const inside = (n: DiagramNode) => fr.some((f) => { const s = nodeSize(f); return n.position.x >= f.position.x && n.position.y >= f.position.y && n.position.x + nodeSize(n).width <= f.position.x + s.width && n.position.y + nodeSize(n).height <= f.position.y + s.height; });
        for (const s of d.nodes.filter((n) => n.type === 'sticky')) expect(inside(s), s.id).toBe(true);
      });
    });
  }
  it('the retro has Start, Stop and Continue columns', () => {
    const labels = orderedFrames(by('board-retro').build().nodes).map((f) => f.data.label);
    expect(labels).toEqual(expect.arrayContaining(['Start', 'Stop', 'Continue']));
  });
  it('STRIDE has the six categories', () => {
    const labels = orderedFrames(by('board-stride').build().nodes).map((f) => String(f.data.label));
    for (const w of ['Spoofing', 'Tampering', 'Repudiation', 'Information disclosure', 'Denial of service', 'Elevation of privilege']) expect(labels.some((l) => l.startsWith(w)), w).toBe(true);
  });
  it('C4 has a context and a container frame with labelled relationships', () => {
    const d = by('board-c4').build();
    const labels = orderedFrames(d.nodes).map((f) => String(f.data.label));
    expect(labels.some((l) => /context/i.test(l))).toBe(true);
    expect(labels.some((l) => /container/i.test(l))).toBe(true);
    expect(d.edges.length).toBeGreaterThanOrEqual(6);
    expect(d.edges.every((e) => typeof e.label === 'string' && e.label.length > 0)).toBe(true);
  });
  it('Kanban has To do, Doing and Done', () => {
    const labels = orderedFrames(by('board-kanban').build().nodes).map((f) => f.data.label);
    expect(labels).toEqual(['To do', 'Doing', 'Done']);
  });
});
