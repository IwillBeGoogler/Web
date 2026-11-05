import { describe, expect, it } from 'vitest';
import { addBox, addRef, removeParticipant, retargetMessage, setMessageExt } from './edit';
import { layoutSequence } from './layout';
import { parseSeqMermaid, renderSeqMermaid } from './mermaid';
import { parseSeqPlantUml, renderSeqPlantUml } from './plantuml';
import { validateSequence } from './validate';
import type { SeqMessage, SequenceModel } from './types';

const base: SequenceModel = {
  autonumber: false,
  participants: [{ id: 'a', name: 'A', kind: 'participant' }, { id: 'b', name: 'B', kind: 'participant' }, { id: 'c', name: 'C', kind: 'participant' }],
  items: [{ type: 'message', id: 'm1', from: 'a', to: 'b', text: 'hi', kind: 'sync' }],
};
const names = (m: SequenceModel, ids: string[]) => ids.map((i) => m.participants.find((p) => p.id === i)?.name);

describe('PlantUML: ref, box, found / lost, group', () => {
  const SRC = `@startuml
box "Backend" #LightBlue
participant API
database DB
end box
actor User
[-> API : webhook
API ->] : fire and forget
User -> API : go
ref over User, API : Login flow
ref over API
 line1
 line2
end ref
group Retry [3x]
  API -> DB : q
end
@enduml`;
  const r = parseSeqPlantUml(SRC);
  it('parses every construct without warnings', () => {
    expect(r.warnings).toEqual([]);
    expect(r.model.boxes).toHaveLength(1);
    expect(r.model.boxes![0]).toMatchObject({ label: 'Backend', color: '#LightBlue' });
    expect(names(r.model, r.model.boxes![0].participants)).toEqual(['API', 'DB']);
    const [f, l] = r.model.items as SeqMessage[];
    expect(f).toMatchObject({ ext: 'found', text: 'webhook' });
    expect(f.from).toBe(f.to);
    expect(l).toMatchObject({ ext: 'lost', text: 'fire and forget' });
    expect(r.model.items[3]).toMatchObject({ type: 'ref', text: 'Login flow' });
    expect(r.model.items[4]).toMatchObject({ type: 'ref', text: 'line1\nline2' });
    expect(r.model.items[5]).toMatchObject({ type: 'fragment', op: 'group' });
  });
  it('round trips', () => {
    const out = renderSeqPlantUml(r.model);
    expect(out).toContain('box "Backend" #LightBlue');
    expect(out).toContain('end box');
    expect(out).toContain('[-> API : webhook');
    expect(out).toContain('API ->] : fire and forget');
    expect(out).toContain('ref over User, API : Login flow');
    expect(out).toContain('group Retry [3x]');
    const again = parseSeqPlantUml(out);
    expect(again.warnings).toEqual([]);
    expect(again.model.items.map((i) => i.type)).toEqual(r.model.items.map((i) => i.type));
    expect(again.model.boxes![0].label).toBe('Backend');
  });
});

describe('Mermaid: box, rect', () => {
  const SRC = `sequenceDiagram
  box Aqua Services
    participant A
    participant B
  end
  participant C
  rect rgb(200, 220, 255)
    A->>B: hi
  end
  C->>A: x`;
  const r = parseSeqMermaid(SRC);
  it('parses box and rect', () => {
    expect(r.warnings).toEqual([]);
    expect(r.model.boxes).toEqual([{ id: 'b1', label: 'Services', color: 'Aqua', participants: ['p1', 'p2'] }]);
    expect(r.model.items[0]).toMatchObject({ type: 'fragment', op: 'rect' });
    expect((r.model.items[0] as { sections: { guard: string }[] }).sections[0].guard).toBe('rgb(200, 220, 255)');
  });
  it('exports box and rect and parses them back', () => {
    const out = renderSeqMermaid(r.model);
    expect(out).toContain('box Aqua Services');
    expect(out).toContain('rect rgb(200, 220, 255)');
    const again = parseSeqMermaid(out);
    expect(again.warnings).toEqual([]);
    expect(again.model.boxes?.[0].participants).toHaveLength(2);
  });
  it('exports found / lost / ref as notes (no Mermaid syntax)', () => {
    const m: SequenceModel = { ...base, items: [{ type: 'message', id: 'x', from: 'a', to: 'a', text: 'in', kind: 'sync', ext: 'found' }, { type: 'ref', id: 'r', text: 'other', over: ['a', 'b'] }] };
    const out = renderSeqMermaid(m);
    expect(out).toContain('Note left of A: found: in');
    expect(out).toContain('Note over A,B: ref: other');
    expect(parseSeqMermaid(out).warnings).toEqual([]);
  });
});

