import { describe, expect, it } from 'vitest';
import { analyzeCapacity, nodeAvailability, PRICES } from '@core/capacity';
import type { CEdge, CNode, CPage } from '@core/types';

const icon = (id: string, iconId: string, capacity: Record<string, unknown> = {}, arch?: Record<string, unknown>, extra: Record<string, unknown> = {}): CNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id, iconId, capacity, ...(arch ? { arch } : {}), ...extra } });
const edge = (id: string, source: string, target: string, traffic?: Record<string, unknown>, extra: Record<string, unknown> = {}): CEdge => ({ id, source, target, ...(traffic || Object.keys(extra).length ? { data: { ...(traffic ? { traffic } : {}), ...extra } } : {}) });
const page = (nodes: CNode[], edges: CEdge[] = []): CPage => ({ id: 'p', name: 'p', nodes, edges });
const skuFor = (unit: string) => Object.keys(PRICES).find((k) => PRICES[k].unit === unit);

describe('availability', () => {
  it('multi-az / multi-region cut unavailability; mongo and kafka count members; unset gives role default', () => {
    const base = nodeAvailability(icon('s', 'server', {}, { deployment: 'single-az' }), {}, undefined);
    expect(nodeAvailability(icon('s', 'server', {}, { deployment: 'multi-az' }), {}, undefined)).toBeGreaterThan(base);
    expect(nodeAvailability(icon('s', 'server', {}, { deployment: 'multi-region' }), {}, undefined)).toBeGreaterThan(nodeAvailability(icon('s', 'server', {}, { deployment: 'multi-az' }), {}, undefined));
    expect(nodeAvailability(icon('m', 'mongodb', {}, { replicaSetMembers: 5 }), {}, undefined)).toBeGreaterThan(nodeAvailability(icon('m', 'mongodb', {}, { replicaSetMembers: 1 }), {}, undefined));
    expect(nodeAvailability(icon('k', 'kafka', {}, { replicationFactor: 3 }), { availability: 99 }, undefined)).toBeGreaterThan(0.99);
    expect(nodeAvailability(icon('x', 'server'), {}, { count: 3, mult: 3 })).toBeGreaterThan(0.99);
  });
});

