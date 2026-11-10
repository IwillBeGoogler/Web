import { describe, expect, it } from 'vitest';
import { parseSeqMermaid, renderSeqMermaid } from './mermaid';
import { allMessages, isFragment, type SequenceModel, type SeqMessage } from './types';

describe('parseSeqMermaid', () => {
  it('participants, actor types, create/destroy, activate, notes, boxes, autonumber', () => {
    const { model, warnings } = parseSeqMermaid(`%% c
sequenceDiagram
title X
autonumber
box rgb(1,2,3) Front
participant A as Alpha
actor U
end
box Plain
participant Z@{ "type": "database" }
participant Y@{ "type": "weird" }
end
box transparent Clear
participant Q
end
box
participant W
end
create participant C
A->>C: new
destroy C
A-xC: bye
A->>+U: call
activate A
U-->>-A: back
deactivate A
A-)U: later
activate U
A-)+U: plus
A->>-U: minus
A--)U: dashed async
A-->U: ret
A->U: s
Note over A,U: both<br/>lines
Note left of A: l
Note right of U: r
`);
    expect(warnings).toEqual([]);
    expect(model.autonumber).toBe(true);
    expect(model.boxes!.map((b) => [b.label, b.color])).toEqual([['Front', 'rgb(1,2,3)'], ['Plain', undefined], ['Clear', undefined], ['', undefined]]);
    expect(model.participants.find((p) => p.id === model.participants[0].id)!.name).toBe('Alpha');
    expect(model.participants.find((p) => p.name === 'Z')!.kind).toBe('database');
    expect(model.participants.find((p) => p.name === 'Y')!.kind).toBe('participant');
    expect(model.participants.find((p) => p.name === 'U')!.kind).toBe('actor');
    const msgs = allMessages(model.items);
    expect(msgs[0].kind).toBe('create');
    expect(msgs[1].kind).toBe('destroy');
    expect(msgs.some((m) => m.activate)).toBe(true);
    expect(msgs.some((m) => m.deactivate)).toBe(true);
    const notes = model.items.filter((i) => i.type === 'note') as { text: string; side?: string; over: string[] }[];
    expect(notes[0].text).toBe('both\nlines');
    expect(notes[0].over).toHaveLength(2);
    expect(notes.map((n) => n.side)).toEqual([undefined, 'left', 'right']);
  });
  it('fragments and warnings', () => {
    const { model, warnings } = parseSeqMermaid(`sequenceDiagram
alt ok
A->>B: x
else bad
A->>B: y
end
loop forever
A->>B: z
end
rect rgb(1,2,3)
A->>B: w
end
par one
A->>B: p
and two
A->>B: q
end
else stray
and stray2
end
end
nonsense here
ok`);
    const f = model.items.filter(isFragment);
    expect(f.map((x) => x.op)).toEqual(['alt', 'loop', 'rect', 'par']);
    expect(f[0].sections.map((s) => s.guard)).toEqual(['ok', 'bad']);
    expect(warnings).toHaveLength(6);
    expect(warnings.some((w) => /outside a fragment/.test(w))).toBe(true);
    expect(warnings.some((w) => /without an open/.test(w))).toBe(true);
    expect(warnings.some((w) => /Unrecognised/.test(w))).toBe(true);
  });
  it('semicolons split lines; activate on a sync/return message is not flagged', () => {
    const { model } = parseSeqMermaid('sequenceDiagram; A->>B: x; activate B; B-->>A: y; deactivate A');
    const m = allMessages(model.items);
    expect(m).toHaveLength(2);
    expect(m[0].activate).toBeUndefined();
    expect(m[1].deactivate).toBeUndefined();
  });
});

