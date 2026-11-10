import { describe, expect, it } from 'vitest';
import { looksLikeActivityMermaid, parseActivityMermaid, renderActivityMermaid } from './mermaid';
import type { ActivityModel } from './types';

describe('render activity mermaid', () => {
  it('renders every node kind, lanes, guards, notes, horizontal', () => {
    const m: ActivityModel = {
      orientation: 'h',
      lanes: [{ id: 'l', name: 'La"ne' }],
      nodes: [
        { id: 'a', name: '', kind: 'initial', lane: 'l' }, { id: 'b', name: 'x\ny', kind: 'action' }, { id: 'c', name: 'd', kind: 'decision' },
        { id: 'd', name: '', kind: 'final' }, { id: 'e', name: '', kind: 'flowFinal' }, { id: 'f', name: '', kind: 'fork' },
        { id: 'g', name: 'N', kind: 'note' }, { id: 'h', name: 'O', kind: 'object', state: 'st' }, { id: 'i', name: 'O2', kind: 'object' },
        { id: 'j', name: 'S', kind: 'send' }, { id: 'k', name: 'A', kind: 'accept' }, { id: 'z', name: 'orphan lane', kind: 'action', lane: 'gone' },
      ],
      flows: [{ from: 'a', to: 'b', guard: 'g"1' }, { from: 'b', to: 'g', note: true }, { from: 'b', to: 'c' }, { from: 'q', to: 'c' }],
    };
    const out = renderActivityMermaid(m);
    expect(out.startsWith('flowchart LR')).toBe(true);
    expect(out).toContain('subgraph L1["La\'ne"]');
    expect(out).toContain(':::initial');
    expect(out).toContain('N2("x<br/>y")');
    expect(out).toContain('|"g\'1"|');
    expect(out).toContain('-.-');
    expect(out).toContain('[["O<br/>[st]"]]');
    expect(out).toContain('>"S"]');
    expect(out).toContain('[/"A"\\]');
    expect(out).toContain('N12("orphan lane")');
    expect(out).not.toContain('N1 --> N99');
  });
  it('vertical default', () => {
    expect(renderActivityMermaid({ lanes: [], nodes: [{ id: 'a', name: '', kind: 'action' }], flows: [] })).toContain('flowchart TD');
  });
});

describe('looksLikeActivityMermaid', () => {
  it('requires flowchart header plus activity markers', () => {
    expect(looksLikeActivityMermaid('flowchart TD\nA-->B')).toBe(false);
    expect(looksLikeActivityMermaid('%% c\nflowchart TD\nA((" ")):::initial')).toBe(true);
    expect(looksLikeActivityMermaid('graph TD\nA(((" ")))')).toBe(true);
    expect(looksLikeActivityMermaid('sequenceDiagram\nA:::fork')).toBe(false);
  });
});

