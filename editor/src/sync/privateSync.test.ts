import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrivatePayload } from '@core/privateStickies';
import { sharedPart, startPrivateSync, withMyPrivate, withoutPrivate, type PrivateSyncDeps } from './privateSync';

type N = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
const note = (id: string, priv = true): N => ({ id, type: 'sticky', position: { x: 0, y: 0 }, data: { label: `t ${id}`, ...(priv ? { private: true, authorId: 'me' } : {}) } });
const icon = (id: string): N => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id } });

function setup(over: Partial<PrivateSyncDeps> = {}, init: { nodes?: N[]; edges?: any[]; server?: PrivatePayload } = {}) {
  const state = { nodes: (init.nodes ?? []) as N[], edges: (init.edges ?? []) as any[] };
  const subs = new Set<() => void>();
  const mem = new Map<string, string>();
  let server: PrivatePayload = init.server ?? { nodes: [], edges: [] };
  const api = {
    getPrivate: vi.fn(async () => ({ ...server, updatedAt: 1 })),
    putPrivate: vi.fn(async (_id: string, p: PrivatePayload) => { server = p; return { ...p, updatedAt: 2 }; }),
  };
  const deps: PrivateSyncDeps = {
    fileId: 'f1',
    api,
    storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) },
    store: {
      get: () => state as never,
      set: (p) => { Object.assign(state, p); subs.forEach((f) => f()); },
      subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
    },
    delayMs: 100,
    ...over,
  };
  const stop = startPrivateSync(deps);
  const edit = (p: Partial<typeof state>) => { Object.assign(state, p); subs.forEach((f) => f()); };
  return { state, api, mem, stop, edit, setServer: (p: PrivatePayload) => { server = p; }, getServer: () => server };
}
const flushP = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('private sticky sync', () => {
  it('loads my stickies from the server into the store next to the shared nodes', async () => {
    const t = setup({}, { nodes: [icon('a')], server: { nodes: [note('p1') as never], edges: [] } });
    await flushP(10);
    expect(t.state.nodes.map((n) => n.id)).toEqual(['a', 'p1']);
    t.stop();
  });
  it('uploads changes of the private set (debounced) and never the shared ones', async () => {
    const t = setup({}, { nodes: [icon('a')] });
    await flushP(10);
    t.edit({ nodes: [...t.state.nodes, note('p1')] });
    t.edit({ nodes: [...t.state.nodes, note('p2')] });
    await flushP(50);
    expect(t.api.putPrivate).not.toHaveBeenCalled();
    await flushP(100);
    expect(t.api.putPrivate).toHaveBeenCalledTimes(1);
    expect(t.api.putPrivate.mock.calls[0][1].nodes.map((n: any) => n.id)).toEqual(['p1', 'p2']);
    t.edit({ nodes: [...t.state.nodes, icon('b')] }); // shared change only
    await flushP(300);
    expect(t.api.putPrivate).toHaveBeenCalledTimes(1);
    t.stop();
  });
  it('a note that is revealed leaves the private set', async () => {
    const t = setup({}, { nodes: [icon('a'), note('p1')], server: { nodes: [note('p1') as never], edges: [] } });
    await flushP(10);
    t.edit({ nodes: t.state.nodes.map((n) => (n.id === 'p1' ? note('p1', false) : n)) });
    await flushP(200);
    expect(t.getServer().nodes).toEqual([]);
    t.stop();
  });
  it('offline: the change stays marked as pending locally and is uploaded on the next start', async () => {
    const t = setup({}, { nodes: [icon('a')] });
    await flushP(10);
    t.api.putPrivate.mockRejectedValue(new Error('offline'));
    t.edit({ nodes: [...t.state.nodes, note('p1')] });
    await flushP(200);
    expect(t.mem.get('sdd:priv:pending:f1')).toBe('1');
    t.stop();
    // reopen with the local copy (what the browser kept) and a reachable server that has never seen it
    const again = setup({ storage: { getItem: (k) => t.mem.get(k) ?? null, setItem: (k, v) => void t.mem.set(k, v), removeItem: (k) => void t.mem.delete(k) } }, { nodes: [icon('a'), note('p1')] });
    await flushP(300);
    expect(again.getServer().nodes.map((n) => n.id)).toEqual(['p1']);
    expect(again.state.nodes.map((n) => n.id)).toEqual(['a', 'p1']);
    expect(t.mem.get('sdd:priv:pending:f1')).toBeUndefined();
    again.stop();
  });
  it('no pending change: the server copy wins over a stale local one', async () => {
    const t = setup({}, { nodes: [icon('a'), note('stale')], server: { nodes: [note('fresh') as never], edges: [] } });
    await flushP(10);
    expect(t.state.nodes.map((n) => n.id)).toEqual(['a', 'fresh']);
    t.stop();
  });
  it('a server that cannot be reached leaves the local stickies alone', async () => {
    const t = setup({ api: { getPrivate: vi.fn().mockRejectedValue(new Error('down')), putPrivate: vi.fn() } }, { nodes: [icon('a'), note('p1')] });
    await flushP(10);
    expect(t.state.nodes.map((n) => n.id)).toEqual(['a', 'p1']);
    t.stop();
  });
});

describe('whole documents', () => {
  const doc = () => ({ activePageId: 'p1', pages: [{ id: 'p1', nodes: [icon('a'), note('s')], edges: [{ id: 'e', source: 'a', target: 's' }] }, { id: 'p2', nodes: [note('t')], edges: [] }] });
  it('withoutPrivate strips every page; withMyPrivate puts mine back on the active page', () => {
    const clean = withoutPrivate(doc());
    expect(JSON.stringify(clean)).not.toContain('"private"');
    expect(clean.pages[0].edges).toEqual([]);
    const back = withMyPrivate(clean, { nodes: [note('s') as never], edges: [{ id: 'e', source: 'a', target: 's' } as never] });
    expect(back.pages[0].nodes.map((n: any) => n.id)).toEqual(['a', 's']);
    expect(back.pages[0].edges.map((e: any) => e.id)).toEqual(['e']);
    expect(back.pages[1].nodes).toEqual([]);
  });
  it('returns the same object when there is nothing to do', () => {
    const d = { activePageId: 'p1', pages: [{ id: 'p1', nodes: [icon('a')], edges: [] }] };
    expect(withoutPrivate(d)).toBe(d);
    expect(withMyPrivate(d, { nodes: [], edges: [] })).toBe(d);
  });
});

describe('sharedPart', () => {
  it('a change of a private note only is "no change" for the shared document', () => {
    const base = { nodes: [icon('a'), note('p')] as unknown[], edges: [] as unknown[] };
    const priv = { nodes: [base.nodes[0], { ...note('p'), data: { label: 'edited', private: true } }] as unknown[], edges: base.edges };
    const out = sharedPart(priv, base);
    expect(out.nodes).toBe(base.nodes);
    const shared = { nodes: [{ ...icon('a'), position: { x: 5, y: 5 } }, base.nodes[1]] as unknown[], edges: base.edges };
    expect(sharedPart(shared, base)).toBe(shared);
  });
});
