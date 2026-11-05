import { beforeEach, describe, expect, it } from 'vitest';
import { executeAction } from '../actions';
import { parseDiagram } from '../serialization';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { registerUmlSections } from '../../data/uml';
import { createNodeFromPaletteItem, getItem } from '../../data/palette';
import { TEMPLATES } from '../../templates/uml2Templates';
import { applyDiagramModel, describeImport, detectDiagramKind, importDiagramText } from '../uml2/importAny';
import { umlOf } from '../uml/edges';
import { diagramToActivityModel, activityModelToDiagram, formatGuard, parseGuard } from './convert';
import { layoutActivity } from './layout';
import { parseActivityMermaid, renderActivityMermaid } from './mermaid';
import { activityNode, laneNode } from './nodes';
import { parseActivityPlantuml, renderActivityPlantuml } from './plantuml';
import { tidyActivity } from './tidy';
import type { ActivityModel } from './types';

registerUmlSections();
const s = () => useDiagramStore.getState();
beforeEach(() => { s().reset(); useUiStore.getState().resetUi(); });

const model: ActivityModel = {
  lanes: [{ id: 'cu', name: 'Customer' }, { id: 'sh', name: 'Shop' }],
  nodes: [
    { id: 's', name: '', kind: 'initial', lane: 'cu' },
    { id: 'o', name: 'Place order', kind: 'action', lane: 'cu' },
    { id: 'd', name: 'in stock?', kind: 'decision', lane: 'sh' },
    { id: 'p', name: 'Charge', kind: 'action', lane: 'sh' },
    { id: 'n', name: 'Notify', kind: 'action', lane: 'sh' },
    { id: 'm', name: '', kind: 'decision', lane: 'sh' },
    { id: 'e', name: '', kind: 'final', lane: 'cu' },
    { id: 'nt', name: 'retry twice', kind: 'note', lane: 'sh' },
  ],
  flows: [
    { from: 's', to: 'o' }, { from: 'o', to: 'd' }, { from: 'd', to: 'p', guard: 'yes' }, { from: 'd', to: 'n', guard: 'no' },
    { from: 'p', to: 'm' }, { from: 'n', to: 'm' }, { from: 'm', to: 'e' }, { from: 'p', to: 'nt', note: true },
  ],
};

describe('activity layout', () => {
  const lay = layoutActivity(model);
  const box = (id: string) => lay.boxes.get(id)!;
  it('puts the flow top down in layers', () => {
    expect(box('o').y).toBeGreaterThan(box('s').y);
    expect(box('d').y).toBeGreaterThan(box('o').y);
    expect(box('p').y).toBeGreaterThan(box('d').y);
    expect(box('e').y).toBeGreaterThan(box('m').y);
  });
  it('keeps nodes inside their swimlane and lanes side by side', () => {
    const cu = lay.lanes.get('cu')!, sh = lay.lanes.get('sh')!;
    expect(sh.x).toBeGreaterThanOrEqual(cu.x + cu.w);
    for (const n of model.nodes) {
      const l = lay.lanes.get(n.lane!)!, b = box(n.id);
      expect(b.x, n.id).toBeGreaterThanOrEqual(l.x);
      expect(b.x + b.w, n.id).toBeLessThanOrEqual(l.x + l.w);
      expect(b.y, n.id).toBeGreaterThan(l.y);
    }
  });
  it('does not overlap boxes of one layer', () => {
    const a = box('p'), b = box('n');
    expect(a.x + a.w <= b.x || b.x + b.w <= a.x).toBe(true);
  });
  it('runs left to right with horizontal lanes', () => {
    const h = layoutActivity({ ...model, orientation: 'h' });
    expect(h.boxes.get('o')!.x).toBeGreaterThan(h.boxes.get('s')!.x);
    const cu = h.lanes.get('cu')!, sh = h.lanes.get('sh')!;
    expect(sh.y).toBeGreaterThanOrEqual(cu.y + cu.h);
  });
  it('survives a loop', () => {
    const l = layoutActivity({ lanes: [], nodes: [{ id: 'a', name: 'a', kind: 'action' }, { id: 'b', name: 'b', kind: 'action' }], flows: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] });
    expect(l.boxes.get('b')!.y).toBeGreaterThan(l.boxes.get('a')!.y);
  });
});

