import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { compositeNode, diagramToStateModel, isCompositeNode, isStateLike, routeViaBorderPoints, stateModelToDiagram, stateNode, stateOf, withStateSize } from './convert';
import { formatTransition, parseTransition } from './label';
import { nodeSelfLoop } from './loop';
import { parseStateMermaid, renderStateMermaid, renderStatePlantUml } from './mermaid';
import { isPlantUmlState, parsePlantUmlState } from './plantuml';
import { regionDividers } from './regions';
import { emptyStateModel, isBorderPoint, stateKindLabel } from './types';
import type { StateModel } from './types';

describe('types', () => {
  it('labels and border points', () => {
    expect(stateKindLabel('deepHistory')).toBe('Deep history (H*)');
    expect(stateKindLabel('history')).toBe('History (H)');
    expect(stateKindLabel('entryPoint')).toBe('Entry point');
    expect(stateKindLabel('exitPoint')).toBe('Exit point');
    expect(stateKindLabel('fork')).toBe('Fork');
    expect(isBorderPoint('entryPoint')).toBe(true);
    expect(isBorderPoint('state')).toBe(false);
    expect(emptyStateModel()).toEqual({ states: [], transitions: [] });
  });
});

describe('label', () => {
  it('parses all parts', () => {
    expect(parseTransition('go  now [ok] / act')).toEqual({ event: 'go now', guard: 'ok', action: 'act' });
    expect(parseTransition('ev')).toEqual({ event: 'ev', guard: '', action: '' });
    expect(parseTransition(undefined as unknown as string)).toEqual({ event: '', guard: '', action: '' });
  });
  it('formats', () => {
    expect(formatTransition({ event: 'e', guard: 'g', action: 'a' })).toBe('e [g] / a');
    expect(formatTransition({ action: 'a' })).toBe('/ a');
    expect(formatTransition({ event: 'e' })).toBe('e');
    expect(formatTransition({})).toBe('');
  });
});

describe('loop', () => {
  it('self loop geometry', () => {
    const r = nodeSelfLoop({ x: 0, y: 0, width: 100, height: 40 });
    expect(r.points[0]).toEqual({ x: 103, y: 12 });
    expect(r.points[1].x).toBe(133);
    expect(r.src.side).toBe('right');
    const w = nodeSelfLoop({ x: 0, y: 0, width: 100, height: 10 }, 3, 200);
    expect(w.points[1].x).toBe(103 + 112);
    expect(w.points[0].y).toBe(8);
    expect(w.points[2].y).toBe(2);
  });
});

