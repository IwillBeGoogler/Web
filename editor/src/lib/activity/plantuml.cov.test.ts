import { describe, expect, it } from 'vitest';
import { looksLikeActivityPlantuml, parseActivityPlantuml, renderActivityPlantuml } from './plantuml';
import type { ActivityModel } from './types';

const P = (body: string) => parseActivityPlantuml(`@startuml\n${body}\n@enduml`);
const kinds = (m: ActivityModel) => m.nodes.map((n) => n.kind);

describe('parse activity plantuml', () => {
  it('skips noise and parses basic actions / end kinds / multiline / object / signals', () => {
    const { model, warnings } = P(`title X
' comment
skinparam a b

start
:one;
:multi
line;
:send>
:recv<
:Order [open]]
:plain]
end
kill
detach
stop`);
    expect(warnings).toEqual([]);
    expect(kinds(model)).toEqual(['initial', 'action', 'action', 'send', 'accept', 'object', 'object', 'flowFinal', 'flowFinal', 'final']);
    expect(model.nodes[2].name).toBe('multi\nline');
    expect(model.nodes[5]).toMatchObject({ name: 'Order', state: 'open' });
    expect(model.nodes[6].state).toBeUndefined();
  });
  it('lanes, partitions and guards', () => {
    const { model } = P(`|#red|Customer|
:a;
-> go;
|Shop|
:b;
partition "Inner" {
:c;
}
:d;
|Empty|
|Shop|
:e;
-> ;`);
    expect(model.lanes.map((l) => l.name)).toEqual(['Customer', 'Shop', 'Inner']);
    expect(model.flows[0].guard).toBe('go');
    expect(model.nodes.find((n) => n.name === 'c')!.lane).toBe(model.lanes[2].id);
    expect(model.nodes.find((n) => n.name === 'd')!.lane).toBe(model.lanes[1].id);
  });
  it('if / elseif / else / endif with guards, and no-else', () => {
    const { model, warnings } = P(`start
if (a?) then (yes)
:x;
elseif (b?) then (maybe)
:y;
else (no)
:z;
endif
:after;
if (c?) then
:q;
endif
stop`);
    expect(warnings).toEqual([]);
    expect(model.nodes.filter((n) => n.kind === 'decision').length).toBeGreaterThanOrEqual(4);
    expect(model.flows.some((f) => f.guard === 'no')).toBe(true);
  });
  it('switch, while, repeat, fork', () => {
    const { model, warnings } = P(`start
switch (v)
case (1)
:one;
case (2)
:two;
case
:three;
endswitch
while (more?) is (yes)
:work;
endwhile (done)
repeat
:r;
repeat while (again?) is (loop) not (leave)
fork
:f1;
fork again
:f2;
end fork
split
:s1;
split again
:s2;
end split
stop`);
    expect(warnings).toEqual([]);
    expect(kinds(model).filter((k) => k === 'fork').length).toBeGreaterThanOrEqual(4);
    expect(model.flows.some((f) => f.guard === 'done')).toBe(true);
    expect(model.flows.some((f) => f.guard === 'loop')).toBe(true);
    expect(model.flows.some((f) => f.guard === 'leave')).toBe(true);
  });
  it('notes inline and block', () => {
    const { model } = P(`:a;
note right: hello\\nworld
:b;
note left of x
l1
l2
end note
note over`);
    const notes = model.nodes.filter((n) => n.kind === 'note');
    expect(notes[0].name).toBe('hello\nworld');
    expect(notes[1].name).toBe('l1\nl2');
    expect(model.flows.filter((f) => f.note)).toHaveLength(2);
  });
  it('warns on mismatched or unknown constructs', () => {
    const { warnings } = P(`elseif (x) then
else
endif
case (1)
endswitch
endwhile
repeat while (x)
fork again
end fork
bogus line
:unterminated`);
    expect(warnings.length).toBeGreaterThanOrEqual(9);
    expect(warnings[0]).toMatch(/^Skipped: /);
  });
  it('closing a lone partition brace is harmless; block with single end', () => {
    const { model, warnings } = P(`}
if (a) then
:x;
stop
else
:y;
stop
endif
fork
:only;
end fork`);
    expect(warnings).toEqual([]);
    expect(model.nodes.length).toBeGreaterThan(3);
  });
});