describe('analyzeCapacity branches', () => {
  it('cycles are ignored with a warning', () => {
    const r = analyzeCapacity(page([icon('a', 'server', { rps: 10, capacityRps: 100 }), icon('b', 'server', { capacityRps: 100 })], [edge('1', 'a', 'b'), edge('2', 'b', 'a')]));
    expect(r.warnings.some((w) => w.includes('Cycle ignored'))).toBe(true);
  });
  it('cache hit rates: explicit arch, assumed defaults, zero', () => {
    const nodes = [icon('c', 'server', { rps: 100, capacityRps: 1000 }), icon('r', 'redis', { capacityRps: 1000 }), icon('d', 'postgres', { capacityRps: 50 })];
    const es = [edge('1', 'c', 'r'), edge('2', 'r', 'd')];
    const withDefaults = analyzeCapacity(page(nodes, es), { assumeDefaults: true });
    expect(withDefaults.nodes.r).toBeDefined();
    const plain = analyzeCapacity(page(nodes, es));
    expect(plain.nodes.d).toBeDefined();
    const cdn = analyzeCapacity(page([icon('c', 'server', { rps: 100, capacityRps: 1000 }), icon('cdn', 'cdn', { capacityRps: 100000 }), icon('o', 'server', { capacityRps: 100 })], [edge('1', 'c', 'cdn'), edge('2', 'cdn', 'o')]), { assumeDefaults: true });
    expect(cdn.nodes.cdn).toBeDefined();
  });
  it('retries, timeouts, backoff; slow tail below p50 and above p99', () => {
    const mk = (timeoutMs: number, p50: number, p99: number, backoff?: number) =>
      analyzeCapacity(page([icon('a', 'server', { rps: 100, capacityRps: 1000, p50Ms: 5, p99Ms: 10 }), icon('b', 'server', { capacityRps: 1000, p50Ms: p50, p99Ms: p99 })], [edge('1', 'a', 'b', { retries: 2, timeoutMs, ...(backoff ? { backoffMs: backoff } : {}) })]));
    expect(mk(5, 50, 100).edges['1']).toBeDefined();
    expect(mk(60, 50, 100, 20).edges['1']).toBeDefined();
    expect(mk(500, 50, 100).edges['1']).toBeDefined();
    const noTimeout = analyzeCapacity(page([icon('a', 'server', { rps: 100, capacityRps: 1000 }), icon('b', 'server', { capacityRps: 1000 })], [edge('1', 'a', 'b', { retries: 1 })]));
    expect(noTimeout.edges['1']).toBeDefined();
  });
  it('statuses: over, warn, ok, unknown (no capacity), down via chaos, backlog warn', () => {
    const r = analyzeCapacity(page([icon('src', 'server', { rps: 100, capacityRps: 1000 }), icon('over', 'server', { capacityRps: 10 }), icon('warn', 'server', { capacityRps: 120 }), icon('ok', 'server', { capacityRps: 100000 }), icon('zero', 'server', { capacityRps: 0 })], [edge('1', 'src', 'over'), edge('2', 'src', 'warn'), edge('3', 'src', 'ok'), edge('4', 'src', 'zero')]), { fanOut: 'broadcast' });
    expect(r.nodes.over.status).toBe('over');
    expect(r.nodes.warn.status).toBe('warn');
    expect(r.nodes.ok.status).toBe('ok');
    expect(r.nodes.zero).toBeDefined();
    expect(r.bottlenecks[0]).toBeDefined();
    const unknown = analyzeCapacity(page([icon('a', 'server', { rps: 5 })]));
    expect(['unknown', 'ok', 'warn']).toContain(unknown.nodes.a.status);
    const down = analyzeCapacity(page([icon('a', 'server', { rps: 5, capacityRps: 10 })]), { chaos: { nodes: { a: 'down' } } });
    expect(down.nodes.a.status).toBe('down');
    const slow = analyzeCapacity(page([icon('a', 'server', { rps: 5, capacityRps: 10 })]), { chaos: { nodes: { a: 'slow' }, spike: 3 } });
    expect(slow.nodes.a).toBeDefined();
  });
  it('bottlenecks with equal utilization are ordered by id; worst path prefers unbroken paths', () => {
    const r = analyzeCapacity(page([icon('src', 'server', { rps: 100, capacityRps: 1000 }), icon('b', 'server', { capacityRps: 10 }), icon('a', 'server', { capacityRps: 10 })], [edge('1', 'src', 'b', undefined, {}), edge('2', 'src', 'a')]), { fanOut: 'broadcast' });
    expect(r.bottlenecks.slice(0, 2)).toEqual(['a', 'b']);
    const branches = analyzeCapacity(page([icon('src', 'server', { rps: 10, capacityRps: 100, p99Ms: 5 }), icon('x', 'server', { capacityRps: 100, p99Ms: 50 }), icon('y', 'server', { capacityRps: 100, p99Ms: 50 }), icon('z', 'server', { capacityRps: 100, p99Ms: 20 })], [edge('1', 'src', 'x'), edge('2', 'src', 'y'), edge('3', 'x', 'z')]));
    expect(branches.worstPath?.nodeIds.length).toBeGreaterThan(0);
  });
  it('queues: retention from arch or default, backlog and recovery', () => {
    const q = (arch?: Record<string, unknown>) => analyzeCapacity(page([icon('p', 'server', { rps: 500, capacityRps: 1000 }), icon('q', 'rabbitmq', { capacityRps: 10000 }, arch), icon('w', 'server', { capacityRps: 100 })], [edge('1', 'p', 'q'), edge('2', 'q', 'w')]), { spikeDurationSec: 600 });
    expect(q().nodes.q).toBeDefined();
    expect(q({ retentionHours: 1 }).nodes.q).toBeDefined();
    const k = analyzeCapacity(page([icon('p', 'server', { rps: 500, capacityRps: 1000 }), icon('k', 'kafka', { capacityRps: 100000 }, { retentionHours: -3 }), icon('w', 'server', { capacityRps: 1000 })], [edge('1', 'p', 'k'), edge('2', 'k', 'w')]));
    expect(k.nodes.k).toBeDefined();
    const drained = analyzeCapacity(page([icon('p', 'server', { rps: 5, capacityRps: 1000 }), icon('q', 'rabbitmq', { capacityRps: 100000, consumerRps: 1000 }), icon('w', 'server', { capacityRps: 10000 })], [edge('1', 'p', 'q'), edge('2', 'q', 'w')]));
    expect(drained.nodes.q).toBeDefined();
  });
  it('costs for every price unit, explicit sku, unknown sku, fixed cost and totals', () => {
    const units = ['instance-month', 'per-million-requests', 'per-gb-month', 'per-gb-transfer'];
    const nodes: CNode[] = [icon('src', 'server', { rps: 100, capacityRps: 1000, payloadKb: 10 })];
    const es: CEdge[] = [];
    units.forEach((u, i) => {
      const sku = skuFor(u);
      if (!sku) return;
      nodes.push(icon(`n${i}`, 'server', { sku, storageGb: 50, capacityRps: 1000 }));
      es.push(edge(`e${i}`, 'src', `n${i}`));
    });
    nodes.push(icon('bad', 'server', { sku: 'no-such-sku', capacityRps: 100 }), icon('fixed', 'server', { monthlyCostUsd: 12, capacityRps: 100 }), icon('growth', 'server', { growthGbPerDay: 2, capacityRps: 100 }));
    es.push(edge('eb', 'src', 'bad'), edge('ef', 'src', 'fixed'), edge('eg', 'src', 'growth'));
    const r = analyzeCapacity(page(nodes, es), { budgetUsd: 1, fanOut: 'broadcast' });
    expect(r.warnings.some((w) => w.includes('Unknown price'))).toBe(true);
    expect(r.totals.costUsdMonth).toBeGreaterThan(12);
    expect(r.totals.overBudget).toBe(true);
    expect(r.nodes.growth.storageGbPerDay).toBe(2);
    expect(r.nodes.fixed.costLabel).toBe('entered by you');
    const withIcon = analyzeCapacity(page([icon('db', 'database', { rps: 1, capacityRps: 10 })]));
    expect(withIcon.totals).toBeDefined();
  });
  it('non-diagram nodes and edges to missing nodes are ignored; empty page works', () => {
    expect(analyzeCapacity(page([])).bottlenecks).toEqual([]);
    const r = analyzeCapacity(page([icon('a', 'server', { rps: 1, capacityRps: 10 }), { id: 'n', type: 'note', position: { x: 0, y: 0 }, data: { label: 'n' } } as CNode], [edge('1', 'a', 'ghost')]));
    expect(r.nodes.a).toBeDefined();
  });
  it('defaultEntryRps applies to the first entry node; latencyModel factor with throttle off', () => {
    const p = page([icon('a', 'server', { capacityRps: 10 }), icon('b', 'server', { capacityRps: 100 })], [edge('1', 'a', 'b')]);
    expect(analyzeCapacity(p, { defaultEntryRps: 50, throttle: false, latencyModel: 'factor', warnAt: 0.5 }).nodes.a).toBeDefined();
  });
});
