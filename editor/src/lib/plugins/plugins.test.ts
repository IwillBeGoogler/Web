import { describe, expect, it, vi } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { parseManifest, PERMISSIONS } from './manifest';
import { PluginHost, type PluginDoc } from './host';
import { buildSandboxDoc, SANDBOX_ATTR, PLUGIN_CSP } from './sandbox';
import { SAMPLE_PLUGINS } from './samples';

const n = (id: string, label: string, selected = false, extra: Record<string, unknown> = {}): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, width: 100, height: 80, selected, data: { label, ...extra } }) as DiagramNode;

function rig(perms: string[], nodes: DiagramNode[] = [n('a', 'A', true), n('b', 'B')]) {
  const state = { nodes, edges: [] as DiagramEdge[] };
  let steps = 0;
  const doc: PluginDoc = {
    nodes: () => state.nodes,
    edges: () => state.edges,
    transform: (fn) => { const r = fn(state.nodes, state.edges); if (!r) return false; state.nodes = r.nodes; state.edges = r.edges; steps++; return true; },
  };
  const notify = vi.fn();
  const panel = vi.fn();
  const host = new PluginHost({ id: 'p1', name: 'P', version: '1', permissions: perms as never, code: '' }, { doc, notify, panel });
  const call = (method: string, params?: unknown, id: unknown = 1) => host.handle({ sdd: 1, id, method, params });
  return { state, host, call, notify, panel, steps: () => steps };
}

describe('manifest', () => {
  it('accepts a valid manifest with inline code or an entry URL', () => {
    expect(parseManifest({ name: 'X', permissions: ['nodes:read'], code: 'sdd.notify("hi")' }).ok).toBe(true);
    expect(parseManifest({ name: 'X', permissions: [], entry: 'https://example.com/p.js' }).ok).toBe(true);
  });
  it('rejects: no name, unknown permission, both/neither of code and entry, non-https entry, oversize code', () => {
    for (const bad of [
      { permissions: [], code: 'x' }, { name: 'X', permissions: ['root'], code: 'x' }, { name: 'X', permissions: [], code: 'x', entry: 'https://a.b/c.js' }, { name: 'X', permissions: [] },
      { name: 'X', permissions: [], entry: 'javascript:alert(1)' }, { name: 'X', permissions: [], entry: 'http://insecure.example/p.js' }, { name: 'X', permissions: [], code: 'x'.repeat(300_000) },
    ]) expect(parseManifest(bad).ok, JSON.stringify(bad).slice(0, 80)).toBe(false);
  });
  it('lists the permission vocabulary', () => {
    expect(PERMISSIONS).toEqual(['selection:read', 'nodes:read', 'nodes:write', 'ui:panel', 'notify']);
  });
});

describe('sandbox document', () => {
  it('iframe sandbox allows scripts only (never same-origin, forms, popups, top navigation)', () => {
    expect(SANDBOX_ATTR).toBe('allow-scripts');
    expect(SANDBOX_ATTR).not.toMatch(/same-origin|forms|popups|top-navigation|modals/);
  });
  it('carries a strict CSP: nothing may be loaded or sent', () => {
    const doc = buildSandboxDoc('console.log(1)');
    expect(doc).toContain('Content-Security-Policy');
    expect(PLUGIN_CSP).toMatch(/default-src 'none'/);
    expect(PLUGIN_CSP).not.toMatch(/connect-src (?!'none')/);
    expect(PLUGIN_CSP).toMatch(/script-src 'unsafe-inline'/);
    expect(PLUGIN_CSP).not.toMatch(/https?:|\*|unsafe-eval/);
  });
  it('the plugin code is embedded safely (a closing script tag in the code cannot break out)', () => {
    const doc = buildSandboxDoc('var s = "</script><img src=x onerror=alert(1)>";');
    expect(doc.match(/<\/script>/g)!.length).toBe(2); // the bootstrap and the plugin, nothing more
    expect(doc).not.toContain('</script><img');
  });
  it('exposes no cookie / storage access helpers in the bootstrap', () => {
    const doc = buildSandboxDoc('');
    expect(doc).not.toMatch(/document\.cookie|localStorage|sessionStorage/);
  });
});

