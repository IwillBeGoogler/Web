import { describe, expect, it } from 'vitest';
import { analyzeCapacity, queueFactor, MAX_QUEUE_FACTOR } from '@core/capacity';
import { archFixFor, blogUrl, RECOMMENDATIONS, recommendationFor } from '@core/arch/fixes';
import { LINT_RULES, applyFix, lintPage } from '@core/lint';
import type { CEdge, CNode, CPage } from '@core/types';

const icon = (id: string, iconId: string, capacity?: Record<string, unknown>, arch?: Record<string, unknown>): CNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id, iconId, ...(capacity ? { capacity } : {}), ...(arch ? { arch } : {}) } });
const edge = (id: string, source: string, target: string): CEdge => ({ id, source, target });
const page = (nodes: CNode[], edges: CEdge[] = []): CPage => ({ id: 'p', name: 'p', nodes, edges });
const chain = (api: Record<string, unknown> = {}, db: Record<string, unknown> = {}) =>
  page([icon('lb', 'load-balancer', { rps: 100, p99Ms: 10, p50Ms: 5, capacityRps: 1000 }), icon('api', 'server', { capacityRps: 200, p99Ms: 20, p50Ms: 10, ...api }), icon('db', 'database', { capacityRps: 500, p99Ms: 30, p50Ms: 15, ...db })], [edge('e1', 'lb', 'api'), edge('e2', 'api', 'db')]);

describe('queueing latency', () => {
  it('factor is 1/(1-rho), capped', () => {
    expect(queueFactor(0)).toBe(1);
    expect(queueFactor(0.5)).toBe(2);
    expect(queueFactor(0.9)).toBeCloseTo(10);
    expect(queueFactor(0.99)).toBe(MAX_QUEUE_FACTOR);
    expect(queueFactor(1)).toBe(MAX_QUEUE_FACTOR);
    expect(queueFactor(3)).toBe(MAX_QUEUE_FACTOR);
  });
  it('applies to node latency and the worst path', () => {
    const r = analyzeCapacity(chain({ capacityRps: 200 })); // api rho 0.5
    expect(r.nodes.api.p99Ms).toBeCloseTo(40);
    expect(r.nodes.api.p50Ms).toBeCloseTo(20);
    expect(r.worstPath!.p99Ms).toBeCloseTo(10 / (1 - 0.1) + 40 + 30 / (1 - 0.2));
    expect(r.totals.p99Ms).toBe(r.worstPath!.p99Ms);
  });
  it('rho >= 1: over, drops 1-1/rho, saturated at the cap', () => {
    const r = analyzeCapacity(chain({ capacityRps: 50 })); // rho 2
    expect(r.nodes.api.status).toBe('over');
    expect(r.nodes.api.saturated).toBe(true);
    expect(r.nodes.api.droppedFraction).toBeCloseTo(0.5);
    expect(r.nodes.api.p99Ms).toBe(20 * MAX_QUEUE_FACTOR);
  });
  it('throttle: downstream gets min(load, capacity); throttle:false keeps the old worst case', () => {
    const t = analyzeCapacity(chain({ capacityRps: 50 }));
    expect(t.nodes.db.load).toBe(50);
    expect(t.totals.droppedPct).toBeCloseTo(50);
    const old = analyzeCapacity(chain({ capacityRps: 50 }), { throttle: false });
    expect(old.nodes.db.load).toBe(100);
    expect(old.totals.droppedPct).toBe(0);
  });
});

describe('availability', () => {
  it('defaults by role, product along the path', () => {
    const r = analyzeCapacity(chain());
    expect(r.nodes.lb.availability).toBeCloseTo(0.9999);
    expect(r.nodes.api.availability).toBeCloseTo(0.999);
    expect(r.nodes.db.availability).toBeCloseTo(0.9995);
    expect(r.totals.availability).toBeCloseTo(0.9999 * 0.999 * 0.9995, 6);
    expect(r.totals.rpsIn).toBe(100);
  });
  it('override and replicas: 1-(1-a)^n', () => {
    const r = analyzeCapacity(chain({ availability: 99, replicas: 3 }));
    expect(r.nodes.api.availability).toBeCloseTo(1 - 0.01 ** 3);
  });
  it('multi-az cuts unavailability by 10x', () => {
    const p = chain();
    p.nodes[1].data.arch = { deployment: 'multi-az' };
    expect(analyzeCapacity(p).nodes.api.availability).toBeCloseTo(1 - 0.001 * 0.1, 6);
  });
  it('dropped share lowers system availability; weakest path wins', () => {
    const p = page([icon('a', 'server', { rps: 100, capacityRps: 50 }), icon('b', 'database', { availability: 90 }), icon('c', 'cache', {})], [edge('e1', 'a', 'b'), edge('e2', 'a', 'c')]);
    const r = analyzeCapacity(p);
    expect(r.totals.droppedPct).toBeCloseTo(50);
    expect(r.totals.availability).toBeCloseTo(0.999 * 0.9 * 0.5, 6);
  });
});