describe('looksLikeActivityPlantuml', () => {
  it('detects activity and rejects others', () => {
    expect(looksLikeActivityPlantuml('no')).toBe(false);
    expect(looksLikeActivityPlantuml('@startuml\nclass A\n:x;\n@enduml')).toBe(false);
    expect(looksLikeActivityPlantuml('@startuml\n:x;\n@enduml')).toBe(true);
    expect(looksLikeActivityPlantuml('@startuml\nstart\nstop\n@enduml')).toBe(true);
    expect(looksLikeActivityPlantuml('@startuml\nstart\n@enduml')).toBe(false);
  });
});

const roundtrip = (src: string) => renderActivityPlantuml(parseActivityPlantuml(src).model);

describe('render activity plantuml', () => {
  it('sequential with lanes, notes, guards, all node kinds', () => {
    const m: ActivityModel = {
      lanes: [{ id: 'l', name: 'Lane' }],
      nodes: [
        { id: 'a', name: '', kind: 'initial', lane: 'l' },
        { id: 'b', name: 'do\nit', kind: 'action', lane: 'l' },
        { id: 'c', name: 'Obj', kind: 'object', state: 's' },
        { id: 'd', name: 'S', kind: 'send' },
        { id: 'e', name: 'A', kind: 'accept' },
        { id: 'n', name: 'note!', kind: 'note' },
        { id: 'f', name: '', kind: 'flowFinal' },
      ],
      flows: [
        { from: 'a', to: 'b' }, { from: 'b', to: 'c', guard: 'g\n1' }, { from: 'c', to: 'd' }, { from: 'd', to: 'e' }, { from: 'e', to: 'f' },
        { from: 'b', to: 'n', note: true }, { from: 'ghost', to: 'b' },
      ],
    };
    const out = renderActivityPlantuml(m);
    expect(out).toContain('|Lane|');
    expect(out).toContain('start');
    expect(out).toContain(':do\\nit;');
    expect(out).toContain('-> g\\n1;');
    expect(out).toContain(':Obj [s]]');
    expect(out).toContain(':S>');
    expect(out).toContain(':A<');
    expect(out).toContain('note right: note!');
    expect(out).toContain('end\n');
  });
  it('round-trips if/else', () => {
    const out = roundtrip(`@startuml
start
if (ok?) then (yes)
:a;
else (no)
:b;
endif
:c;
stop
@enduml`);
    expect(out).toContain('if (ok?) then (yes)');
    expect(out).toContain('else (no)');
    expect(out).toContain('endif');
    expect(out).toContain(':c;');
  });
  it('if without else branch merges directly', () => {
    const out = roundtrip(`@startuml
start
if (ok?) then (yes)
:a;
endif
:c;
stop
@enduml`);
    expect(out).toContain('if (ok?) then (yes)');
    expect(out).toContain('endif');
  });
  it('round-trips switch', () => {
    const out = roundtrip(`@startuml
start
switch (v)
case (1)
:a;
case (2)
:b;
case (3)
:c;
endswitch
stop
@enduml`);
    expect(out).toContain('switch (v)');
    expect(out).toContain('case (2)');
    expect(out).toContain('endswitch');
  });
  it('round-trips while', () => {
    const out = roundtrip(`@startuml
start
while (more?) is (yes)
:work;
endwhile (no)
stop
@enduml`);
    expect(out).toContain('while (more?) is (yes)');
    expect(out).toContain('endwhile (no)');
  });
  it('round-trips repeat', () => {
    const out = roundtrip(`@startuml
start
repeat
:r;
note right: n
repeat while (again?) is (go)
stop
@enduml`);
    expect(out).toContain('repeat\n');
    expect(out).toContain('repeat while (again?)');
  });
  it('round-trips fork from fork node and from plain action fan-out', () => {
    const f = roundtrip(`@startuml
start
fork
:a;
fork again
:b;
end fork
stop
@enduml`);
    expect(f).toContain('fork again');
    expect(f).toContain('end fork');
    const m: ActivityModel = {
      lanes: [],
      nodes: [{ id: 'a', name: 'A', kind: 'action' }, { id: 'b', name: 'B', kind: 'action' }, { id: 'c', name: 'C', kind: 'action' }, { id: 'd', name: 'D', kind: 'action' }],
      flows: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }],
    };
    const out = renderActivityPlantuml(m);
    expect(out).toContain('fork again');
    expect(out).toContain(':D;');
  });
  it('merge node with guarded way out, cross-link comment, multiple roots', () => {
    const m: ActivityModel = {
      lanes: [],
      nodes: [
        { id: 'a', name: 'A', kind: 'action' }, { id: 'm', name: '', kind: 'decision' }, { id: 'b', name: 'B', kind: 'action' },
        { id: 'x', name: 'X', kind: 'action' }, { id: 'y', name: 'Y', kind: 'action' },
      ],
      flows: [{ from: 'a', to: 'm' }, { from: 'm', to: 'b', guard: 'then' }, { from: 'x', to: 'y' }, { from: 'y', to: 'b' }],
    };
    const out = renderActivityPlantuml(m);
    expect(out).toContain('-> then;');
    expect(out).toContain(`continues at`);
    expect(out).toContain('\n\n');
  });
  it('empty model', () => {
    expect(renderActivityPlantuml({ lanes: [], nodes: [], flows: [] })).toBe('@startuml\n@enduml\n');
  });
  it('decision with 2 branches that rejoin without guard on the else', () => {
    const m: ActivityModel = {
      lanes: [],
      nodes: [{ id: 'd', name: 'q', kind: 'decision' }, { id: 'a', name: 'A', kind: 'action' }, { id: 'j', name: 'J', kind: 'action' }],
      flows: [{ from: 'd', to: 'a', guard: 'y' }, { from: 'd', to: 'j' }, { from: 'a', to: 'j' }],
    };
    const out = renderActivityPlantuml(m);
    expect(out).toContain('if (q) then (y)');
    expect(out).not.toContain('else');
  });
});