describe('renderSeqMermaid', () => {
  const model: SequenceModel = {
    autonumber: true,
    participants: [
      { id: 'a', name: 'Alpha', kind: 'actor' }, { id: 'b', name: 'two words', kind: 'database' }, { id: 'c', name: 'Alpha', kind: 'participant' },
      { id: 'd', name: 'New', kind: 'entity' }, { id: 'e', name: 'E', kind: 'participant' },
    ],
    boxes: [{ id: 'bx', label: 'Grp', color: 'red', participants: ['a', 'b'] }, { id: 'by', label: '', participants: ['c'] }],
    items: [
      { type: 'message', id: '1', from: 'a', to: 'b', text: 'l1\nl2', kind: 'sync' },
      { type: 'message', id: '2', from: 'b', to: 'a', text: 'ret', kind: 'return' },
      { type: 'message', id: '3', from: 'a', to: 'c', text: 'as', kind: 'async' },
      { type: 'message', id: '4', from: 'a', to: 'd', text: 'mk', kind: 'create' },
      { type: 'message', id: '5', from: 'a', to: 'd', text: 'mk2', kind: 'create' },
      { type: 'message', id: '6', from: 'a', to: 'd', text: 'x', kind: 'destroy' },
      { type: 'message', id: '7', from: 'a', to: 'a', text: 'found', kind: 'sync', ext: 'found' },
      { type: 'message', id: '8', from: 'a', to: 'a', text: 'lost', kind: 'async', ext: 'lost' },
      { type: 'ref', id: 'r', text: 'other', over: ['a', 'b'] },
      { type: 'note', id: 'n1', text: 'n\nn', over: ['a'] },
      { type: 'note', id: 'n2', text: 'L', over: ['a'], side: 'left' },
      { type: 'note', id: 'n3', text: 'R', over: ['a', 'b'], side: 'right' },
      { type: 'fragment', id: 'f1', op: 'group', sections: [{ id: 's', guard: 'lbl', items: [{ type: 'message', id: '9', from: 'a', to: 'b', text: 'in', kind: 'sync' }] }] },
      { type: 'fragment', id: 'f2', op: 'rect', sections: [{ id: 's1', guard: 'rgb(1,2,3)', items: [] }, { id: 's2', guard: '', items: [{ type: 'message', id: '10', from: 'a', to: 'b', text: 'r', kind: 'sync' }] }] },
      { type: 'fragment', id: 'f3', op: 'alt', sections: [{ id: 's3', guard: 'a', items: [] }, { id: 's4', guard: '', items: [] }] },
    ],
  };
  it('renders every construct', () => {
    const out = renderSeqMermaid(model);
    expect(out.startsWith('sequenceDiagram')).toBe(true);
    expect(out).toContain('autonumber');
    expect(out).toContain('box red Grp');
    expect(out).toContain('actor Alpha');
    expect(out).toContain('participant P2@{ "type": "database" } as two words');
    expect(out).toContain('box Grp'.slice(0, 3));
    expect(out).toContain('Alpha_');
    expect(out).toContain('l1<br/>l2');
    expect(out).toContain('-->>');
    expect(out).toContain('-)');
    expect(out).toContain('create participant New@{ "type": "entity" }');
    expect(out.match(/create /g)).toHaveLength(1);
    expect(out).toContain('-x');
    expect(out).toContain('Note left of Alpha: found: found');
    expect(out).toContain('Note right of Alpha: lost: lost');
    expect(out).toContain('Note over Alpha,P2: ref: other');
    expect(out).toContain('Note left of');
    expect(out).toContain('Note right of');
    expect(out).toContain('opt lbl');
    expect(out).toContain('rect rgb(1,2,3)');
    expect(out).toContain('alt a');
    expect(out).toMatch(/\n\s*else\n/);
  });
  it('round trips through the parser', () => {
    const simple: SequenceModel = {
      autonumber: false,
      participants: [{ id: 'a', name: 'A', kind: 'actor' }, { id: 'b', name: 'B', kind: 'participant' }],
      items: [
        { type: 'message', id: '1', from: 'a', to: 'b', text: 'go', kind: 'sync' },
        { type: 'message', id: '2', from: 'b', to: 'a', text: 'back', kind: 'return' },
      ],
    };
    const back = parseSeqMermaid(renderSeqMermaid(simple)).model;
    expect((allMessages(back.items) as SeqMessage[]).map((m) => [m.text, m.kind])).toEqual([['go', 'sync'], ['back', 'return']]);
  });
  it('activation marks: + and - signs', () => {
    const out = renderSeqMermaid({
      autonumber: false,
      participants: [{ id: 'a', name: 'A', kind: 'participant' }, { id: 'b', name: 'B', kind: 'participant' }],
      items: [
        { type: 'message', id: '1', from: 'a', to: 'b', text: 'c', kind: 'sync' },
        { type: 'message', id: '2', from: 'b', to: 'a', text: 'r', kind: 'return' },
        { type: 'message', id: '3', from: 'a', to: 'b', text: 'c', kind: 'async', activate: true },
        { type: 'message', id: '4', from: 'b', to: 'a', text: 'c', kind: 'async', deactivate: true },
        { type: 'message', id: '5', from: 'a', to: 'b', text: 'c', kind: 'sync', ext: 'found' },
      ],
    });
    expect(out).toContain('A->>+B: c');
    expect(out).toContain('B-->>-A: r');
    expect(out).toContain('A-)+B: c');
    expect(out).toContain('B-)-A: c');
    expect(out).toContain('activate B');
  });
});