describe('editing', () => {
  it('retargetMessage moves one end; found / lost keep both ends together', () => {
    const m = retargetMessage(base, 'm1', 'to', 'c');
    expect((m.items[0] as SeqMessage).to).toBe('c');
    const f = setMessageExt(base, 'm1', 'found');
    expect(f.items[0]).toMatchObject({ ext: 'found', from: 'b', to: 'b' });
    expect(retargetMessage(f, 'm1', 'from', 'c').items[0]).toMatchObject({ from: 'c', to: 'c' });
    const back = setMessageExt(f, 'm1', undefined).items[0] as SeqMessage;
    expect(back.ext).toBeUndefined();
    expect(back.from).not.toBe(back.to);
  });
  it('addRef, addBox and removeParticipant keep the model valid', () => {
    let m = addRef(base, { over: ['a', 'c'], text: 'x' });
    m = addBox(m, ['a', 'b'], 'G');
    expect(validateSequence(m)).toBeUndefined();
    expect(m.items.at(-1)).toMatchObject({ type: 'ref', over: ['a', 'c'] });
    m = removeParticipant(m, 'a');
    expect(m.boxes![0].participants).toEqual(['b']);
    expect(m.items.at(-1)).toMatchObject({ over: ['c'] });
    expect(validateSequence(m)).toBeUndefined();
  });
});

describe('layout', () => {
  it('found / lost arrows stay beside their lifeline; lost opens no activation', () => {
    const m: SequenceModel = { ...base, items: [
      { type: 'message', id: 'f', from: 'b', to: 'b', text: 'in', kind: 'sync', ext: 'found' },
      { type: 'message', id: 'l', from: 'b', to: 'b', text: 'out', kind: 'sync', ext: 'lost' },
    ] };
    const l = layoutSequence(m);
    const bx = l.participants[1].x;
    const f = l.messages[0], lo = l.messages[1];
    expect(f.self).toBe(false);
    expect(f.x2).toBe(bx);
    expect(Math.abs(f.x1 - bx)).toBeGreaterThanOrEqual(70);
    expect(lo.x1).toBe(bx);
    expect(l.activations).toHaveLength(1);
  });
  it('boxes get a header row; refs get a frame spanning their participants', () => {
    const m = addRef(addBox(base, ['a', 'b'], 'G'), { over: ['a', 'c'] });
    const l = layoutSequence(m);
    expect(l.boxes).toHaveLength(1);
    expect(l.boxes[0].x).toBeLessThan(l.participants[0].boxX);
    expect(l.boxes[0].y + l.boxes[0].h).toBeGreaterThan(l.participants[0].boxTop);
    expect(l.participants[0].boxTop).toBeGreaterThan(layoutSequence(base).participants[0].boxTop);
    expect(l.refs[0].x).toBeLessThan(l.participants[0].x);
    expect(l.refs[0].x + l.refs[0].w).toBeGreaterThan(l.participants[2].x);
  });
  it('a participant created mid-diagram has its header at the creation row', () => {
    const m: SequenceModel = { ...base, items: [
      { type: 'message', id: 'a1', from: 'a', to: 'b', text: 'one', kind: 'sync' },
      { type: 'message', id: 'a2', from: 'a', to: 'c', text: 'new', kind: 'create' },
    ] };
    const l = layoutSequence(m);
    const c = l.participants[2], c1 = l.messages[1];
    expect(c.created).toBe(true);
    expect(c.boxTop + c.boxH / 2).toBeCloseTo(c1.y);
    expect(c.boxTop).toBeGreaterThan(l.participants[0].boxTop);
  });
});