describe('chaos', () => {
  it('a down node cuts the worst path: no p99 when every path is broken, healthy branch wins otherwise', () => {
    const r = analyzeCapacity(chain(), { chaos: { nodes: { api: 'down' } } });
    expect(r.worstPath!.broken).toBe(true);
    expect(r.worstPath!.nodeIds).toEqual(['lb', 'api']);
    expect(r.totals.p99Ms).toBe(0);
    const fork = page([...chain().nodes, icon('c', 'redis', { p99Ms: 2, capacityRps: 1000 })], [...chain().edges, edge('e3', 'lb', 'c')]);
    const f = analyzeCapacity(fork, { chaos: { nodes: { api: 'down' } } });
    expect(f.worstPath!.broken).toBeFalsy();
    expect(f.worstPath!.nodeIds).toEqual(['lb', 'c']);
  });
  it('down: capacity 0, availability 0, downstream starved, everything dropped', () => {
    const r = analyzeCapacity(chain(), { chaos: { nodes: { api: 'down' } } });
    expect(r.nodes.api.status).toBe('down');
    expect(r.nodes.api.capacity).toBe(0);
    expect(r.nodes.api.availability).toBe(0);
    expect(r.nodes.db.load).toBe(0);
    expect(r.totals.droppedPct).toBe(100);
    expect(r.totals.availability).toBe(0);
  });
  it('slow: latency x5', () => {
    const base = analyzeCapacity(chain());
    const r = analyzeCapacity(chain(), { chaos: { nodes: { db: 'slow' } } });
    expect(r.nodes.db.p99Ms).toBeCloseTo(base.nodes.db.p99Ms! * 5);
    expect(r.totals.p99Ms).toBeGreaterThan(base.totals.p99Ms);
  });
  it('spike multiplies entry traffic', () => {
    const r = analyzeCapacity(chain(), { chaos: { spike: 5 } });
    expect(r.totals.rpsIn).toBe(500);
    expect(r.nodes.api.status).toBe('over'); // 500 on 200
    expect(r.totals.droppedPct).toBeGreaterThan(0);
  });
});

describe('budget', () => {
  it('warns when the cost is above the budget', () => {
    const p = chain({ monthlyCostUsd: 500 });
    const r = analyzeCapacity(p, { budgetUsd: 100 });
    expect(r.totals.overBudget).toBe(true);
    expect(r.totals.budgetUsd).toBe(100);
    expect(r.warnings.some((w) => /above the budget/.test(w))).toBe(true);
    const ok = analyzeCapacity(p, { budgetUsd: 1000 });
    expect(ok.totals.overBudget).toBe(false);
    expect(ok.warnings.some((w) => /budget/.test(w))).toBe(false);
    expect(analyzeCapacity(p).totals.overBudget).toBe(false);
  });
});

describe('fix recommendations', () => {
  it('every architecture rule and capacity status has one; links are URL pieces', () => {
    for (const r of LINT_RULES.filter((x) => x.id.startsWith('arch/'))) expect(recommendationFor(r.id), r.id).toBeTruthy();
    for (const k of ['capacity/over', 'capacity/warn', 'capacity/down']) expect(RECOMMENDATIONS[k].steps.length).toBeGreaterThan(10);
    expect(blogUrl('high-availability')).toBe('/posts/high-availability');
    expect(blogUrl('x', '/blog/')).toBe('/blog/x');
  });
  it('trivial fixes apply through applyFix', () => {
    const kafka = icon('k', 'kafka', undefined, { replicationFactor: 1, acks: '1' });
    const p = page([kafka]);
    const problems = lintPage(p);
    const rf = problems.find((x) => x.rule === 'arch/kafka-rf')!;
    expect(rf.fix?.kind).toBe('set-arch');
    let cur = applyFix(p, rf.fix!);
    expect((cur.nodes[0].data.arch as any).replicationFactor).toBe(3);
    cur = applyFix(cur, archFixFor('arch/kafka-acks', cur.nodes[0])!);
    expect((cur.nodes[0].data.arch as any).acks).toBe('all');
    expect(lintPage(cur).some((x) => x.rule === 'arch/kafka-rf')).toBe(false);
  });
  it('spof fix adds a replica to the single instance', () => {
    const p = page([icon('lb', 'load-balancer'), icon('api', 'server')], [edge('e', 'lb', 'api')]);
    const spof = lintPage(p).find((x) => x.rule === 'arch/spof')!;
    expect(spof.fix?.kind).toBe('add-replica');
    const next = applyFix(p, spof.fix!);
    expect((next.nodes[1].data.capacity as any).replicas).toBe(2);
    expect(lintPage(next).some((x) => x.rule === 'arch/spof')).toBe(false);
  });
  it('health check, DLQ and db replica fixes', () => {
    const lb = icon('l', 'load-balancer', undefined, { healthCheck: false });
    expect(applyFix(page([lb]), archFixFor('arch/lb-no-healthcheck', lb)!).nodes[0].data.arch.healthCheck).toBe(true);
    const q = icon('q', 'queue');
    expect(applyFix(page([q]), archFixFor('arch/no-dlq', q)!).nodes[0].data.arch.dlq).toBe(true);
    const db = icon('d', 'database');
    const withFix = applyFix(page([db]), archFixFor('arch/db-no-replica', db)!);
    expect(lintPage(withFix).some((x) => x.rule === 'arch/db-no-replica')).toBe(false);
  });
});
