import { describe, expect, it } from 'vitest';
import { applyDsl, parseDsl, printPage } from '@core/dsl';
import { completeAt } from './language';

const roundTrip = (body: string) => {
  const text = `#!sdd 1\ndiagram "T"\n${body}`;
  const r = applyDsl(undefined, text, { layout: false });
  expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const printed = printPage(r.page, 'T');
  const again = applyDsl(structuredClone(r.page), printed, { layout: false });
  expect(again.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  expect(again.page).toEqual(r.page);
  expect(printPage(again.page, 'T')).toBe(printed);
  return { page: r.page, printed };
};

const ACTIVITY = `
activity {
  initial start
  lane cust "Customer" {
    action order "Place order"
    object o "Order" state=placed
  }
  lane shop "Shop" orient=h {
    action check
    decision d
    fork f vertical
    send s "Notify"
    accept a "Reply"
  }
  note n "retry twice"
  final end
  flowFinal ff
  start -> order
  order -> check
  check -> d
  d -> end "[in stock]"
  d -> ff "[out of stock]"
  n -- check
}
`;
const DEPLOYMENT = `
deployment {
  device phone "Phone" stereotype=mobile {
    artifact app "app.apk"
  }
  node server "Server" icon=postgresql {
    executionEnvironment tomcat "Tomcat" {
      artifact war "shop.war"
      component shop "Shop"
    }
  }
  phone -- server "HTTPS"
  war ..> server
  war manifests shop
  app ..> phone "custom label"
}
`;

describe('.sdd activity block', () => {
  it('round trips nodes, lanes, guards and note links', () => {
    const { page, printed } = roundTrip(ACTIVITY);
    expect(page.nodes.find((n) => n.id === 'cust')).toMatchObject({ type: 'group', data: { variant: 'lane', laneOrient: 'v' } });
    expect(page.nodes.find((n) => n.id === 'shop')!.data.laneOrient).toBe('h');
    expect(page.nodes.find((n) => n.id === 'order')).toMatchObject({ type: 'activity', parentId: 'cust', data: { actKind: 'action', label: 'Place order' } });
    expect(page.nodes.find((n) => n.id === 'o')!.data).toMatchObject({ actKind: 'object', objectState: 'placed' });
    expect(page.nodes.find((n) => n.id === 'check')!.data.label).toBe('check');
    expect(page.nodes.find((n) => n.id === 'start')!.data.label).toBe('');
    expect(page.nodes.find((n) => n.id === 'f')!.data).toMatchObject({ actKind: 'fork', vertical: true });
    expect(page.nodes.find((n) => n.id === 'f')).toMatchObject({ width: 8, height: 120 });
    const guard = page.edges.find((e) => e.target === 'end')!;
    expect(guard.label).toBe('[in stock]');
    expect(guard.data!.uml.kind).toBe('transition');
    expect(page.edges.find((e) => e.source === 'n')!.data).toMatchObject({ uml: { kind: 'note' }, dashed: true });
    expect(printed).toContain('d -> end "[in stock]"');
    expect(printed).toContain('n -- check');
    expect(printed).toContain('lane shop "Shop" orient=h {');
  });
  it('keeps positions of existing elements and drops the removed ones', () => {
    const first = applyDsl(undefined, `activity {\n initial i\n action a "A"\n action b "B"\n i -> a\n a -> b\n}\n`, { layout: false }).page;
    first.nodes.find((n) => n.id === 'a')!.position = { x: 321, y: 123 };
    const r = applyDsl(first, `activity {\n initial i\n action a "A2"\n i -> a\n}\n`, { layout: false });
    expect(r.page.nodes.find((n) => n.id === 'a')).toMatchObject({ position: { x: 321, y: 123 }, data: { label: 'A2' } });
    expect(r.page.nodes.some((n) => n.id === 'b')).toBe(false);
    expect(r.page.edges).toHaveLength(1);
  });
  it('moves an element into a lane', () => {
    const p = applyDsl(undefined, `activity {\n action a "A"\n lane l "L" {\n }\n}\n`, { layout: false }).page;
    const r = applyDsl(p, `activity {\n lane l "L" {\n  action a "A"\n }\n}\n`, { layout: false });
    expect(r.page.nodes.find((n) => n.id === 'a')!.parentId).toBe('l');
  });
  it('lays out a fresh diagram', () => {
    const r = applyDsl(undefined, `activity {\n initial i\n action a\n final f\n i -> a\n a -> f\n}\n`);
    const ys = ['i', 'a', 'f'].map((id) => r.page.nodes.find((n) => n.id === id)!.position);
    for (const p of ys) expect(Number.isFinite(p.x + p.y)).toBe(true);
    expect(new Set(ys.map((p) => `${p.x},${p.y}`)).size).toBe(3);
  });
  it('reports errors with lines', () => {
    const d = (t: string) => parseDsl(t).diagnostics.map((x) => `${x.line}:${x.message}`);
    expect(d('activity {\n a -> b\n}\n')[0]).toContain('unknown activity element');
    expect(d('activity {\n bogus x\n}\n')[0]).toContain('unknown statement');
    expect(d('activity {\n action a\n action a\n}\n')[0]).toContain('duplicate id');
    expect(d('activity {\n lane l "L" {\n  lane m "M" {\n  }\n }\n}\n')[0]).toContain('lanes cannot be nested');
    expect(d('activity {\n lane l "L" {\n  action a\n')[0]).toContain('missing "}"');
  });
  it('shares ids with the other blocks and the architecture', () => {
    roundTrip(`node web "Web" icon=browser\n${ACTIVITY}states {\n  state s1 "S"\n  s1 -> s1\n}\n`);
  });
});

describe('.sdd deployment block', () => {
  it('round trips nesting, kinds, icons and paths', () => {
    const { page, printed } = roundTrip(DEPLOYMENT);
    expect(page.nodes.find((n) => n.id === 'phone')).toMatchObject({ type: 'deployment', data: { depKind: 'device', stereotype: 'mobile', container: true } });
    expect(page.nodes.find((n) => n.id === 'app')).toMatchObject({ parentId: 'phone', data: { depKind: 'artifact' } });
    expect(page.nodes.find((n) => n.id === 'tomcat')).toMatchObject({ parentId: 'server', data: { depKind: 'executionEnvironment', container: true } });
    expect(page.nodes.find((n) => n.id === 'shop')).toMatchObject({ parentId: 'tomcat', data: { depKind: 'component' } });
    expect(page.nodes.find((n) => n.id === 'server')!.data.iconId).toBe('postgresql');
    const kinds = page.edges.map((e) => `${e.data!.uml.kind}:${e.label ?? ''}`);
    expect(kinds).toEqual(['communication:HTTPS', 'deploy:«deploy»', 'manifest:«manifest»', 'deploy:custom label']);
    expect(printed).toContain('phone -- server "HTTPS"');
    expect(printed).toContain('war ..> server\n');
    expect(printed).toContain('war manifests shop');
    expect(printed).toContain('app ..> phone "custom label"');
  });
  it('keeps positions and a canvas-only edit of the label survives', () => {
    const first = applyDsl(undefined, `deployment {\n node a "A"\n node b "B"\n a -- b "TCP"\n}\n`, { layout: false }).page;
    first.nodes.find((n) => n.id === 'a')!.position = { x: 40, y: 50 };
    const r = applyDsl(first, `deployment {\n node a "A"\n artifact b "B"\n a -- b "UDP"\n}\n`, { layout: false });
    expect(r.page.nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 40, y: 50 });
    expect(r.page.nodes.find((n) => n.id === 'b')!.data.depKind).toBe('artifact');
    expect(r.page.edges).toHaveLength(1);
    expect(r.page.edges[0].label).toBe('UDP');
  });
  it('warns about unknown icons and reports errors', () => {
    const r = applyDsl(undefined, `deployment {\n node a "A" icon=nope-not-here\n}\n`, { layout: false });
    expect(r.diagnostics.some((x) => x.severity === 'warning' && x.message.includes('unknown icon'))).toBe(true);
    const d = (t: string) => parseDsl(t).diagnostics.map((x) => `${x.line}:${x.message}`);
    expect(d('deployment {\n a -- b\n}\n')[0]).toContain('unknown deployment element');
    expect(d('deployment {\n artifact a "A" {\n }\n}\n')[0]).toContain('only a node');
    expect(d('deployment {\n bogus\n}\n')[0]).toContain('unknown statement');
  });
  it('highlights and completes the new blocks', () => {
    const at = (doc: string) => completeAt(doc, doc.length)!.options.map((o) => o.label);
    expect(at('no')).toContain('activity {');
    expect(at('no')).toContain('deployment {');
    expect(at('activity {\n  fl')).toContain('flowFinal');
    expect(at('deployment {\n  dev')).toContain('device');
  });
});
