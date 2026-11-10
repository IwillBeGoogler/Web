import { describe, expect, it } from 'vitest';
import { parseDsl } from '@core/dsl';
import { describeFrame, inClassBody, parseMember, parseUmlLine, splitTopLevel } from '@core/dsl/parse2';
import { parseTimingLine } from '@core/dsl/parseTiming';
import { emptyDoc, type DslTiming } from '@core/dsl/types';

const run = (block: string, body: string) => parseDsl(`${block} {\n${body}\n}`);
const msgs = (block: string, body: string) => run(block, body).diagnostics.map((d) => `${d.severity[0]}:${d.message}`);

describe('parse2 helpers', () => {
  it('splitTopLevel', () => {
    expect(splitTopLevel('a, b<c, d>, e(f, g), h=>i, j')).toEqual(['a', 'b<c, d>', 'e(f, g)', 'h=>i', 'j']);
    expect(splitTopLevel('')).toEqual([]);
    expect(splitTopLevel(')a,b')).toEqual([')a', 'b']);
  });
  it('parseMember', () => {
    expect(parseMember('+ static x: int = 1')).toMatchObject({ vis: '+', static: true, name: 'x', type: 'int', default: '1', op: false });
    expect(parseMember('abstract # f(a: A, b, ): R')).toMatchObject({ abstract: true, vis: '#', op: true, type: 'R', params: [{ name: 'a', type: 'A' }, { name: 'b' }] });
    expect(parseMember('"a b"')).toMatchObject({ name: 'a b', op: false });
    expect(parseMember('+ - x')).toMatch(/unexpected/);
    expect(parseMember('+')).toMatch(/expected a member/);
    expect(parseMember('f(a')).toBe('missing ")" in the operation');
    expect(parseMember('f(a) junk')).toBe('unexpected text after the operation');
    expect(parseMember('f(a b c)')).toMatchObject({ params: [{ name: 'a b c' }] });
    expect(parseMember('x y')).toMatch(/unexpected "y" after the member name/);
    expect(parseMember('f(a): ')).toMatchObject({ op: true });
    expect(parseMember('f(a)')).not.toHaveProperty('type');
    expect(parseMember('x = 1')).toMatchObject({ name: 'x', default: '1' });
  });
  it('inClassBody / describeFrame', () => {
    expect(inClassBody(undefined)).toBe(false);
    expect(inClassBody({ block: 'classes', frames: [] } as any)).toBe(false);
    expect(inClassBody({ block: 'classes', frames: [{ k: 'class' }] } as any)).toBe(true);
    expect(inClassBody({ block: 'classes', frames: [{ k: 'object' }] } as any)).toBe(true);
    expect(describeFrame({ block: 'states', frames: [] } as any)).toBe('states block');
    expect(describeFrame({ block: 'states', frames: [{ k: 'class', cls: { name: 'A' } }] } as any)).toBe('class "A"');
    expect(describeFrame({ block: 'states', frames: [{ k: 'ucase', item: { id: 'u' } }] } as any)).toBe('usecase "u"');
    expect(describeFrame({ block: 'states', frames: [{ k: 'object', obj: { id: 'o' } }] } as any)).toBe('object "o"');
    expect(describeFrame({ block: 'states', frames: [{ k: 'package', id: 'p' }] } as any)).toBe('package "p"');
  });
});

