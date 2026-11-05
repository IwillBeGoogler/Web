import { beforeEach, describe, expect, it } from 'vitest';
import { applyText } from '../dsl/bridge';
import { useDiagramStore } from '../../store/diagramStore';
import { executeAction } from '../actions';
import { getMenuItems } from '../menu';
import { runLayout, runSeparateLabels, runAlignGroups, LAYOUTS } from './layoutBridge';

const s = () => useDiagramStore.getState();
const TEXT = '#!sdd 1\nnode a "A"\nnode b "B"\nnode c "C"\nnode d "D"\na -> b "calls"\na -> c "calls too"\nb -> d\nc -> d\n';
beforeEach(() => {
  s().reset();
  applyText(TEXT);
  s().nodes.forEach((n) => s().setNodePosition(n.id, { x: 7, y: 7 })); // everything on top of each other
});

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const boxes = () => s().nodes.map((n) => ({ x: n.position.x, y: n.position.y, w: n.width ?? 120, h: n.height ?? 96 }));

describe('layouts on the canvas', () => {
  for (const algo of LAYOUTS) {
    it(`${algo}: separates the nodes, is one undo step`, () => {
      const past = s().past.length;
      expect(runLayout(algo)).toBe(true);
      const b = boxes();
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) expect(overlap(b[i], b[j])).toBe(false);
      expect(s().past.length).toBe(past + 1);
      s().undo();
      expect(s().nodes.every((n) => n.position.x === 7 && n.position.y === 7)).toBe(true);
    });
  }
  it('orthogonal also switches the edges to orthogonal lines', () => {
    runLayout('orthogonal');
    expect(s().edges.every((e) => e.data?.lineType === 'orthogonal')).toBe(true);
  });
  it('is reachable from the command actions (layout:<algo>:<dir>)', () => {
    executeAction('layout:layered:TB');
    const y = (id: string) => s().nodes.find((n) => n.id === id)!.position.y;
    expect(y('a')).toBeLessThan(y('b'));
    expect(y('b')).toBeLessThan(y('d'));
  });
});

describe('tidy selection', () => {
  it('moves only the selected, locked and unselected nodes stay, the selection keeps its top-left', () => {
    s().nodes.forEach((n, i) => s().setNodePosition(n.id, { x: 100 + i * 5, y: 200 + i * 5 }));
    const before = new Map(s().nodes.map((n) => [n.id, { ...n.position }]));
    s().selectOnly('node', 'b');
    s().nodes.forEach((n) => { if (n.id === 'c' || n.id === 'd') useDiagramStore.setState((st) => ({ nodes: st.nodes.map((x) => (x.id === n.id ? { ...x, selected: true } : x)) })); });
    expect(runLayout('grid', { selection: true })).toBe(true);
    expect(s().nodes.find((n) => n.id === 'a')!.position).toEqual(before.get('a'));
    const sel = ['b', 'c', 'd'].map((id) => s().nodes.find((n) => n.id === id)!.position);
    expect(Math.min(...sel.map((p) => p.x))).toBe(Math.min(...['b', 'c', 'd'].map((id) => before.get(id)!.x)));
    expect(Math.min(...sel.map((p) => p.y))).toBe(Math.min(...['b', 'c', 'd'].map((id) => before.get(id)!.y)));
  });
  it('needs at least two selected nodes', () => {
    s().selectOnly('node', 'a');
    expect(runLayout('grid', { selection: true })).toBe(false);
  });
  it('is offered in the selection context menu', () => {
    s().selectOnly('node', 'a');
    useDiagramStore.setState((st) => ({ nodes: st.nodes.map((x) => (x.id === 'b' ? { ...x, selected: true } : x)) }));
    const items = getMenuItems({ type: 'selection' } as never, { nodes: s().nodes, edges: s().edges, hasClipboard: false, userPresets: [] } as never);
    expect(items.find((i) => i.id === 'layout')?.children?.some((i) => i.id === 'tidy-selection')).toBe(true);
  });
});

describe('labels and groups', () => {
  it('separates overlapping edge labels', () => {
    applyText('#!sdd 1\nnode h "Hub"\nnode t0 "T0"\nnode t1 "T1"\nnode t2 "T2"\nh -> t0 "request number zero"\nh -> t1 "request number one"\nh -> t2 "request number two"\n');
    s().nodes.forEach((n, i) => s().setNodePosition(n.id, { x: n.id === 'h' ? 0 : 400, y: n.id === 'h' ? 0 : (i - 1) * 20 }));
    expect(runSeparateLabels()).toBe(true);
    expect(s().edges.some((e) => typeof e.data?.labelT === 'number')).toBe(true);
    expect(runSeparateLabels()).toBe(false);
  });
  it('aligns top-level groups in a row', () => {
    s().reset();
    applyText('#!sdd 1\ngroup g1 "G1" {\n node a "A"\n}\ngroup g2 "G2" {\n node b "B"\n}\n');
    s().setNodePosition('g1', { x: 0, y: 100 });
    s().setNodePosition('g2', { x: 700, y: 10 });
    expect(runAlignGroups('row')).toBe(true);
    const g = (id: string) => s().nodes.find((n) => n.id === id)!;
    expect(g('g1').position.y).toBe(g('g2').position.y);
  });
});