describe('render activity plantuml: edge shapes', () => {
  const R = (m: ActivityModel) => renderActivityPlantuml(m);
  it('notes flowing from the note, between notes, to missing nodes; object without state', () => {
    const out = R({
      lanes: [{ id: 'l', name: 'L' }],
      nodes: [
        { id: 'a', name: 'A', kind: 'object', lane: 'zz' }, { id: 'n1', name: 'from note', kind: 'note' }, { id: 'n2', name: 'n2', kind: 'note' },
        { id: 'b', name: 'B', kind: 'action' },
      ],
      flows: [{ from: 'a', to: 'b' }, { from: 'n1', to: 'a', note: true }, { from: 'n1', to: 'n2', note: true }, { from: 'q', to: 'a', note: true }, { from: 'a', to: 'n2' }],
    });
    expect(out).toContain(':A]');
    expect(out).toContain('note right: from note');
    expect(out).not.toContain('n2');
    expect(out).not.toContain('|zz|');
  });
  it('switch without join and unguarded cases', () => {
    const out = R({
      lanes: [],
      nodes: [{ id: 'd', name: 'sw', kind: 'decision' }, { id: 'a', name: 'A', kind: 'action' }, { id: 'b', name: 'B', kind: 'action' }, { id: 'c', name: 'C', kind: 'action' }],
      flows: [{ from: 'd', to: 'a' }, { from: 'd', to: 'b' }, { from: 'd', to: 'c' }],
    });
    expect(out).toContain('switch (sw)');
    expect(out).toContain('case\n');
  });
  it('if where first branch is the exit and else has a guard', () => {
    const out = R({
      lanes: [],
      nodes: [{ id: 'd', name: 'q', kind: 'decision' }, { id: 'a', name: 'A', kind: 'action' }, { id: 'j', name: 'J', kind: 'action' }],
      flows: [{ from: 'd', to: 'a' }, { from: 'd', to: 'j', guard: 'n' }, { from: 'a', to: 'j' }],
    });
    expect(out).toContain('else (n)');
  });
  it('while loop without guards and with exit', () => {
    const out = R({
      lanes: [],
      nodes: [{ id: 'd', name: 'w', kind: 'decision' }, { id: 'a', name: 'A', kind: 'action' }, { id: 'x', name: 'X', kind: 'action' }, { id: 's', name: '', kind: 'initial' }],
      flows: [{ from: 's', to: 'd' }, { from: 'd', to: 'a' }, { from: 'a', to: 'd' }, { from: 'd', to: 'x' }],
    });
    expect(out).toContain('while (w)');
    expect(out).toContain('endwhile\n');
    expect(out).toContain(':X;');
  });
  it('repeat without guards; fork node with 3 branches; terminal inside fork', () => {
    const rep = R({
      lanes: [],
      nodes: [{ id: 's', name: '', kind: 'initial' }, { id: 'r', name: '', kind: 'decision' }, { id: 'a', name: 'A', kind: 'action' }, { id: 'c', name: 'again', kind: 'decision' }, { id: 'e', name: '', kind: 'final' }],
      flows: [{ from: 's', to: 'r' }, { from: 'r', to: 'a' }, { from: 'a', to: 'c' }, { from: 'c', to: 'r' }, { from: 'c', to: 'e' }],
    });
    expect(rep).toContain('repeat while (again)');
    const fk = R({
      lanes: [],
      nodes: [{ id: 'f', name: '', kind: 'fork' }, { id: 'a', name: 'A', kind: 'action' }, { id: 'b', name: 'B', kind: 'action' }, { id: 'c', name: 'C', kind: 'flowFinal' }],
      flows: [{ from: 'f', to: 'a' }, { from: 'f', to: 'b' }, { from: 'f', to: 'c' }],
    });
    expect(fk.match(/fork again/g)).toHaveLength(2);
    expect(fk).toContain('end fork');
  });
  it('action with no outgoing flows then done; merge with no way out', () => {
    const out = R({ lanes: [], nodes: [{ id: 'm', name: '', kind: 'fork' }], flows: [] });
    expect(out).toBe('@startuml\n@enduml\n');
  });
});

