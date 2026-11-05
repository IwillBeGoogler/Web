import { describe, expect, it } from 'vitest';
import type { AutoLayoutConfig, DiagramNode } from '../../types';
import { designPass } from './reflow';

const cfg: AutoLayoutConfig = { mode: 'row', gap: 10, padding: 10, align: 'start', justify: 'start', hugW: true, hugH: true };
const box = (id: string, w: number, h: number, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'card', position: { x: 0, y: 0 }, width: w, height: h, data: { label: id }, ...extra }) as DiagramNode;
const g = (over: Partial<DiagramNode> = {}, c: AutoLayoutConfig | undefined = cfg): DiagramNode => ({ id: 'g', type: 'group', position: { x: 0, y: 0 }, width: 10, height: 10, data: { label: 'g', ...(c ? { autoLayout: c } : {}) }, ...over }) as DiagramNode;

describe('designPass', () => {
  it('reflows auto-layout containers when a child is added', () => {
    const prev = [g(), box('a', 50, 20, { parentId: 'g' })];
    const next = [...prev, box('b', 50, 20, { parentId: 'g' })];
    const out = designPass(prev, next, { dragging: false })!;
    expect(out.find((n) => n.id === 'b')!.position.x).toBe(70);
  });
  it('does nothing while a node is being dragged (the drop decides) and when nothing changed', () => {
    const prev = [g(), box('a', 50, 20, { parentId: 'g' })];
    const dragged = [prev[0], { ...prev[1], dragging: true, position: { x: 99, y: 99 } } as DiagramNode];
    expect(designPass(prev, dragged, { dragging: true })).toBeNull();
    const laid = designPass(prev, [...prev, box('b', 5, 5, { parentId: 'g' })], { dragging: false })!;
    expect(designPass(laid, laid, { dragging: false })).toBeNull();
  });
  it('applies child constraints when their frame is resized', () => {
    const frame = (w: number): DiagramNode => ({ id: 'f', type: 'frame', position: { x: 0, y: 0 }, width: w, height: 100, data: { label: 'f' } }) as DiagramNode;
    const kid: DiagramNode = box('k', 20, 20, { position: { x: 70, y: 10 }, data: { label: 'k', constraints: { h: 'right', v: 'top' } } as never });
    const out = designPass([frame(100), kid], [frame(200), kid], { dragging: false })!;
    expect(out.find((n) => n.id === 'k')!.position.x).toBe(170);
    expect(out.find((n) => n.id === 'f')!.width).toBe(200);
  });
  it('constraints also work for group children (relative coordinates)', () => {
    const grp = (w: number): DiagramNode => ({ id: 'g', type: 'group', position: { x: 0, y: 0 }, width: w, height: 100, data: { label: 'g' } }) as DiagramNode;
    const kid = box('k', 20, 20, { parentId: 'g', position: { x: 70, y: 10 }, data: { label: 'k', constraints: { h: 'stretch', v: 'top' } } as never });
    const out = designPass([grp(100), kid], [grp(160), kid], { dragging: false })!;
    expect(out.find((n) => n.id === 'k')!.width).toBe(80);
  });
});