describe('regions', () => {
  const n = (id: string, x: number, y: number, region: number | undefined, extra: Partial<DiagramNode> = {}, stateKind = 'state'): DiagramNode =>
    ({ id, type: 'state', position: { x, y }, width: 50, height: 30, data: { label: id, stateKind, ...(region !== undefined ? { region } : {}) }, ...extra }) as DiagramNode;
  it('vertical, horizontal, and ignores border points', () => {
    expect(regionDividers([n('a', 0, 0, 0), n('b', 100, 0, 1)])).toEqual([{ axis: 'x', pos: 75 }]);
    expect(regionDividers([n('a', 0, 0, undefined), n('b', 0, 100, 1)])).toEqual([{ axis: 'y', pos: 65 }]);
    expect(regionDividers([n('a', 0, 0, 0), n('b', 10, 10, 1)])).toEqual([]);
    expect(regionDividers([n('a', 0, 0, 0), n('e', 100, 0, 1, {}, 'entryPoint'), n('x', 100, 0, 1, {}, 'exitPoint')])).toEqual([]);
    const s = { id: 's', type: 'state', position: { x: 100, y: 0 }, style: { width: 20, height: 10 }, data: { region: 1 } } as unknown as DiagramNode;
    const z = { id: 'z', type: 'state', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode;
    expect(regionDividers([z, s])).toEqual([{ axis: 'x', pos: 50 }]);
  });
});

describe('mermaid parse', () => {
  it('parses wide syntax', () => {
    const src = `stateDiagram-v2
direction RL
%% comment
accTitle: x
state "Long name" as L
state "Comp" as C {
  [*] --> a
  a --> [H]
  a --> [H*]
  --
  state b
}
state Q {
  x --> y
  ||
  state z
}
state ch <<choice>>
state fk <<fork>>
state ep <<entryPoint>>
state weird <<nope>>
state plain
state Hh
%% sdd:history Hh
state E2
%% sdd:entryPoint E2
%% sdd:deepHistory fk
%% sdd:history ch
%% sdd:exitPoint Xp
L : do x
L : do y
"Long" --> "Quoted" : lbl
note right of L : short
note left of L
 multi
 line
end note
note over L : bad
garbage line
`;
    const { model, warnings } = parseStateMermaid(src);
    expect(model.direction).toBe('LR');
    expect(model.states.find((s) => s.id === 'L')?.name).toBe('Long name');
    expect(model.states.find((s) => s.id === 'L')?.activity).toBe('do x\ndo y');
    expect(model.states.find((s) => s.id === 'C')?.composite).toBe(true);
    expect(model.states.find((s) => s.id === 'b')?.region).toBe(1);
    expect(model.states.find((s) => s.id === 'z')?.region).toBe(1);
    expect(model.states.find((s) => s.id === 'ch')?.name).toBe('H');
    expect(model.states.find((s) => s.id === 'ep')?.name).toBe('');
    expect(model.states.find((s) => s.id === 'Hh')?.kind).toBe('history');
    expect(model.states.find((s) => s.id === 'E2')?.name).toBe('');
    expect(model.states.find((s) => s.id === 'fk')?.name).toBe('H*');
    expect(model.states.find((s) => s.id === 'Xp')?.kind).toBe('exitPoint');
    expect(model.states.some((s) => s.kind === 'deepHistory' && s.id.startsWith('deepHistory_'))).toBe(true);
    expect(model.notes).toEqual([{ target: 'L', side: 'right', text: 'short' }, { target: 'L', side: 'left', text: 'multi\nline' }]);
    expect(warnings).toContain('Unknown stereotype <<nope>>');
    expect(warnings.some((w) => w.startsWith('Unsupported note'))).toBe(true);
    expect(warnings).toContain('Unrecognised line: garbage line');
  });
  it('warns on structure errors', () => {
    const r = parseStateMermaid('stateDiagram-v2\n--\n}\nstate A {\ndirection TB');
    expect(r.warnings).toEqual(['Region separator outside a composite state', 'Unbalanced "}"', 'Unclosed "{"']);
    expect(r.model.direction).toBe('TB');
    const u = parseStateMermaid('note right of A\nunterminated');
    expect(u.model.notes?.[0].text).toBe('unterminated');
  });
  it('state with brace on named alias and ensure on existing', () => {
    const r = parseStateMermaid('state A\nstate "Nm" as A {\n}\nstate B {\n}');
    expect(r.model.states.find((s) => s.id === 'A')).toMatchObject({ name: 'Nm', composite: true });
  });
});

describe('mermaid / plantuml render', () => {
  const model: StateModel = {
    direction: 'LR',
    states: [
      { id: 'i', name: '', kind: 'initial' },
      { id: 'f', name: '', kind: 'final' },
      { id: 'A', name: 'A', kind: 'state', activity: 'entry / x\n\nexit / y' },
      { id: 'B', name: 'Big B', kind: 'state' },
      { id: 'I', name: 'I', kind: 'state' },
      { id: 'c', name: '', kind: 'choice' },
      { id: 'h', name: '', kind: 'history' },
      { id: 'hh', name: 'H*', kind: 'deepHistory' },
      { id: 'C', name: 'Comp', kind: 'state', composite: true },
      { id: 'C1', name: 'C1', kind: 'state', parent: 'C' },
      { id: 'C2', name: 'C2', kind: 'state', parent: 'C', region: 1 },
      { id: 'ep', name: '', kind: 'entryPoint', parent: 'C' },
      { id: 'xp', name: '', kind: 'exitPoint', parent: 'C', region: 1 },
      { id: 'Cc', name: 'Cc', kind: 'state', composite: true },
      { id: '1 bad', name: '1 bad name', kind: 'state' },
      { id: 'dup', name: 'A', kind: 'state' },
    ],
    transitions: [
      { from: 'i', to: 'A', label: '' },
      { from: 'A', to: 'B', label: 'go' },
      { from: 'C1', to: 'ep', label: '' },
      { from: 'C2', to: 'xp', label: '' },
      { from: 'A', to: 'h', label: '' },
      { from: 'hh', to: 'f', label: '' },
      { from: 'A', to: 'C1', label: 'cross' },
      { from: 'ghost', to: 'A', label: '' },
    ],
    notes: [
      { target: 'A', side: 'top', text: 'one' },
      { target: 'B', side: 'left', text: 'a\nb' },
      { target: 'nobody', side: 'left', text: 'x' },
    ],
  };
  it('mermaid', () => {
    const t = renderStateMermaid(model);
    expect(t.startsWith('stateDiagram-v2\n  direction LR')).toBe(true);
    expect(t).toContain('  state "Big B" as B');
    expect(t).toContain('  state c <<choice>>');
    expect(t).toContain('  A : entry / x');
    expect(t).toContain('%% sdd:entryPoint ep');
    expect(t).toContain('%% sdd:history h');
    expect(t).toContain('  state Comp {');
    expect(t).toContain('    --');
    expect(t).toContain('  [*] --> A');
    expect(t).toContain('  note right of A : one');
    expect(t).toContain('  note left of B\n    a\n    b\n  end note');
    expect(t).toContain('state Cc');
    expect(t).toContain('as s_');
    expect(t).toContain('as A_');
  });
  it('plantuml', () => {
    const t = renderStatePlantUml(model);
    expect(t.startsWith('@startuml\nleft to right direction')).toBe(true);
    expect(t).toContain('state ep <<entryPoint>>');
    expect(t).toContain('A --> [H]');
    expect(t).toContain('[H*] --> [*]');
    expect(t).toContain('note top of A : one');
    expect(t).toContain('note left of B\n  a\n  b\nend note');
    expect(t.endsWith('@enduml\n')).toBe(true);
  });
  it('round trip simple', () => {
    const m = parseStateMermaid(renderStateMermaid({ states: [{ id: 'A', name: 'A', kind: 'state' }], transitions: [] })).model;
    expect(m.states[0].id).toBe('A');
  });
});

describe('plantuml parse', () => {
  it('detects', () => {
    expect(isPlantUmlState('state A')).toBe(false);
    expect(isPlantUmlState('@startuml\nclass X\nstate A')).toBe(false);
    expect(isPlantUmlState('@startuml\nparticipant X\nstate A')).toBe(false);
    expect(isPlantUmlState('@startuml\nstate A\n@enduml')).toBe(true);
    expect(isPlantUmlState('@startuml\n[*] --> A\n@enduml')).toBe(true);
    expect(isPlantUmlState('@startuml\nA -> [*]\n@enduml')).toBe(true);
    expect(isPlantUmlState('@startuml\nA -> B\n@enduml')).toBe(false);
  });
  it('parses', () => {
    const src = `@startuml
title X
' comment
skinparam x
left to right direction
top to bottom direction
state A #red
state B : act
state "Long" as L {
state E <<end>>
}
state Z as "Zed"
[*] -down-> A : go;
A -[#red]-> B
A -> [*]
state S <<choice>>
@enduml`;
    const { model, warnings } = parsePlantUmlState(src);
    expect(model.direction).toBe('TB');
    expect(model.states.find((s) => s.id === 'L')?.composite).toBe(true);
    expect(model.states.find((s) => s.id === 'B')?.activity).toBe('act');
    expect(model.transitions.map((t) => t.label)).toEqual(['go', '', '']);
    expect(model.states.find((s) => s.id === 'S')?.kind).toBe('choice');
    expect(Array.isArray(warnings)).toBe(true);
    const lr = parsePlantUmlState('left to right direction\nstate L as "x"');
    expect(lr.model.direction).toBe('LR');
  });
});

describe('convert', () => {
  it('helpers', () => {
    const s = stateNode('a', { x: 0, y: 0 }, { label: 'A', activity: 'x' }, 'p');
    expect(s.parentId).toBe('p');
    expect(stateOf(s).stateKind).toBe('state');
    const c = compositeNode('c', { x: 0, y: 0 }, 'C');
    expect(c.width).toBe(360);
    expect(isCompositeNode(c)).toBe(true);
    expect(isCompositeNode(undefined)).toBe(false);
    expect(isStateLike(s)).toBe(true);
    expect(isStateLike(undefined)).toBe(false);
    expect(isStateLike({ id: 'q', type: 'box', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode)).toBe(false);
    const big = withStateSize({ ...s, data: { ...s.data, label: 'A very very long state name here to widen it' } as DiagramNode['data'], style: undefined });
    expect(big.width).toBeGreaterThan(s.width ?? 0);
  });
  it('routes via border points', () => {
    const m: StateModel = {
      states: [
        { id: 'A', name: 'A', kind: 'state' }, { id: 'B', name: 'B', kind: 'state' },
        { id: 'C', name: 'C', kind: 'state', composite: true },
        { id: 'in', name: 'in', kind: 'state', parent: 'C' },
        { id: 'ep', name: '', kind: 'entryPoint', parent: 'C' },
        { id: 'xp', name: '', kind: 'exitPoint', parent: 'C' },
      ],
      transitions: [
        { from: 'A', to: 'in', label: 'x' }, { from: 'in', to: 'B', label: 'y' }, { from: 'A', to: 'ep', label: '' }, { from: 'A', to: 'B', label: '' }, { from: 'A', to: 'nope', label: '' },
      ],
    };
    const r = routeViaBorderPoints(m);
    expect(r).toEqual([
      { from: 'A', to: 'ep', label: 'x' }, { from: 'ep', to: 'in', label: '' },
      { from: 'in', to: 'xp', label: 'y' }, { from: 'xp', to: 'B', label: '' },
      { from: 'A', to: 'ep', label: '' }, { from: 'A', to: 'B', label: '' }, { from: 'A', to: 'nope', label: '' },
    ]);
  });
  it('model -> diagram -> model with notes, regions, LR forks', () => {
    const m: StateModel = {
      direction: 'LR',
      states: [
        { id: 'C', name: 'C', kind: 'state', composite: true, region: 2 },
        { id: 'a', name: 'a', kind: 'state', parent: 'C', activity: 'ac', region: 1 },
        { id: 'fk', name: '', kind: 'fork' },
        { id: 'o', name: 'o', kind: 'state', parent: 'missing' },
      ],
      transitions: [{ from: 'a', to: 'fk', label: 'l' }, { from: 'a', to: 'zz', label: '' }],
      notes: [
        { target: 'a', side: 'left', text: 'L' }, { target: 'a', side: 'top', text: 'T\nx' }, { target: 'a', side: 'bottom', text: 'B' }, { target: 'fk', side: 'right', text: 'R' },
        { target: 'zz', side: 'right', text: 'skip' },
      ],
    };
    const d = stateModelToDiagram(m, { x: 10, y: 20 });
    expect(d.nodes.filter((n) => n.type === 'sticky')).toHaveLength(4);
    expect(d.edges.filter((e) => (e.data?.uml as { kind: string }).kind === 'transition')).toHaveLength(1);
    const fork = d.nodes.find((n) => n.type === 'state' && stateOf(n).stateKind === 'fork')!;
    expect(stateOf(fork).vertical).toBe(true);
    const back = diagramToStateModel(d.nodes, d.edges);
    expect(back.states.find((s) => s.name === 'C')?.region).toBe(2);
    expect(back.states.find((s) => s.name === 'a')).toMatchObject({ activity: 'ac', region: 1 });
    expect(back.states.find((s) => s.name === 'a')?.parent).toBeTruthy();
    expect(back.transitions).toHaveLength(1);
    expect(back.notes?.map((n) => n.side).sort()).toEqual(['bottom', 'left', 'right', 'top']);
  });
  it('diagramToStateModel edge cases', () => {
    const st = (id: string, x: number, y: number, w = 100): DiagramNode => stateNode(id, { x, y }, { label: id }) && ({ ...stateNode(id, { x, y }, { label: id }), width: w } as DiagramNode);
    const sticky = (id: string, x: number, y: number, umlNote = true): DiagramNode => ({ id, type: 'sticky', position: { x, y }, data: { label: id, umlNote } }) as unknown as DiagramNode;
    const t = st('t', 0, 0);
    const nodes = [t, sticky('n1', 0, 0), sticky('n2', 0, 50), sticky('n3', 0, -50), sticky('n4', -200, 0), sticky('n5', 300, 0), sticky('plain', 0, 0, false), { ...stateNode('nw', { x: 0, y: 0 }, { label: 'nw' }), width: undefined } as DiagramNode, sticky('n6', 5, 0)];
    const note = (id: string, to = 't'): DiagramEdge => ({ id: 'e' + id, source: id, target: to, data: { uml: { kind: 'note' } } }) as unknown as DiagramEdge;
    const edges = [note('n1'), note('n2'), note('n3'), note('n4'), note('n5'), note('plain'), note('n1', 'ghost'), note('n6'), { id: 'x', source: 't', target: 'nw', label: 5 as unknown as string, data: { uml: { kind: 'transition' } } } as unknown as DiagramEdge, { id: 'y', source: 't', target: 'q', data: { uml: { kind: 'transition' } } } as unknown as DiagramEdge, { id: 'z', source: 't', target: 'nw' } as unknown as DiagramEdge];
    const m = diagramToStateModel(nodes, edges);
    expect(m.notes?.map((n) => n.side)).toEqual(['right', 'bottom', 'top', 'left', 'right', 'right']);
    expect(m.transitions).toEqual([{ from: 't', to: 'nw', label: '' }]);
    expect(diagramToStateModel([t], []).notes).toBeUndefined();
  });
});

describe('extra branches', () => {
  it('mermaid sdd on named entry, regions with [*]', () => {
    const r = parseStateMermaid('state "Nm" as e\n%% sdd:entryPoint e\nstate C {\n  [*] --> a\n  --\n  [*] --> b\n}\nstate fk2 <<fork>>\n%% sdd:exitPoint fk2');
    expect(r.model.states.find((s) => s.id === 'e')).toMatchObject({ name: 'Nm', kind: 'entryPoint' });
    expect(r.model.states.filter((s) => s.kind === 'initial').map((s) => s.id)).toEqual(['initial_C', 'initial_C_r1']);
  });
  it('plantuml composite alias', () => {
    const r = parsePlantUmlState('@startuml\nstate L2 as "Long" {\nstate in\n}\n@enduml');
    expect(r.model.states.find((s) => s.id === 'L2')).toMatchObject({ name: 'Long', composite: true });
  });
  it('convert nested composite and unlabeled edges', () => {
    const m: StateModel = {
      states: [
        { id: 'P', name: 'P', kind: 'state', composite: true },
        { id: 'Q', name: 'Q', kind: 'state', composite: true, parent: 'P', region: 1 },
        { id: 'x', name: 'x', kind: 'state', parent: 'Q' },
        { id: 'y', name: 'y', kind: 'state' },
      ],
      transitions: [{ from: 'x', to: 'y', label: '' }],
    };
    const d = stateModelToDiagram(m);
    expect(d.nodes.some((n) => n.type === 'sticky')).toBe(false);
    expect(d.edges[0].label).toBeUndefined();
    const back = diagramToStateModel(d.nodes, d.edges);
    expect(back.states.find((s) => s.name === 'Q')).toMatchObject({ composite: true, region: 1 });
    expect(back.states.find((s) => s.name === 'Q')?.parent).toBeTruthy();
    expect(compositeNode('c', { x: 0, y: 0 }, 'C', 10, 10, 'par').parentId).toBe('par');
  });
  it('note without width / label', () => {
    const t = { ...stateNode('t', { x: 0, y: 0 }, { label: 't' }), width: undefined } as DiagramNode;
    const nt = { id: 'n', type: 'sticky', position: { x: 0, y: 0 }, data: { umlNote: true } } as unknown as DiagramNode;
    const e = { id: 'e', source: 'n', target: 't', data: { uml: { kind: 'note' } } } as unknown as DiagramEdge;
    expect(diagramToStateModel([t, nt], [e]).notes).toEqual([{ target: 't', side: 'right', text: '' }]);
  });
});