describe('activity convert', () => {
  it('round-trips the model through diagram nodes', () => {
    const d = activityModelToDiagram(model);
    expect(d.nodes.filter((n) => n.type === 'group' && n.data.variant === 'lane')).toHaveLength(2);
    expect(d.nodes.find((n) => n.data.label === 'Charge')!.parentId).toBeTruthy();
    const back = diagramToActivityModel(d.nodes, d.edges);
    expect(back.nodes.map((n) => [n.name, n.kind])).toEqual(model.nodes.map((n) => [n.name, n.kind]));
    expect(back.flows.filter((f) => f.guard).map((f) => f.guard)).toEqual(['yes', 'no']);
    expect(back.flows.some((f) => f.note)).toBe(true);
    expect(back.lanes.map((l) => l.name)).toEqual(['Customer', 'Shop']);
    expect(umlOf(d.edges[0])?.kind).toBe('transition');
  });
  it('stores guards as [guard]', () => {
    expect(formatGuard('x > 1')).toBe('[x > 1]');
    expect(parseGuard('[x > 1]')).toBe('x > 1');
    expect(formatGuard(' ')).toBeUndefined();
  });
  it('produces a file the parser accepts', () => {
    const d = activityModelToDiagram(model);
    expect(parseDiagram(JSON.stringify(d)).ok).toBe(true);
  });
  it('rejects an activity node without actKind', () => {
    const n = { id: 'a', type: 'activity', position: { x: 0, y: 0 }, data: { label: 'x' } };
    expect(parseDiagram(JSON.stringify({ version: 1, nodes: [n], edges: [] })).ok).toBe(false);
  });
});

describe('activity tidy and actions', () => {
  it('moves nodes with their lane and resizes lanes', () => {
    const d = activityModelToDiagram(model, { x: 100, y: 100 });
    const scrambled = d.nodes.map((n) => (n.type === 'activity' ? { ...n, position: { x: 3, y: 3 } } : n));
    const r = tidyActivity(scrambled, d.edges)!;
    const get = (id: string) => r.nodes.find((n) => n.id === id)!;
    const lane = r.nodes.find((n) => n.data.variant === 'lane')!;
    expect(lane.height!).toBeGreaterThan(200);
    expect(get('act2').parentId).toBeTruthy();
    expect(get('act2').position.x).toBeGreaterThanOrEqual(0);
    expect(r.count).toBe(model.nodes.length);
    expect(tidyActivity([], [])).toBeNull();
  });
  it('Tidy activity action arranges the page', () => {
    const d = activityModelToDiagram(model);
    s().loadDiagram({ version: 1, nodes: d.nodes.map((n) => (n.type === 'activity' ? { ...n, position: { x: 0, y: 0 } } : n)), edges: d.edges } as never);
    executeAction('tidy-activity');
    const inLane = s().nodes.filter((n) => n.parentId);
    expect(new Set(inLane.map((n) => n.position.y)).size).toBeGreaterThan(3);
  });
  it('lane orientation switches rows / columns and re-tidies', () => {
    const d = activityModelToDiagram(model);
    s().loadDiagram(d as never);
    const lane = s().nodes.find((n) => n.data.variant === 'lane')!;
    executeAction('lane-orient:h', { nodeId: lane.id });
    const lanes = s().nodes.filter((n) => n.data.variant === 'lane');
    expect(lanes.every((l) => l.data.laneOrient === 'h' || l.id !== lane.id)).toBe(true);
  });
  it('activity-kind action changes the element and resizes it', () => {
    s().addNode(activityNode('a1', { x: 0, y: 0 }, 'action', 'Do it'));
    executeAction('act-kind:decision', { nodeId: 'a1' });
    expect(s().nodes[0].data.actKind).toBe('decision');
    expect(s().nodes[0].width).toBe(56);
  });
  it('lane groups nest nodes dropped inside', () => {
    s().addNode(laneNode('L', { x: 0, y: 0 }, 'Lane', 240, 400));
    s().addNode(activityNode('a1', { x: 50, y: 100 }, 'action', 'Do it'));
    expect(s().nodes.find((n) => n.id === 'a1')!.parentId).toBe('L');
  });
});