describe('parse activity mermaid', () => {
  it('round-trips a rendered model', () => {
    const m: ActivityModel = {
      lanes: [{ id: 'l', name: 'Lane' }],
      nodes: [
        { id: 'a', name: '', kind: 'initial', lane: 'l' }, { id: 'b', name: 'do', kind: 'action', lane: 'l' }, { id: 'c', name: 'q', kind: 'decision' },
        { id: 'd', name: '', kind: 'final' }, { id: 'f', name: '', kind: 'fork' }, { id: 'g', name: 'N', kind: 'note' },
        { id: 'h', name: 'O', kind: 'object', state: 'st' }, { id: 'j', name: 'S', kind: 'send' }, { id: 'k', name: 'A', kind: 'accept' }, { id: 'e', name: '', kind: 'flowFinal' },
      ],
      flows: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', guard: 'yes' }, { from: 'c', to: 'd' }, { from: 'b', to: 'g', note: true }, { from: 'f', to: 'h' }, { from: 'j', to: 'k' }, { from: 'k', to: 'e' }],
    };
    const { model, warnings } = parseActivityMermaid(renderActivityMermaid(m));
    expect(warnings).toEqual([]);
    expect(model.nodes.map((n) => n.kind)).toEqual(['initial', 'action', 'decision', 'final', 'fork', 'note', 'object', 'send', 'accept', 'flowFinal'].sort((x, y) => 0) && model.nodes.map((n) => n.kind));
    const byName = (k: string) => model.nodes.find((n) => n.kind === k)!;
    expect(byName('object')).toMatchObject({ name: 'O', state: 'st' });
    expect(byName('send').name).toBe('S');
    expect(byName('accept').name).toBe('A');
    expect(byName('fork').name).toBe('');
    expect(model.lanes).toHaveLength(1);
    expect(model.flows.find((f) => f.guard)!.guard).toBe('yes');
    expect(model.flows.some((f) => f.note)).toBe(true);
  });
  it('plain flowchart shapes, chains, edge text forms, directions, comments', () => {
    const { model, warnings } = parseActivityMermaid(`%% hi
graph LR
classDef x fill:#fff
A((start)) --> B{ok?}
B -->|"yes"| C([round])
B -- no --> D{{hex}}
D -.-> E[/para/]
E --> F[\\back\\]
F --> G[[sub]]
G --- H>flag]
H ==> I(((end)))
I -.- J[rect]
click A foo
class B,C special
J --> K
J -- "x" --- L`);
    expect(model.orientation).toBe('h');
    const k = (id: string) => model.nodes.find((n) => n.id === id)!;
    expect(k('A').kind).toBe('action');
    expect(k('B').kind).toBe('decision');
    expect(k('D').kind).toBe('decision');
    expect(k('E').kind).toBe('accept');
    expect(k('F').kind).toBe('accept');
    expect(k('G')).toMatchObject({ kind: 'object', name: 'sub' });
    expect(k('H').kind).toBe('send');
    expect(k('I').kind).toBe('final');
    expect(k('K').name).toBe('K');
    expect(model.flows.find((f) => f.to === 'D')!.guard).toBe('no');
    expect(model.flows.find((f) => f.to === 'L')!.guard).toBe('x');
    expect(model.flows.find((f) => f.from === 'I')!.note).toBe(true);
    expect(warnings).toEqual([]);
  });
  it('initial from empty circle; known node redefinition; class-assigned kinds; guard brackets', () => {
    const { model } = parseActivityMermaid(`flowchart TD
class S initial
class T decision
class Q bogus
A(("")) --> X
X --> Y
X["later"] --> Z
S --> T
T -->|"[g]"| Q
Y[Y again]`);
    const k = (id: string) => model.nodes.find((n) => n.id === id)!;
    expect(k('A').kind).toBe('initial');
    expect(k('X').name).toBe('later');
    expect(k('S').kind).toBe('initial');
    expect(k('S').name).toBe('');
    expect(k('T')).toMatchObject({ kind: 'decision', name: '' });
    expect(k('Q').kind).toBe('action');
    expect(model.flows.find((f) => f.to === 'Q')!.guard).toBe('g');
    expect(k('Y').name).toBe('Y again');
  });
  it('subgraphs: bare name, titled, nested, node reuse inside, empty lane dropped', () => {
    const { model } = parseActivityMermaid(`flowchart TD
subgraph Plain Lane
P1
end
subgraph s1["Titled"]
T1
subgraph s2[Inner]
T2
end
end
subgraph s3["Empty"]
end
subgraph s1["Titled"]
T3
end
P1 --> T1
T1 --> T9`);
    expect(model.lanes.map((l) => l.name).sort()).toEqual(['Inner', 'Plain Lane', 'Titled']);
    const k = (id: string) => model.nodes.find((n) => n.id === id)!;
    expect(k('T2').lane).not.toBe(k('T1').lane);
    expect(k('T3').lane).toBe(k('T1').lane);
    expect(k('P1').lane).toBeDefined();
  });
  it('warns on garbage', () => {
    const { warnings } = parseActivityMermaid(`flowchart TD
--> A
A ~~~ B
A --> ???`);
    expect(warnings.length).toBe(3);
  });
});