describe('protocol validation', () => {
  it('rejects non-objects, wrong version, missing id, bad method and extra-long method names', async () => {
    const { host } = rig(['nodes:read']);
    for (const bad of [null, 'x', 5, [], {}, { sdd: 2, id: 1, method: 'getNodes' }, { sdd: 1, method: 'getNodes' }, { sdd: 1, id: {}, method: 'getNodes' }, { sdd: 1, id: 1, method: 5 }, { sdd: 1, id: 1, method: 'x'.repeat(100) }]) {
      const r = await host.handle(bad);
      expect(r === null || r.ok === false).toBe(true);
    }
  });
  it('unknown methods are errors, not crashes', async () => {
    const r = await rig(['nodes:read']).call('eval', { code: '1' });
    expect(r).toMatchObject({ ok: false, error: { code: 'unknown_method' } });
  });
  it('malicious params are rejected: prototype pollution keys, wrong types, huge arrays and strings', async () => {
    const { call, state } = rig(['nodes:write']);
    expect(await call('createNodes', { nodes: [{ type: 'icon', x: 0, y: 0, data: { label: 'x', __proto__: { polluted: true } } }] })).toMatchObject({ ok: true });
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(await call('createNodes', { nodes: 'no' })).toMatchObject({ ok: false, error: { code: 'invalid_params' } });
    expect(await call('createNodes', { nodes: [{ type: 'icon', x: 'a', y: 0 }] })).toMatchObject({ ok: false });
    expect(await call('createNodes', { nodes: Array.from({ length: 501 }, () => ({ type: 'icon', x: 0, y: 0 })) })).toMatchObject({ ok: false });
    expect(await call('createNodes', { nodes: [{ type: 'icon', x: 0, y: 0, data: { label: 'x'.repeat(5000) } }] })).toMatchObject({ ok: false });
    expect(await call('createNodes', { nodes: [{ type: 'sequence', x: 0, y: 0 }] })).toMatchObject({ ok: false }); // only simple kinds
    expect(state.nodes.length).toBe(3);
  });
  it('plugins cannot set fields they have no business with (parentId, locked, link, instance, ids)', async () => {
    const { call, state } = rig(['nodes:write']);
    await call('updateNodes', { updates: [{ id: 'a', data: { label: 'ok', locked: true, instance: { componentId: 'x', rev: 1, overrides: {} }, link: { fileId: 'z' } }, parentId: 'b' }] });
    const a = state.nodes.find((x) => x.id === 'a')!;
    expect(a.data.label).toBe('ok');
    expect(a.data.locked).toBeUndefined();
    expect(a.data.instance).toBeUndefined();
    expect(a.data.link).toBeUndefined();
    expect(a.parentId).toBeUndefined();
  });
});

describe('permissions', () => {
  it('every method needs its permission', async () => {
    const none = rig([]);
    for (const [m, p] of [['getSelection', undefined], ['getNodes', undefined], ['createNodes', { nodes: [] }], ['updateNodes', { updates: [] }], ['showPanel', {}], ['notify', { message: 'x' }]] as const)
      expect(await none.call(m, p), m).toMatchObject({ ok: false, error: { code: 'permission_denied' } });
  });
  it('selection:read gives selected nodes only; nodes:read gives all, without transient state', async () => {
    const r = rig(['selection:read', 'nodes:read']);
    const sel = await r.call('getSelection');
    expect(sel).toMatchObject({ ok: true });
    expect((sel as { result: { id: string }[] }).result.map((x) => x.id)).toEqual(['a']);
    const all = (await r.call('getNodes')) as { result: Record<string, unknown>[] };
    expect(all.result.map((x) => x.id)).toEqual(['a', 'b']);
    expect(all.result[0].selected).toBeUndefined();
  });
  it('a plugin holding only selection:read cannot read the whole document', async () => {
    expect(await rig(['selection:read']).call('getNodes')).toMatchObject({ ok: false, error: { code: 'permission_denied' } });
  });
  it('hidden nodes are not reported', async () => {
    const r = rig(['nodes:read'], [n('a', 'A'), n('h', 'H', false, { hidden: true })]);
    expect(((await r.call('getNodes')) as { result: { id: string }[] }).result.map((x) => x.id)).toEqual(['a']);
  });
});

