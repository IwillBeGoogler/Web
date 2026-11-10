import { describe, expect, it } from 'vitest';
import { parseSeqPlantUml, renderSeqPlantUml } from './plantuml';
import { allMessages, isFragment, type SequenceModel } from './types';

describe('parseSeqPlantUml', () => {
  it('declarations, aliases, create/destroy, activations, boxes, notes, refs, externals', () => {
    const { model, warnings } = parseSeqPlantUml(`@startuml
' comment
title T
skinparam x y
autonumber
box "Front" #lightblue
participant "Long Name" as L
actor U as "User"
end box
box Plain
database DB #red
collections Col
queue Q <<x>>
end box
box "NoColor"
control Ctl
end
create participant N
L -> N : make
create E
L -> E : mk
destroy N
L -> N !! : kill
destroy L
L -> L : self
L ->> U : async
L <-- U : ret
L <- U : rev
L -x U : x
L ->x U
U ->> L
activate U
deactivate U
L -> U : go\\nnext
[-> L : found
?->> L : found2
L ->] : lost
L -->? : lost2
note over L, U : both
note left of L : left
rnote right of U
line1
line2
end note
ref over L, U : see
ref over L
body
end ref
end box
@enduml`);
    expect(warnings).toContain('"end box" without an open box');
    expect(model.autonumber).toBe(true);
    expect(model.boxes![0]).toMatchObject({ label: 'Front', color: '#lightblue' });
    expect(model.participants.find((p) => p.name === 'Long Name')).toBeDefined();
    expect(model.participants.find((p) => p.name === 'User')!.kind).toBe('actor');
    expect(model.participants.find((p) => p.name === 'DB')!.kind).toBe('database');
    expect(model.participants.find((p) => p.name === 'Col')!.kind).toBe('entity');
    expect(model.participants.find((p) => p.name === 'Q')!.kind).toBe('participant');
    const msgs = allMessages(model.items);
    expect(msgs.some((m) => m.kind === 'create')).toBe(true);
    expect(msgs.some((m) => m.kind === 'destroy')).toBe(true);
    expect(msgs.find((m) => m.text === 'go\nnext')).toBeDefined();
    expect(msgs.some((m) => m.ext === 'found')).toBe(true);
    expect(msgs.some((m) => m.ext === 'lost')).toBe(true);
    const notes = model.items.filter((i) => i.type === 'note') as { text: string; side?: string }[];
    expect(notes.map((n) => n.side)).toEqual([undefined, 'left', 'right']);
    expect(notes[2].text).toBe('line1\nline2');
    const refs = model.items.filter((i) => i.type === 'ref') as { text: string; over: string[] }[];
    expect(refs[0].over).toHaveLength(2);
    expect(refs[1].text).toBe('body');
  });
  it('fragments, groups, warnings', () => {
    const { model, warnings } = parseSeqPlantUml(`A -> B : x
alt ok
A -> B : y
else no
A -> B : z
end
group Label
A -> B
end
par a
A -> B
and b
A -> B
end
else outside
end
???
participant`);
    expect(model.items.filter(isFragment).map((f) => f.op)).toEqual(['alt', 'group', 'par']);
    expect(warnings.length).toBe(3);
  });
});

describe('renderSeqPlantUml', () => {
  const model: SequenceModel = {
    autonumber: true,
    participants: [
      { id: 'a', name: 'Alpha', kind: 'actor' }, { id: 'b', name: 'two words', kind: 'database' }, { id: 'c', name: 'Alpha', kind: 'participant' },
      { id: 'd', name: 'New', kind: 'entity' },
    ],
    boxes: [{ id: 'bx', label: 'Grp', color: '#aaa', participants: ['a', 'b'] }, { id: 'by', label: '', participants: ['c'] }],
    items: [
      { type: 'message', id: '1', from: 'a', to: 'b', text: 'l1\nl2', kind: 'sync' },
      { type: 'message', id: '2', from: 'b', to: 'a', text: 'ret', kind: 'return' },
      { type: 'message', id: '3', from: 'a', to: 'c', text: 'as', kind: 'async', activate: true },
      { type: 'message', id: '3b', from: 'c', to: 'a', text: 'back', kind: 'async', deactivate: true },
      { type: 'message', id: '4', from: 'a', to: 'd', text: 'mk', kind: 'create' },
      { type: 'message', id: '5', from: 'a', to: 'd', text: 'mk2', kind: 'create' },
      { type: 'message', id: '6', from: 'a', to: 'd', text: 'x', kind: 'destroy' },
      { type: 'message', id: '7', from: 'a', to: 'a', text: 'found', kind: 'sync', ext: 'found' },
      { type: 'message', id: '8', from: 'a', to: 'a', text: 'lost', kind: 'async', ext: 'lost' },
      { type: 'message', id: '8b', from: 'a', to: 'a', text: 'lost', kind: 'return', ext: 'found' },
      { type: 'ref', id: 'r', text: 'other', over: ['a', 'b'] },
      { type: 'note', id: 'n1', text: 'n\nn', over: ['a'] },
      { type: 'note', id: 'n2', text: 'L', over: ['a'], side: 'left' },
      { type: 'note', id: 'n3', text: 'R', over: ['a', 'b'], side: 'right' },
      { type: 'fragment', id: 'f2', op: 'rect', sections: [{ id: 's1', guard: 'rgb(1,2,3)', items: [{ type: 'message', id: '10', from: 'a', to: 'b', text: 'r', kind: 'sync' }] }, { id: 's2', guard: '', items: [] }] },
      { type: 'fragment', id: 'f3', op: 'alt', sections: [{ id: 's3', guard: 'a', items: [] }, { id: 's4', guard: '', items: [] }] },
      { type: 'fragment', id: 'f4', op: 'rect', sections: [] },
    ],
  };
  it('renders every construct', () => {
    const out = renderSeqPlantUml(model);
    expect(out.startsWith('@startuml')).toBe(true);
    expect(out.trimEnd().endsWith('@enduml')).toBe(true);
    expect(out).toContain('autonumber');
    expect(out).toContain('box "Grp" #aaa');
    expect(out).toContain('end box');
    expect(out).toContain('actor Alpha');
    expect(out).toContain('database "two words" as P2');
    expect(out).toContain('l1\\nl2');
    expect(out).toContain('-->');
    expect(out).toContain('->>');
    expect(out).toContain('activate');
    expect(out).toContain('deactivate');
    expect(out.match(/create /g)).toHaveLength(1);
    expect(out).toContain('!!');
    expect(out).toContain('[-> Alpha : found');
    expect(out).toContain('[--> Alpha : lost');
    expect(out).toContain('->> ] : lost'.replace('->> ]', 'Alpha ->>]').slice(0, 0) + 'Alpha ->>] : lost');
    expect(out).toContain('ref over Alpha, P2 : other');
    expect(out).toContain('note left of');
    expect(out).toContain('note right of');
    expect(out).toContain("' rect rgb(1,2,3)");
    expect(out).toContain("' rect");
    expect(out).toContain('alt a');
    expect(out).toMatch(/\nelse\n/);
  });
  it('round-trips', () => {
    const back = parseSeqPlantUml(renderSeqPlantUml(model));
    expect(allMessages(back.model.items).length).toBeGreaterThan(8);
  });
  it('plain participant without box', () => {
    const out = renderSeqPlantUml({ autonumber: false, participants: [{ id: 'a', name: 'A', kind: 'participant' }, { id: 'b', name: 'B', kind: 'participant' }], boxes: [{ id: 'x', label: '', participants: ['a'] }], items: [] });
    expect(out).toContain('box\n');
    expect(out).toContain('participant B');
  });
});