describe('classes block', () => {
  it('errors', () => {
    expect(msgs('classes', 'package')).toEqual(['e:package needs an id, e.g. package shop "Shop" {']);
    expect(msgs('classes', 'package p')).toEqual(['e:expected "{" after the package']);
    expect(msgs('classes', 'package p {\npackage p {\n}\n}\nclass A<T')).toEqual(['e:duplicate id "p"', 'e:missing ">" in the type parameters']);
    expect(msgs('classes', 'class A "unterminated')).toEqual(['e:unterminated string']);
    expect(msgs('classes', 'class A }')).toEqual(['e:unexpected "}" in the class header']);
    expect(msgs('classes', 'class A\nclass A')).toEqual(['e:duplicate class "A"']);
    expect(msgs('classes', 'class A\nclass B\nA --> B bogus=1')).toEqual(['w:unknown relation attribute "bogus"']);
    expect(msgs('classes', 'wat')).toEqual([expect.stringContaining('unknown statement "wat" in classes')]);
    expect(msgs('classes', 'class A {\n+\n}')).toEqual(['e:expected a member:  + name: Type  or  + name(a: A): R']);
  });
  it('extends/implements sugar, nested packages, generics, enum members, attrs', () => {
    const r = run('classes', 'package a "A" {\npackage b {\nclass C<K => V> extends P, Q implements I "st" archRef=n archFile=f archPage=pg model=m {\nx\n}\n}\n}\nclass P\nclass Q\ninterface I\nenum E {\nRED\nf(): int\n}');
    expect(r.diagnostics).toEqual([]);
    expect(r.doc.packages).toEqual([expect.objectContaining({ id: 'a', label: 'A' }), expect.objectContaining({ id: 'b', label: 'b', parent: 'a' })]);
    const c = r.doc.classes[0];
    expect(c).toMatchObject({ name: 'C', generics: 'K => V', stereotype: 'st', pkg: 'b', archRef: { nodeId: 'n', fileId: 'f', pageId: 'pg' }, modelId: 'm' });
    expect(r.doc.classRels.map((x) => `${x.to}:${x.kind}`)).toEqual(['P:inheritance', 'Q:inheritance', 'I:realization']);
    expect(r.doc.classes.find((x) => x.name === 'E')!.attrs.map((x) => x.op)).toEqual([false, false]);
  });
  it('unknown classes in relations', () => {
    expect(msgs('classes', 'class A\nA --> Z\nZ --> A')).toEqual(['e:unknown class "Z"', 'e:unknown class "Z"']);
  });
});

describe('packages block', () => {
  it('errors and relations', () => {
    expect(msgs('packages', 'package')).toEqual(['e:package needs an id, e.g. package shop "Shop" {']);
    expect(msgs('packages', 'package a\npackage a')).toEqual(['e:duplicate id "a"']);
    expect(msgs('packages', 'nope')).toEqual([expect.stringContaining('unknown statement "nope" in packages')] as any);
    const r = run('packages', 'package a "A" {\npackage b\n}\na imports b "why"\nb access a\na merges b\nb ..> a\na imports z');
    expect(r.doc.packages.map((p) => [p.id, p.label, p.parent])).toEqual([['a', 'A', undefined], ['b', 'b', 'a']]);
    expect(r.doc.pkgRels.map((p) => [p.kind, p.label])).toEqual([['import', 'why'], ['access', undefined], ['merge', undefined], ['dependency', undefined]]);
    expect(r.diagnostics.map((d) => d.message)).toEqual(['unknown package "z"']);
  });
});

describe('objects & communication', () => {
  it('objects', () => {
    expect(msgs('objects', 'object')).toEqual(['e:object needs an id, e.g. object o1 "alice" class=User {']);
    expect(msgs('objects', 'object a bogus=1')).toEqual(['w:unknown object attribute "bogus"']);
    expect(msgs('objects', 'object a\nobject a')).toEqual(['e:duplicate id "a"']);
    expect(msgs('objects', 'object a { \nx = 1\n}')).toEqual([]);
    expect(msgs('objects', 'nope')).toEqual([expect.stringContaining('unknown statement "nope" in objects')] as any);
    expect(msgs('objects', 'object a\nobject b\na -- b bogus=1')).toEqual(['w:unknown link attribute "bogus"']);
    expect(msgs('objects', 'object a\nobject b\na -- b "x" , srcRole=r dstRole=d')).toEqual([]);
    const r = run('objects', 'object a "A" class=User model=m {\n"s 1" = v\nz\n}\nobject b class model\na -- b "link" srcRole=x dstRole=y');
    expect(r.doc.objects[0]).toMatchObject({ className: 'User', modelId: 'm', slots: [{ name: 's 1', value: 'v' }, { name: 'z', value: '' }] });
    expect(r.doc.objects[1]).not.toHaveProperty('className');
    expect(r.doc.objLinks[0]).toMatchObject({ label: 'link', srcRole: 'x', dstRole: 'y' });
  });
  it('bad slot', () => {
    expect(msgs('objects', 'object a {\n= x\n}')).toEqual(['e:expected a slot:  attribute = value']);
  });
  it('communication', () => {
    expect(msgs('communication', 'nope')).toEqual([expect.stringContaining('unknown statement "nope" in communication')] as any);
    expect(msgs('communication', 'object a\nobject b\n1 a -> b "t" bogus=1')).toEqual(['w:unknown message attribute "bogus"']);
    const r = run('communication', 'object a\nobject b\n1 a -> b\n1.1 b -> a "t" async\n2 a -> z');
    expect(r.doc.commMsgs.map((m) => [m.seq, m.text, m.async])).toEqual([['1', '', false], ['1.1', 't', true]]);
    expect(r.doc.objLinks).toHaveLength(1);
    expect(r.diagnostics.map((d) => d.message)).toEqual(['unknown object "z"']);
  });
});