describe('writes are validated and undoable', () => {
  it('createNodes adds nodes in ONE undo step and returns their ids', async () => {
    const r = rig(['nodes:write']);
    const res = (await r.call('createNodes', { nodes: [{ type: 'card', x: 10, y: 20, data: { label: 'One' } }, { type: 'text', x: 30, y: 40, data: { label: 'Two' } }] })) as { ok: true; result: string[] };
    expect(res.result).toHaveLength(2);
    expect(r.steps()).toBe(1);
    expect(r.state.nodes.map((x) => x.data.label)).toEqual(['A', 'B', 'One', 'Two']);
    expect(r.state.nodes[2].position).toEqual({ x: 10, y: 20 });
  });
  it('updateNodes patches known fields of existing nodes, in one step; unknown ids are ignored', async () => {
    const r = rig(['nodes:write']);
    await r.call('updateNodes', { updates: [{ id: 'a', data: { label: 'Renamed', fill: '#ff0000' }, x: 5, y: 6 }, { id: 'zzz', data: { label: 'x' } }] });
    expect(r.steps()).toBe(1);
    expect(r.state.nodes[0].data).toMatchObject({ label: 'Renamed', fill: '#ff0000' });
    expect(r.state.nodes[0].position).toEqual({ x: 5, y: 6 });
  });
  it('colours must look like colours', async () => {
    expect(await rig(['nodes:write']).call('updateNodes', { updates: [{ id: 'a', data: { fill: 'url(javascript:1)' } }] })).toMatchObject({ ok: false });
  });
  it('notify and showPanel go to the host callbacks, with limits', async () => {
    const r = rig(['notify', 'ui:panel']);
    await r.call('notify', { message: 'Done', kind: 'success' });
    expect(r.notify).toHaveBeenCalledWith('Done', 'success');
    expect(await r.call('notify', { message: 'x'.repeat(1000) })).toMatchObject({ ok: false });
    await r.call('showPanel', { title: 'Grid', height: 240 });
    expect(r.panel).toHaveBeenCalledWith({ title: 'Grid', height: 240 });
    expect(await r.call('showPanel', { height: 99999 })).toMatchObject({ ok: false });
  });
  it('a flood of calls is rate limited', async () => {
    const r = rig(['notify']);
    let denied = 0;
    for (let i = 0; i < 400; i++) {
      const res = await r.call('notify', { message: 'x' }, i);
      if (res && !res.ok && res.error.code === 'rate_limited') denied++;
    }
    expect(denied).toBeGreaterThan(0);
  });
  it('replies echo the request id', async () => {
    expect(await rig(['nodes:read']).call('getNodes', undefined, 'req-7')).toMatchObject({ sdd: 1, id: 'req-7', ok: true });
  });
});

describe('sample plugins', () => {
  it('ship three samples with valid manifests', () => {
    expect(SAMPLE_PLUGINS.map((p) => p.name)).toEqual(['Rename selection', 'Generate grid of icons', 'Export as Markdown table']);
    for (const p of SAMPLE_PLUGINS) expect(parseManifest(p).ok, p.name).toBe(true);
  });
  const run = async (name: string, perms: string[], nodes: DiagramNode[], args?: unknown) => {
    const r = rig(perms, nodes);
    const sample = SAMPLE_PLUGINS.find((p) => p.name === name)!;
    const sdd = new Proxy({}, { get: (_t, method: string) => (params?: unknown) => r.call(method, params).then((res) => { if (res && !res.ok) throw new Error(res.error.message); return (res as { result?: unknown }).result; }) });
    const mainFn = new Function('sdd', 'args', `${sample.code}\nreturn typeof run === 'function' ? run(args) : undefined;`);
    const out = await mainFn(sdd, args);
    return { r, out };
  };
  it('Rename selection numbers the selected nodes', async () => {
    const { r } = await run('Rename selection', ['selection:read', 'nodes:write', 'notify'], [n('a', 'x', true), n('b', 'y', true), n('c', 'z')], { prefix: 'Svc' });
    expect(r.state.nodes.map((x) => x.data.label)).toEqual(['Svc 1', 'Svc 2', 'z']);
    expect(r.steps()).toBe(1);
  });
  it('Generate grid of icons creates rows x cols nodes', async () => {
    const { r } = await run('Generate grid of icons', ['nodes:write', 'notify'], [], { rows: 2, cols: 3 });
    expect(r.state.nodes).toHaveLength(6);
    expect(new Set(r.state.nodes.map((x) => `${x.position.x},${x.position.y}`)).size).toBe(6);
  });
  it('Export as Markdown table returns a table of the nodes', async () => {
    const { out } = await run('Export as Markdown table', ['nodes:read', 'notify'], [n('a', 'API', false, { subtitle: 'Go' }), n('b', 'DB')]);
    expect(out).toContain('| Name |');
    expect(out).toContain('| API |');
    expect(out).toContain('Go');
  });
});
