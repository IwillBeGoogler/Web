import { describe, expect, it } from 'vitest';
import { LOGIN } from './fixtures';
import { parseSeqMermaid, renderSeqMermaid } from './mermaid';
import { allMessages } from './types';

const SRC = `sequenceDiagram
  autonumber
  actor U as User
  participant W as Web
  participant A as Auth
  U->>W: login
  W->>+A: verify
  A-->>-W: ok
  W-)U: async hi
  A-xW: killed
  Note over U,W: shared note
  Note right of A: side
  alt valid
    W->>U: welcome
  else bad
    W->>U: denied
  end
  loop every minute
    W->>W: poll
  end
  opt maybe
    U->>A: x
  end
  par one
    U->>W: p1
  and two
    U->>A: p2
  end
`;
describe('Mermaid sequenceDiagram', () => {
  const { model, warnings } = parseSeqMermaid(SRC);
  it('parses participants, kinds and autonumber', () => {
    expect(warnings).toEqual([]);
    expect(model.autonumber).toBe(true);
    expect(model.participants.map((p) => [p.name, p.kind])).toEqual([['User', 'actor'], ['Web', 'participant'], ['Auth', 'participant']]);
  });
  it('maps arrows to message kinds', () => {
    const k = Object.fromEntries(allMessages(model.items).map((m) => [m.text, m.kind]));
    expect(k.login).toBe('sync');
    expect(k.ok).toBe('return');
    expect(k['async hi']).toBe('async');
    expect(k.killed).toBe('destroy');
  });
  it('+/- shorthand opens and closes activations', () => {
    const v = allMessages(model.items).find((m) => m.text === 'verify')!;
    expect(v.kind).toBe('sync');
    expect(allMessages(model.items).find((m) => m.text === 'ok')!.deactivate).toBeFalsy(); // a return closes by itself
  });
  it('notes and fragments with else / and sections', () => {
    const notes = model.items.filter((i) => i.type === 'note');
    expect(notes).toHaveLength(2);
    const alt = model.items.find((i) => i.type === 'fragment' && i.op === 'alt');
    expect(alt && alt.type === 'fragment' && alt.sections.map((s) => s.guard)).toEqual(['valid', 'bad']);
    const par = model.items.find((i) => i.type === 'fragment' && i.op === 'par');
    expect(par && par.type === 'fragment' && par.sections).toHaveLength(2);
  });
  it('round trips through render', () => {
    const again = parseSeqMermaid(renderSeqMermaid(model)).model;
    expect(strip(again)).toEqual(strip(model));
    const l = parseSeqMermaid(renderSeqMermaid(LOGIN)).model;
    expect(strip(l)).toEqual(strip(LOGIN));
  });
  it('auto-declares participants used only in messages; reports garbage', () => {
    const r = parseSeqMermaid('sequenceDiagram\n  A->>B: hi\n  ???\n');
    expect(r.model.participants.map((p) => p.name)).toEqual(['A', 'B']);
    expect(r.warnings.length).toBe(1);
  });
});

/** compare structure without ids */
function strip(m: ReturnType<typeof parseSeqMermaid>['model']): unknown {
  const name = (id: string) => m.participants.find((p) => p.id === id)?.name ?? id;
  const walk = (items: typeof m.items): unknown[] =>
    items.map((i) => (i.type === 'message' ? ['m', name(i.from), name(i.to), i.text, i.kind] : i.type === 'note' ? ['n', i.text, i.over.map(name), i.side ?? 'over'] : i.type === 'ref' ? ['r', i.text, i.over.map(name)] : ['f', i.op, i.sections.map((s) => [s.guard, walk(s.items)])]));
  return { a: m.autonumber, p: m.participants.map((p) => [p.name, p.kind]), i: walk(m.items) };
}