describe('plantuml extra branches', () => {
  it('note before any node has no flow; while without guards / guarded tail; repeat without guards', () => {
    const a = P('note right: lonely');
    expect(a.model.flows).toEqual([]);
    const w = P(`start
while (x)
:a;
-> back;
endwhile
repeat
:b;
repeat while (again)
stop`);
    expect(w.warnings).toEqual([]);
    expect(w.model.flows.some((f) => f.guard === 'back')).toBe(true);
    const rr = renderActivityPlantuml(w.model);
    expect(rr).toContain('while (x)');
  });
  it('render: dangling note endpoint and continues-at for unnamed merge', () => {
    const out = renderActivityPlantuml({
      lanes: [],
      nodes: [{ id: 'n', name: 'N', kind: 'note' }, { id: 'a', name: 'A', kind: 'action' }, { id: 'f', name: '', kind: 'fork' }, { id: 'b', name: 'B', kind: 'action' }, { id: 'c', name: 'C', kind: 'action' }, { id: 'z', name: '', kind: 'decision' }],
      flows: [{ from: 'x', to: 'n', note: true }, { from: 'a', to: 'f' }, { from: 'f', to: 'b' }, { from: 'f', to: 'c' }, { from: 'b', to: 'z' }, { from: 'c', to: 'z' }, { from: 'z', to: 'a' }],
    });
    expect(out.startsWith('@startuml')).toBe(true);
  });
});
