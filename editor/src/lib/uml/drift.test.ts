import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { applyUmlModel } from './apply';
import { diagramToModel } from './convert';
import { computeDrift, driftKey } from './drift';
import { acceptChange } from './driftApply';
import { importUmlText } from './io';
import { useDriftStore } from './driftStore';

const s = () => useDiagramStore.getState();
const CODE_V1 = `
export interface Repo { find(id: string): Promise<User>; }
export abstract class Base { protected id: string; abstract save(): void; }
export class User extends Base implements Repo {
  name: string;
  age: number;
  find(id: string): Promise<User> { return null as never; }
  save(): void {}
}
export class Audit { who: string; }
`;
const CODE_V2 = `
export interface Repo { find(id: string): Promise<User>; list(): User[]; }
export abstract class Base { protected id: string; abstract save(): void; }
export class User extends Base implements Repo {
  name: string;
  age: string;
  email: string;
  find(id: string): Promise<User> { return null as never; }
  save(): void {}
  list(): User[] { return []; }
}
export class Session { token: string; user: User; }
`;
const parse = async (code: string) => (await importUmlText(code, 'typescript')).model;

beforeEach(() => {
  s().reset();
  useDriftStore.getState().clear();
});

async function seed() {
  applyUmlModel(await parse(CODE_V1), 'page');
  // the user arranged the diagram
  s().nodes.forEach((n, i) => s().setNodePosition(n.id, { x: 100 + i * 333, y: 50 + i * 77 }));
}

describe('computeDrift', () => {
  it('no drift against the same code', async () => {
    await seed();
    const d = computeDrift(s().nodes, s().edges, await parse(CODE_V1));
    expect(d.isEmpty).toBe(true);
  });
  it('finds added / removed / changed members and classes and relations', async () => {
    await seed();
    const d = computeDrift(s().nodes, s().edges, await parse(CODE_V2), { removed: true });
    const cls = (n: string) => d.classes.find((c) => c.name === n)!;
    expect(cls('Session').status).toBe('added');
    expect(cls('Audit').status).toBe('removed');
    const user = cls('User');
    expect(user.status).toBe('changed');
    expect(user.members.map((m) => [m.name, m.status])).toEqual(expect.arrayContaining([['email', 'added'], ['age', 'changed'], ['list', 'added']]));
    expect(user.members.find((m) => m.name === 'age')!.fields).toEqual(['type']);
    expect(user.members.find((m) => m.name === 'age')!.before).toMatchObject({ type: 'number' });
    expect(cls('Repo').members.map((m) => [m.name, m.status])).toEqual([['list', 'added']]);
    expect(cls('Base').status).toBe('same');
    // new association Session -> User
    expect(d.relations.some((r) => r.status === 'added' && r.rel.from === 'Session' && r.rel.to === 'User')).toBe(true);
  });
  it('classes missing from the code are only reported when asked (a partial re-import must not flag the rest)', async () => {
    await seed();
    const d = computeDrift(s().nodes, s().edges, await parse(CODE_V2));
    expect(d.classes.some((c) => c.status === 'removed')).toBe(false);
  });
  it('removed members of a class that is in the code', async () => {
    await seed();
    const code = (await parse(CODE_V1));
    code.classes.find((c) => c.name === 'User')!.attributes = code.classes.find((c) => c.name === 'User')!.attributes.filter((a) => a.name !== 'age');
    const d = computeDrift(s().nodes, s().edges, code);
    expect(d.classes.find((c) => c.name === 'User')!.members).toMatchObject([{ name: 'age', status: 'removed' }]);
  });
  it('operations are matched by name and parameter count (overloads)', async () => {
    await seed();
    const code = await parse(CODE_V1);
    code.classes.find((c) => c.name === 'User')!.operations.push({ visibility: '+', name: 'find', params: [{ name: 'a' }, { name: 'b' }] });
    const m = computeDrift(s().nodes, s().edges, code).classes.find((c) => c.name === 'User')!.members;
    expect(m).toMatchObject([{ name: 'find', status: 'added' }]);
  });
});