describe('states block', () => {
  it('errors', () => {
    expect(msgs('states', 'region')).toEqual(['e:"region" belongs inside a composite state']);
    expect(msgs('states', 'final')).toEqual(['e:final needs an id, e.g. final s1 "Name"']);
    expect(msgs('states', 'final f {\n}')[0]).toBe('e:only a plain state can hold other states');
    expect(msgs('states', 'state a\nstate a')).toEqual(['e:duplicate id "a"']);
    expect(msgs('states', 'huh')).toEqual([expect.stringContaining('unknown statement "huh" in states')] as any);
    expect(msgs('states', 'state a\na -> b')).toEqual(['e:unknown state "b"']);
  });
  it('regions and attrs', () => {
    const r = run('states', 'state c "C" {\nstate x\nregion\nstate y activity="do" vertical\nentryPoint e1\n}\nfork f vertical\nstate a\na -> c "ev"\nc -> a ""');
    expect(r.diagnostics).toEqual([]);
    const by = (id: string) => r.doc.states.find((s) => s.id === id)!;
    expect(by('c')).toMatchObject({ composite: true, label: 'C' });
    expect(by('y')).toMatchObject({ region: 1, parent: 'c', activity: 'do', vertical: true });
    expect(by('e1')).toMatchObject({ region: 0, kind: 'entryPoint', label: '' });
    expect(by('f').vertical).toBe(true);
    expect(r.doc.transitions.map((t) => t.label)).toEqual(['ev', undefined]);
  });
});

describe('usecases block', () => {
  it('errors', () => {
    expect(msgs('usecases', 'actor')).toEqual(['e:actor needs an id, e.g. actor x "Name"']);
    expect(msgs('usecases', 'actor a {\n}')[0]).toBe('e:an actor has no body');
    expect(msgs('usecases', 'boundary b {\nboundary c {\n}\n}')).toEqual(['e:boundaries cannot be nested']);
    expect(msgs('usecases', 'usecase u {\nwat\n}')).toEqual(['e:expected: point "Extension point"']);
    expect(msgs('usecases', 'usecase u {\npoint\n}')).toEqual(['e:expected: point "Extension point"']);
    expect(msgs('usecases', 'zzz')).toEqual([expect.stringContaining('unknown statement "zzz" in usecases')] as any);
    expect(msgs('usecases', 'actor a\na -- z')).toEqual(['e:unknown actor or use case "z"']);
    expect(msgs('usecases', 'actor a\nactor a')).toEqual(['e:duplicate id "a"']);
  });
  it('relations', () => {
    const r = run('usecases', 'actor a\nusecase u "U" {\npoint "p1"\n}\na -- u "l" srcMult=1 dstMult=2 , extra\nu include u');
    expect(r.doc.ucRels[0]).toMatchObject({ kind: 'association', label: 'l', srcMult: '1', dstMult: '2' });
    expect(r.doc.ucItems[1].points).toEqual(['p1']);
  });
});