describe('activity palette and template', () => {
  it('creates every element from the palette', () => {
    const mk = (id: string) => createNodeFromPaletteItem(getItem(id)!, { x: 10, y: 20 }, 'n1');
    for (const [id, k] of [['uml-act-initial', 'initial'], ['uml-act-final', 'final'], ['uml-act-flow-final', 'flowFinal'], ['uml-act-action', 'action'], ['uml-act-decision', 'decision'], ['uml-act-fork', 'fork'], ['uml-act-object', 'object'], ['uml-act-send', 'send'], ['uml-act-accept', 'accept'], ['uml-act-note', 'note']] as const) {
      expect(mk(id)).toMatchObject({ type: 'activity', data: { actKind: k } });
    }
    expect(mk('uml-act-lane-v')).toMatchObject({ type: 'group', data: { variant: 'lane', laneOrient: 'v' } });
    expect(mk('uml-act-lane-h').data.laneOrient).toBe('h');
  });
  it('has the order fulfillment template with lanes, guards and a fork', () => {
    const t = TEMPLATES.find((x) => x.id === 'activity-order-fulfillment')!;
    const d = t.build();
    const m = diagramToActivityModel(d.nodes, d.edges);
    expect(m.lanes.map((l) => l.name)).toEqual(['Customer', 'Shop', 'Warehouse']);
    expect(m.nodes.filter((n) => n.kind === 'fork')).toHaveLength(2);
    expect(m.flows.some((f) => f.guard === 'yes')).toBe(true);
    expect(parseDiagram(JSON.stringify(d)).ok).toBe(true);
  });
});

const PUML = `@startuml
|Customer|
start
:Place order;
|Shop|
:Validate;
if (valid?) then (yes)
  :Charge;
  fork
    :Pick;
  fork again
    :Notify;
  end fork
else (no)
  :Reject;
  stop
endif
while (more items?) is (yes)
  :Add item;
endwhile (no)
repeat
  :Try;
repeat while (failed?) is (retry) not (ok)
note right: done
:Order [shipped]]
:Got signal<
:Send it>
stop
@enduml`;

describe('activity PlantUML', () => {
  const { model: m, warnings } = parseActivityPlantuml(PUML);
  const byName = (n: string) => m.nodes.find((x) => x.name === n)!;
  it('parses elements, lanes and branches', () => {
    expect(warnings).toEqual([]);
    expect(m.lanes.map((l) => l.name)).toEqual(['Customer', 'Shop']);
    expect(byName('Place order').lane).toBe(m.lanes[0].id);
    expect(byName('Charge').lane).toBe(m.lanes[1].id);
    const d = byName('valid?');
    expect(m.flows.filter((f) => f.from === d.id).map((f) => f.guard)).toEqual(['yes', 'no']);
    expect(m.nodes.filter((n) => n.kind === 'fork')).toHaveLength(2);
    expect(byName('Order').kind).toBe('object');
    expect(byName('Order').state).toBe('shipped');
    expect(byName('Got signal').kind).toBe('accept');
    expect(byName('Send it').kind).toBe('send');
    expect(m.nodes.some((n) => n.kind === 'note')).toBe(true);
  });
  it('parses while and repeat loops with a back edge', () => {
    const w = byName('more items?');
    expect(m.flows.some((f) => f.to === w.id && f.from === byName('Add item').id)).toBe(true);
    expect(m.flows.find((f) => f.from === w.id && f.guard === 'no')).toBeTruthy();
    const r = byName('failed?');
    expect(m.flows.find((f) => f.from === r.id && f.guard === 'retry')).toBeTruthy();
  });
  it('renders structured PlantUML that parses to the same shape', () => {
    const out = renderActivityPlantuml(m);
    expect(out).toContain('if (valid?) then (yes)');
    expect(out).toContain('fork again');
    expect(out).toContain('while (more items?) is (yes)');
    expect(out).toContain('endwhile (no)');
    expect(out).toContain('repeat while (failed?) is (retry) not (ok)');
    expect(out).toContain('|Shop|');
    expect(out).toContain('note right: done');
    const again = parseActivityPlantuml(out).model;
    const shape = (x: ActivityModel) => x.nodes.filter((n) => n.kind !== 'decision').map((n) => JSON.stringify([n.name, n.kind])).sort();
    expect(shape(again)).toEqual(shape(m));
    expect(again.flows.filter((f) => f.guard).map((f) => f.guard).sort()).toEqual(m.flows.filter((f) => f.guard).map((f) => f.guard).sort());
  });
  it('is detected and imported', () => {
    expect(detectDiagramKind(PUML)).toBe('activity');
    const r = importDiagramText(PUML)!;
    expect(r.kind).toBe('activity');
    expect(describeImport(r).noun).toBe('activity diagram');
    expect(applyDiagramModel(r, 'page', 'x')).toBeGreaterThan(5);
    expect(s().nodes.some((n) => n.type === 'activity')).toBe(true);
  });
  it('does not hijack state or sequence diagrams', () => {
    expect(detectDiagramKind('@startuml\n[*] --> A\nA --> B : go\n@enduml')).toBe('state');
    expect(detectDiagramKind('@startuml\nparticipant A\nA -> B : hi\n@enduml')).toBe('sequence');
  });
  it('supports switch and elseif', () => {
    const r = parseActivityPlantuml('@startuml\nstart\nswitch (kind?)\ncase (a)\n:A;\ncase (b)\n:B;\ncase (c)\n:C;\nendswitch\nstop\n@enduml').model;
    expect(r.flows.filter((f) => f.guard).map((f) => f.guard)).toEqual(['a', 'b', 'c']);
    expect(renderActivityPlantuml(r)).toContain('endswitch');
    const e = parseActivityPlantuml('@startuml\nstart\nif (x) then (1)\n:A;\nelseif (y) then (2)\n:B;\nelse (3)\n:C;\nendif\nstop\n@enduml').model;
    expect(e.nodes.filter((n) => n.kind === 'decision' && n.name)).toHaveLength(2);
  });
});