describe('accept / reject', () => {
  it('accepting applies the code version; positions of existing classes never move', async () => {
    await seed();
    const before = new Map(s().nodes.map((n) => [n.id, { ...n.position }]));
    const drift = computeDrift(s().nodes, s().edges, await parse(CODE_V2), { removed: true });
    for (const c of drift.classes) for (const m of c.members) acceptChange({ class: c, member: m });
    const user = s().nodes.find((n) => n.data.label === 'User')!;
    const d = user.data as unknown as { attributes: { name: string; type?: string; id: string }[]; operations: { name: string }[] };
    expect(d.attributes.map((a) => [a.name, a.type])).toEqual([['name', 'string'], ['age', 'string'], ['email', 'string']]);
    expect(d.operations.map((o) => o.name)).toContain('list');
    expect(new Set(d.attributes.map((a) => a.id)).size).toBe(d.attributes.length);
    for (const [id, pos] of before) expect(s().nodes.find((n) => n.id === id)!.position).toEqual(pos);
    // one undo step per accepted change
    const n = s().past.length;
    s().undo();
    expect(s().past.length).toBe(n - 1);
  });
  it('accepting a new class adds it, accepting a removed class deletes it, relations follow', async () => {
    await seed();
    const drift = computeDrift(s().nodes, s().edges, await parse(CODE_V2), { removed: true });
    for (const c of drift.classes.filter((x) => x.status === 'added' || x.status === 'removed')) acceptChange({ class: c });
    expect(s().nodes.map((n) => n.data.label).sort()).toEqual(['Base', 'Repo', 'Session', 'User']);
    const next = computeDrift(s().nodes, s().edges, await parse(CODE_V2));
    const rel = next.relations.find((r) => r.status === 'added' && r.rel.from === 'Session');
    expect(rel).toBeTruthy();
    acceptChange({ relation: rel! });
    expect(computeDrift(s().nodes, s().edges, await parse(CODE_V2)).relations.filter((r) => r.rel.from === 'Session')).toEqual([]);
    expect(diagramToModel(s().nodes, s().edges).relations.some((r) => r.from === 'Session' && r.to === 'User')).toBe(true);
  });
  it('after accepting everything the diagram matches the code (no drift left)', async () => {
    await seed();
    const code = await parse(CODE_V2);
    for (let i = 0; i < 4; i++) {
      const d = computeDrift(s().nodes, s().edges, code, { removed: true });
      if (d.isEmpty) break;
      for (const c of d.classes) {
        if (c.status === 'added' || c.status === 'removed') acceptChange({ class: c });
        else for (const m of c.members) acceptChange({ class: c, member: m });
      }
      for (const r of d.relations) acceptChange({ relation: r });
    }
    expect(computeDrift(s().nodes, s().edges, code, { removed: true }).isEmpty).toBe(true);
  });
  it('the drift store: markers by node, reject hides an item until the next comparison, accept refreshes', async () => {
    await seed();
    const code = await parse(CODE_V2);
    useDriftStore.getState().start(code, 'user.ts', { removed: false });
    const st = () => useDriftStore.getState();
    const userNode = s().nodes.find((n) => n.data.label === 'User')!;
    const marks = st().marksFor(userNode.id);
    expect(marks.members.get('a:email')).toBe('added');
    expect(marks.members.get('a:age')).toBe('changed');
    const email = st().visible()!.classes.find((c) => c.name === 'User')!.members.find((m) => m.name === 'email')!;
    st().reject(driftKey({ class: st().visible()!.classes.find((c) => c.name === 'User')!, member: email }));
    expect(st().marksFor(userNode.id).members.has('a:email')).toBe(false);
    st().accept({ class: st().visible()!.classes.find((c) => c.name === 'User')!, member: st().visible()!.classes.find((c) => c.name === 'User')!.members.find((m) => m.name === 'age')! });
    expect(st().marksFor(userNode.id).members.has('a:age')).toBe(false);
    expect((userNode.data as never) && (s().nodes.find((n) => n.id === userNode.id)!.data as unknown as { attributes: { name: string; type?: string }[] }).attributes.find((a) => a.name === 'age')!.type).toBe('string');
    st().clear();
    expect(st().drift).toBeNull();
  });
});