describe('activity block', () => {
  it('errors', () => {
    expect(msgs('activity', 'lane')).toEqual(['e:lane needs an id, e.g. lane shop "Shop" {']);
    expect(msgs('activity', 'lane l')).toEqual(['e:expected "{" after the lane']);
    expect(msgs('activity', 'lane a {\nlane b {\n}\n}')).toEqual(['e:lanes cannot be nested']);
    expect(msgs('activity', 'lane a "A" bogus=1 {\n}')).toEqual(['w:unknown lane attribute "bogus"']);
    expect(msgs('activity', 'lane a orient=x {\n}')).toEqual(['w:orient is v (columns) or h (rows)']);
    expect(msgs('activity', 'action')).toEqual(['e:action needs an id, e.g. action x "Name"']);
    expect(msgs('activity', 'action a {\n}')[0]).toBe('e:an activity element has no body');
    expect(msgs('activity', 'action a\naction a')).toEqual(['e:duplicate id "a"']);
    expect(msgs('activity', 'huh')).toEqual([expect.stringContaining('unknown statement "huh" in activity')] as any);
    expect(msgs('activity', 'action a\na -> z')).toEqual(['e:unknown activity element "z"']);
  });
  it('kinds', () => {
    const r = run('activity', 'lane l "L" orient=h {\nfork f vertical\naction a "A"\nobject o state=s\n}\ninitial i\nobject p state=q vertical\naction b vertical\ni -> a "[g]"\nb -- a');
    expect(r.diagnostics).toEqual([]);
    const by = (id: string) => r.doc.actNodes.find((s) => s.id === id)!;
    expect(by('f')).toMatchObject({ vertical: true, lane: 'l', label: '' });
    expect(by('o')).toMatchObject({ state: 's', label: 'o' });
    expect(by('b').vertical).toBe(false);
    expect(r.doc.actLanes[0].orient).toBe('h');
    expect(r.doc.actFlows.map((f) => [f.label, f.note])).toEqual([['[g]', false], [undefined, true]]);
  });
});

describe('deployment block', () => {
  it('errors', () => {
    expect(msgs('deployment', 'node')).toEqual(['e:node needs an id, e.g. node x "Name"']);
    expect(msgs('deployment', 'node a bogus=1')).toEqual(['w:unknown deployment attribute "bogus"']);
    expect(msgs('deployment', 'artifact a {\n}')).toEqual(['e:only a node, device or executionEnvironment can hold other elements']);
    expect(msgs('deployment', 'node a\nnode a')).toEqual(['e:duplicate id "a"']);
    expect(msgs('deployment', 'huh')).toEqual([expect.stringContaining('unknown statement "huh" in deployment')] as any);
    expect(msgs('deployment', 'node a\na -- z')).toEqual(['e:unknown deployment element "z"']);
  });
  it('links', () => {
    const r = run('deployment', 'node a "A" stereotype=s icon=i {\nartifact b\n}\na -- b "p"\na ..> b\nb manifests a ""');
    expect(r.doc.depNodes[0]).toMatchObject({ stereotype: 's', icon: 'i' });
    expect(r.doc.depNodes[1].parent).toBe('a');
    expect(r.doc.depLinks.map((l) => [l.kind, l.label])).toEqual([['communication', 'p'], ['deploy', undefined], ['manifest', undefined]]);
  });
});

describe('components block', () => {
  it('errors', () => {
    expect(msgs('components', 'component')).toEqual(['e:component needs an id, e.g. component api "API"']);
    expect(msgs('components', 'component a {\nprovides\n}')).toEqual(['e:provides needs interface names, e.g. provides IPayment']);
    expect(msgs('components', 'component a\ncomponent a')).toEqual(['e:duplicate id "a"']);
    expect(msgs('components', 'huh')).toEqual([expect.stringContaining('unknown statement "huh" in components')] as any);
    expect(msgs('components', 'component a\na -- z')).toEqual(['e:unknown component "z"']);
  });
  it('provides without a registered component is ignored', () => {
    // duplicate id: the second component is not registered, its body lines find no component of that id... the first one takes them
    const r = run('components', 'component a "A" archRef=x {\nprovides I, J\nrequires K\ncomponent b stereotype=s\n}\na ..> b "uses"\nb -- a');
    expect(r.doc.comps[0]).toMatchObject({ provides: ['I', 'J'], requires: ['K'], archRef: { nodeId: 'x' } });
    expect(r.doc.comps[1]).toMatchObject({ parent: 'a', stereotype: 's' });
    expect(r.doc.compLinks.map((l) => l.kind)).toEqual(['dependency', 'assembly']);
    const dup = run('components', 'component a\ncomponent a {\nprovides X\n}');
    expect(dup.doc.comps[0].provides).toEqual(['X']);
  });
});

describe('parse blocks', () => {
  it('lexer error and empty lines inside uml block', () => {
    expect(msgs('states', 'state a "oops')).toEqual(['e:unterminated string']);
    expect(msgs('states', '   \n')).toEqual([]);
  });
});