describe('activity Mermaid', () => {
  it('round-trips every element kind', () => {
    const all: ActivityModel = {
      lanes: [{ id: 'l', name: 'Team' }],
      nodes: [
        { id: 'a', name: '', kind: 'initial', lane: 'l' }, { id: 'b', name: 'Work', kind: 'action', lane: 'l' }, { id: 'c', name: 'ok?', kind: 'decision' },
        { id: 'd', name: '', kind: 'fork' }, { id: 'e', name: 'Doc', kind: 'object', state: 'draft' }, { id: 'f', name: 'Ping', kind: 'send' },
        { id: 'g', name: 'Pong', kind: 'accept' }, { id: 'h', name: '', kind: 'flowFinal' }, { id: 'i', name: '', kind: 'final' }, { id: 'j', name: 'remember', kind: 'note' },
      ],
      flows: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd', guard: 'yes' }, { from: 'd', to: 'e' }, { from: 'e', to: 'f' }, { from: 'f', to: 'g' }, { from: 'g', to: 'h' }, { from: 'c', to: 'i', guard: 'no' }, { from: 'b', to: 'j', note: true }],
    };
    const out = renderActivityMermaid(all);
    expect(out.startsWith('flowchart TD')).toBe(true);
    expect(out).toContain('subgraph L1["Team"]');
    const { model: back, warnings } = parseActivityMermaid(out);
    expect(warnings).toEqual([]);
    expect(back.nodes.map((n) => [n.name, n.kind, n.state])).toEqual(all.nodes.map((n) => [n.name, n.kind, n.state]));
    expect(back.flows.map((f) => [f.guard, !!f.note])).toEqual(all.flows.map((f) => [f.guard, !!f.note]));
    expect(back.lanes.map((l) => l.name)).toEqual(['Team']);
    expect(back.nodes.find((n) => n.name === 'Work')!.lane).toBeTruthy();
    expect(detectDiagramKind(out)).toBe('activity');
  });
  it('parses a hand written flowchart best effort and leaves plain flowcharts alone', () => {
    const r = parseActivityMermaid('flowchart LR\n  S((" ")):::initial --> A("Do it") -->|ok| D{Done?}\n  D -->|no| A\n  D --> E((("x"))):::final');
    expect(r.model.orientation).toBe('h');
    expect(r.model.nodes.map((n) => n.kind)).toEqual(['initial', 'action', 'decision', 'final']);
    expect(detectDiagramKind('flowchart TD\n A[Start] --> B{Is it?}\n B -->|Yes| C[OK]')).toBeUndefined();
  });
});
