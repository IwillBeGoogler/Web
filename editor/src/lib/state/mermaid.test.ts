import { describe, expect, it } from 'vitest';
import { parseStateMermaid, renderStateMermaid } from './mermaid';

const SRC = `stateDiagram-v2
  direction LR
  [*] --> Idle
  Idle --> Running : start [ready] / init()
  Running --> Idle : stop
  state Running {
    [*] --> Warm
    Warm --> Hot : heat
    Hot --> [*]
  }
  state decide <<choice>>
  state split <<fork>>
  state merge <<join>>
  Running --> decide
  decide --> split : [ok]
  split --> merge
  merge --> [*]
  state "Long name" as long
  long : entry / open
  Idle --> Idle : tick
`;
describe('Mermaid stateDiagram-v2', () => {
  const { model, warnings } = parseStateMermaid(SRC);
  const by = (id: string) => model.states.find((s) => s.id === id)!;
  it('parses states, pseudo states and direction', () => {
    expect(warnings).toEqual([]);
    expect(model.direction).toBe('LR');
    expect(by('decide').kind).toBe('choice');
    expect(by('split').kind).toBe('fork');
    expect(by('merge').kind).toBe('join');
    expect(by('long').name).toBe('Long name');
    expect(by('long').activity).toBe('entry / open');
  });
  it('[*] is a separate initial / final per scope', () => {
    const initials = model.states.filter((s) => s.kind === 'initial');
    expect(initials).toHaveLength(2);
    expect(initials.map((s) => s.parent).sort()).toEqual([undefined, 'Running'].sort());
    expect(model.states.filter((s) => s.kind === 'final')).toHaveLength(2);
  });
  it('composite state holds its children', () => {
    expect(by('Running').composite).toBe(true);
    expect(by('Warm').parent).toBe('Running');
    expect(by('Hot').parent).toBe('Running');
  });
  it('keeps the transition labels, including self transitions', () => {
    const t = model.transitions;
    expect(t.find((x) => x.from === 'Idle' && x.to === 'Running')!.label).toBe('start [ready] / init()');
    expect(t.find((x) => x.from === 'Idle' && x.to === 'Idle')!.label).toBe('tick');
    expect(t.find((x) => x.from === 'decide')!.label).toBe('[ok]');
  });
  it('round trips through render', () => {
    const again = parseStateMermaid(renderStateMermaid(model)).model;
    const norm = (m: typeof model) => ({
      s: m.states.map((s) => [s.name, s.kind, s.parent ? m.states.find((p) => p.id === s.parent)!.name : '', !!s.composite, s.activity ?? '']).sort(),
      t: m.transitions.map((t) => [m.states.find((s) => s.id === t.from)!.name || m.states.find((s) => s.id === t.from)!.kind, m.states.find((s) => s.id === t.to)!.name || m.states.find((s) => s.id === t.to)!.kind, t.label]).sort(),
    });
    expect(norm(again)).toEqual(norm(model));
  });
  it('history pseudo states are accepted and rendered as plain comments-safe states', () => {
    const r = parseStateMermaid('stateDiagram-v2\n state S {\n [*] --> A\n A --> [H]\n }\n');
    expect(r.model.states.some((s) => s.kind === 'history' && s.parent === 'S')).toBe(true);
    expect(renderStateMermaid(r.model)).not.toMatch(/\[H\]/);
  });
  it('reports garbage', () => {
    expect(parseStateMermaid('stateDiagram-v2\n  ???\n').warnings).toHaveLength(1);
  });
});

describe('state regions, notes and history', () => {
  const SRC2 = `stateDiagram-v2
  state Active {
    [*] --> Numlock
    Numlock --> Off : press
    --
    [*] --> Caps
    Caps --> Off2 : press
  }
  note right of Active : keyboard
  note left of Numlock
    line one
    line two
  end note
`;
  it('parses concurrent regions with their own initial states', () => {
    const { model, warnings } = parseStateMermaid(SRC2);
    expect(warnings).toEqual([]);
    const by = (id: string) => model.states.find((s) => s.id === id)!;
    expect(by('Numlock').region).toBeUndefined();
    expect(by('Caps').region).toBe(1);
    expect(model.states.filter((s) => s.kind === 'initial')).toHaveLength(2);
    expect(model.states.filter((s) => s.kind === 'initial').map((s) => s.region ?? 0).sort()).toEqual([0, 1]);
  });
  it('parses single and multi line notes', () => {
    const { model } = parseStateMermaid(SRC2);
    expect(model.notes).toEqual([
      { target: 'Active', side: 'right', text: 'keyboard' },
      { target: 'Numlock', side: 'left', text: 'line one\nline two' },
    ]);
  });
  it('round trips regions and notes', () => {
    const m = parseStateMermaid(SRC2).model;
    const out = renderStateMermaid(m);
    expect(out).toMatch(/^\s+--$/m);
    const again = parseStateMermaid(out).model;
    expect(again.states.map((s) => [s.id, s.region ?? 0])).toEqual(m.states.map((s) => [s.id, s.region ?? 0]));
    expect(again.notes).toEqual(m.notes);
  });
  it('history survives a Mermaid round trip through an sdd comment', () => {
    const r = parseStateMermaid('stateDiagram-v2\n state S {\n [*] --> A\n A --> [H*]\n }\n');
    const out = renderStateMermaid(r.model);
    expect(out).toMatch(/%% sdd:deepHistory/);
    const again = parseStateMermaid(out).model;
    expect(again.states.some((s) => s.kind === 'deepHistory' && s.parent === 'S')).toBe(true);
  });
});