describe('timing parser', () => {
  const tm = (): DslTiming => ({ id: 't', title: 'T', unit: 'ms', lifelines: [], changes: [], messages: [], constraints: [], line: 1 });
  const feed = (lines: string[], t = tm()) => {
    const d: string[] = [];
    const closed = lines.map((l, i) => parseTimingLine(t, l, i + 1, (_l, _c, m, s) => d.push(`${s ?? 'error'}:${m}`)));
    return { t, d, closed };
  };
  it('declarations', () => {
    const r = feed(['robust a "A" states X, "Y y" period=5', 'binary b states q', 'clock c period=2 states z', 'clock d period=0', 'concise e', 'robust a', 'robust', 'robust f oops !', 'robust g period=abc', 'clock h period=2', 'robust i period=3']);
    expect(r.d).toEqual([
      'warning:period belongs to a clock',
      'warning:a binary lifeline has no state list',
      'warning:a clock lifeline has no state list',
      'error:period is a positive number',
      'error:duplicate lifeline "a"',
      'error:robust needs an id, e.g. robust web "Web"',
      'error:unexpected "oops" in the robust declaration',
      'error:unexpected "!" in the robust declaration',
      'error:period is a positive number',
      'warning:period belongs to a clock',
    ]);
    expect(r.t.lifelines.map((l) => [l.id, l.name, l.kind, l.states, l.period])).toEqual([
      ['a', 'A', 'robust', ['X', 'Y y'], undefined], ['b', 'b', 'binary', ['high', 'low'], undefined], ['c', 'c', 'clock', [], 2], ['d', 'd', 'clock', [], undefined], ['e', 'e', 'concise', [], undefined],
      ['f', 'f', 'robust', [], undefined], ['g', 'g', 'robust', [], undefined], ['h', 'h', 'clock', [], 2], ['i', 'i', 'robust', [], undefined],
    ]);
  });
  it('unit, end, close, lex error, empty', () => {
    const r = feed(['unit s', 'unit', 'end 50', 'end -3', 'end x', 'end', '}', 'robust a "oops', '   ']);
    expect(r.t.unit).toBe('s');
    expect(r.t.end).toBe(50);
    expect(r.d).toEqual([expect.stringContaining('unknown statement "unit"'), 'error:end is a positive number, e.g. end 400', 'error:end is a positive number, e.g. end 400', expect.stringContaining('unknown statement "end"'), 'error:unterminated string']);
    expect(r.closed[6]).toBe(true);
    expect(r.closed.filter(Boolean)).toHaveLength(1);
  });
  it('changes', () => {
    const r = feed(['robust a states X', 'binary b', 'clock c', 'a @1 Y', 'a @1 Z', 'a @2 X', 'b @1 high', 'b @2 mid', 'c @1 x', 'zz @1 x', 'a @-1 x', 'a @x x']);
    expect(r.t.changes.map((c) => [c.life, c.t, c.state])).toEqual([['a', 1, 'Z'], ['a', 2, 'X'], ['b', 1, 'high'], ['b', 2, 'low']]);
    expect(r.t.lifelines[0].states).toEqual(['X', 'Y', 'Z']);
    expect(r.d).toEqual(['warning:a binary lifeline is high or low', 'error:a clock has no state changes', 'error:unknown lifeline "zz"', 'error:expected a time like @100', 'error:expected a time like @100']);
  });
  it('messages and constraints', () => {
    const r = feed(['robust a', 'robust b', 'a -> b @1..3 "m"', 'b -> a @2', 'b -> a @2..2 "same"', 'z -> b @1', 'a -> z @1', 'a -> b @x', 'a 1..2', 'b 5..3 "k"', 'z 1..2', 'a ?? foo', 'nonsense']);
    expect(r.t.messages).toMatchObject([{ from: 'a', to: 'b', t: 1, t2: 3, text: 'm' }, { from: 'b', to: 'a', t: 2, text: '' }, { from: 'b', to: 'a', t: 2, text: 'same' }]);
    expect(r.t.messages[1]).not.toHaveProperty('t2');
    expect(r.t.messages[2]).not.toHaveProperty('t2');
    expect(r.t.constraints).toMatchObject([{ life: 'a', t1: 1, t2: 2, text: '' }, { life: 'b', t1: 3, t2: 5, text: 'k' }]);
    expect(r.d).toEqual(['error:unknown lifeline "z"', 'error:unknown lifeline "z"', 'error:expected a time like @100 or @100..150', 'error:unknown lifeline "z"', expect.stringContaining('unknown statement "a" in timing'), expect.stringContaining('unknown statement "nonsense" in timing')]);
  });
  it('through parseDsl', () => {
    const r = parseDsl('timing t "T" {\nunit ms\nend 100\nrobust a states X\na @0 X\n}');
    expect(r.diagnostics).toEqual([]);
    expect(r.doc.timings[0]).toMatchObject({ id: 't', unit: 'ms', end: 100 });
    void emptyDoc;
  });
});

describe('parse2 extra branches', () => {
  it('class relation with label and all attrs, quoted names, attrs with stray symbols', () => {
    const r = run('classes', 'abstract class Z\nclass "A b" {\n+ f(): int\n+ g: int\n}\nclass B\n"A b" --> B "lbl" srcMult=1 dstMult=* srcRole=a dstRole=b\n"A b" -- B [x]');
    expect(r.doc.classes.map((c) => [c.name, c.kind])).toEqual([['Z', 'abstract'], ['A b', 'class'], ['B', 'class']]);
    expect(r.doc.classes[1].ops).toHaveLength(1);
    expect(r.doc.classes[1].attrs).toHaveLength(1);
    expect(r.doc.classRels[0]).toMatchObject({ label: 'lbl', srcMult: '1', dstMult: '*', srcRole: 'a', dstRole: 'b', directed: true });
    expect(r.diagnostics.map((d) => d.message)).toEqual(['unexpected "["', 'unexpected "]"', 'unknown relation attribute "x"']);
  });
  it('duplicate lane, provides without registered component, reverse message link', () => {
    expect(msgs('activity', 'lane a {\n}\nlane a {\n}')).toEqual(['e:duplicate id "a"']);
    const r = parseDsl('activity {\naction a\n}\ncomponents {\ncomponent a {\nprovides X\n}\n}');
    expect(r.diagnostics.map((d) => d.message)).toEqual(['duplicate id "a"']);
    expect(r.doc.comps).toEqual([]);
    const c = run('communication', 'object a\nobject b\na -- b\n1 b -> a');
    expect(c.doc.objLinks).toHaveLength(1);
    expect(c.doc.commMsgs).toHaveLength(1);
    const c2 = run('communication', 'object a\nobject b\nobject c\na -- b\n1 a -> c');
    expect(c2.doc.objLinks.map((l) => `${l.from}-${l.to}`)).toEqual(['a-b', 'a-c']);
  });
  it('blank line passed straight to parseUmlLine is ignored', () => {
    const doc = emptyDoc();
    const ctx: any = { kind: 'uml', block: 'states', frames: [], line: 1 };
    parseUmlLine(ctx, '   ', 1, doc, () => { throw new Error('no diag'); }, new Set(), []);
    expect(doc.states).toEqual([]);
  });
  it('timing line starting with a non word', () => {
    const t: DslTiming = { id: 't', title: 'T', unit: 'ms', lifelines: [], changes: [], messages: [], constraints: [], line: 1 };
    const d: string[] = [];
    expect(parseTimingLine(t, '"x" y', 1, (_l, _c, m) => d.push(m))).toBe(false);
    expect(d[0]).toContain('unknown statement "x" in timing');
  });
  it('top level nesting errors in parse.ts', () => {
    expect(parseDsl('group g {\nclasses {\n}\n}').diagnostics.map((d) => d.message)).toContain('classes blocks must be at the top level');
    expect(parseDsl('table a {\nid int\n}\nref: a.id - a.id [bogus, delete: cascade]').doc.refs[0].attrs).toEqual({ delete: 'cascade' });
    expect(parseDsl('classes {\nclass A {\n# p: int\n}\n# comment\n}').doc.classes[0].attrs[0]).toMatchObject({ vis: '#', name: 'p' });
    expect(parseDsl('group g {\n# comment\n}').diagnostics).toEqual([]);
    expect(parseDsl('seq "S" {\nalt\nelse\nend\n}').doc.seqs[0].items).toEqual([{ type: 'fragment', op: 'alt', sections: [{ guard: '', items: [] }, { guard: '', items: [] }] }]);
    expect(parseDsl('enum e {\n[x]\nok\n}').doc.tables[0].columns.map((c) => c.name)).toEqual(['ok']);
  });
});
