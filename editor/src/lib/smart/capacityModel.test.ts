import { describe, expect, it } from 'vitest';
import { analyzeCapacity, queueFactor, queueWaitMs, MAX_QUEUE_FACTOR } from '@core/capacity';
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
    const r = analyzeCapacity(chain({ capacityRps: 200 })); // api rho 0.5 (S = 5 ms), lb rho 0.1 (S = 1 ms), db rho 0.2 (S = 2 ms)
    expect(r.nodes.api.p99Ms).toBeCloseTo(20 + queueWaitMs(0.5, 5, 0.99));
    expect(r.nodes.api.p50Ms).toBeCloseTo(10); // rho 0.5: the median never waits
    expect(r.worstPath!.p99Ms).toBeCloseTo(10 + queueWaitMs(0.1, 1, 0.99) + 20 + queueWaitMs(0.5, 5, 0.99) + 30 + queueWaitMs(0.2, 2, 0.99));
    expect(r.totals.p99Ms).toBe(r.worstPath!.p99Ms);
    const old = analyzeCapacity(chain({ capacityRps: 200 }), { latencyModel: 'factor' });
    expect(old.nodes.api.p99Ms).toBeCloseTo(40);
    expect(old.nodes.api.p50Ms).toBeCloseTo(20);
    expect(old.worstPath!.p99Ms).toBeCloseTo(10 / (1 - 0.1) + 40 + 30 / (1 - 0.2));
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

describe('fan-out split (lb / gateway / waf)', () => {
  const fan = (ratios: Array<number | undefined>, srcArch?: Record<string, unknown>) =>
    page(
      [icon('lb', 'load-balancer', { rps: 300 }, srcArch), ...ratios.map((_, i) => icon(`s${i}`, 'server'))],
      ratios.map((r, i) => ({ ...edge(`e${i}`, 'lb', `s${i}`), ...(r !== undefined ? { data: { traffic: { ratio: r } } } : {}) }) as CEdge),
    );
  it('lb splits evenly', () => {
    const r = analyzeCapacity(fan([undefined, undefined, undefined]));
    for (const id of ['s0', 's1', 's2']) expect(r.nodes[id].load).toBeCloseTo(100);
    expect(r.edges.e0.rps).toBeCloseTo(100);
  });
  it('explicit ratio wins, remainder is split', () => {
    const r = analyzeCapacity(fan([0.5, undefined, undefined]));
    expect([r.nodes.s0.load, r.nodes.s1.load, r.nodes.s2.load].map((x) => Math.round(x))).toEqual([150, 75, 75]);
  });
  it('explicit ratios >= 1 leave nothing for unset edges', () => {
    const r = analyzeCapacity(fan([1, undefined]));
    expect(r.nodes.s0.load).toBeCloseTo(300);
    expect(r.nodes.s1.load).toBe(0);
  });
  it('service still calls every edge', () => {
    const r = analyzeCapacity(page([icon('a', 'server', { rps: 100 }), icon('d', 'database'), icon('c', 'redis')], [edge('e1', 'a', 'd'), edge('e2', 'a', 'c')]));
    expect(r.nodes.d.load).toBe(100);
    expect(r.nodes.c.load).toBe(100);
  });
  it("fanOut:'broadcast' restores the old behaviour", () => {
    const r = analyzeCapacity(fan([undefined, undefined]), { fanOut: 'broadcast' });
    expect(r.nodes.s0.load).toBe(300);
    expect(r.nodes.s1.load).toBe(300);
  });
  it('lb health check routes around a down target', () => {
    const r = analyzeCapacity(fan([undefined, undefined]), { chaos: { nodes: { s0: 'down' } } });
    expect(r.nodes.s0.load).toBe(0);
    expect(r.nodes.s1.load).toBeCloseTo(300);
    const off = analyzeCapacity(fan([undefined, undefined], { healthCheck: false }), { chaos: { nodes: { s0: 'down' } } });
    expect(off.nodes.s0.load).toBeCloseTo(150);
    expect(off.nodes.s1.load).toBeCloseTo(150);
  });
});

describe('default cache / cdn hit rate (assumeDefaults)', () => {
  const mk = (iconId: string, arch?: Record<string, unknown>) => page([icon('c', iconId, { rps: 1000 }, arch), icon('s', 'server')], [edge('e', 'c', 's')]);
  it('cache without arch: 80%', () => {
    const r = analyzeCapacity(mk('redis'), { assumeDefaults: true });
    expect(r.nodes.s.load).toBeCloseTo(200);
    expect(r.nodes.c.assumed).toBe(true);
    expect(analyzeCapacity(mk('redis')).nodes.s.load).toBe(1000);
  });
  it('cdn without arch: 90%', () => {
    expect(analyzeCapacity(mk('cdn'), { assumeDefaults: true }).nodes.s.load).toBeCloseTo(100);
  });
  it('explicit arch hitRate wins', () => {
    expect(analyzeCapacity(mk('redis', { hitRate: 50 }), { assumeDefaults: true }).nodes.s.load).toBeCloseTo(500);
  });
});

describe('perf', () => {
  it('2000-node chain plus fan analyses fast', () => {
    const n = 2000;
    const nodes = Array.from({ length: n }, (_, i) => icon(`n${i}`, 'server', i === 0 ? { rps: 10 } : {}));
    const edges = Array.from({ length: n - 1 }, (_, i) => edge(`e${i}`, `n${i}`, `n${i + 1}`));
    for (let i = 2; i < 1000; i++) edges.push(edge(`f${i}`, 'n0', `n${i}`));
    const t0 = performance.now();
    analyzeCapacity(page(nodes, edges));
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('queue backlog', () => {
  const pipe = (qCap: Record<string, unknown> = {}, workerCap = 600, rps = 1000, qArch?: Record<string, unknown>) =>
    page(
      [icon('svc', 'server', { rps }), icon('q', 'kafka', qCap, qArch), icon('w', 'server', { capacityRps: workerCap })],
      [edge('e1', 'svc', 'q'), edge('e2', 'q', 'w')],
    );
  it('slow consumer: queue buffers, the consumer is not overloaded', () => {
    const r = analyzeCapacity(pipe());
    expect(r.nodes.w.load).toBe(600);
    expect(r.nodes.w.droppedFraction).toBe(0); // at capacity, not past it
    expect(r.nodes.q.backlogRps).toBe(400);
    expect(r.nodes.q.status).toBe('warn');
    expect(r.totals.backlogRps).toBe(400);
    expect(r.totals.droppedPct).toBeCloseTo(40); // the consumers never catch up: the backlog is lost in the end
  });
  it('backlog that drains after the spike is not counted as dropped', () => {
    const r = analyzeCapacity(pipe({}, 300, 200), { chaos: { spike: 2 } });
    expect(r.nodes.q.backlogRps).toBe(100);
    expect(r.nodes.q.retentionExceeded).toBe(false);
    expect(r.totals.droppedPct).toBeCloseTo(0);
  });
  it('consumerRps explicit wins', () => {
    const r = analyzeCapacity(pipe({ consumerRps: 300 }));
    expect(r.nodes.w.load).toBe(300);
    expect(r.nodes.q.backlogRps).toBe(700);
  });
  it('ingest overflow still drops', () => {
    const r = analyzeCapacity(pipe({ capacityRps: 500 }, 10000));
    expect(r.nodes.q.droppedFraction).toBeCloseTo(0.5);
    expect(r.nodes.q.backlogRps).toBeUndefined();
    expect(r.totals.droppedPct).toBeCloseTo(50);
  });
  it('time to drain after a spike', () => {
    const r = analyzeCapacity(pipe({}, 600, 200), { chaos: { spike: 2 }, spikeDurationSec: 300 }); // base 200, spike 400, drain 600 -> no backlog
    expect(r.nodes.q.backlogRps).toBeUndefined();
    const s = analyzeCapacity(pipe({}, 300, 200), { chaos: { spike: 2 }, spikeDurationSec: 300 }); // base 200, spike 400, drain 300
    expect(s.nodes.q.backlogRps).toBe(100);
    expect(s.nodes.q.backlogMsgs).toBe(30000);
    expect(s.nodes.q.timeToDrainSec).toBeCloseTo(30000 / (300 - 200));
  });
  it('never drains: Infinity and retentionExceeded', () => {
    const q = analyzeCapacity(pipe()).nodes.q;
    expect(q.timeToDrainSec).toBe(Infinity);
    expect(q.retentionExceeded).toBe(true);
  });
  it('unknown consumer capacity: no backlog', () => {
    const r = analyzeCapacity(page([icon('svc', 'server', { rps: 1000 }), icon('q', 'kafka'), icon('w', 'server')], [edge('e1', 'svc', 'q'), edge('e2', 'q', 'w')]));
    expect(r.nodes.q.backlogRps).toBeUndefined();
    expect(r.nodes.w.load).toBe(1000);
  });
});

describe('percentile latency', () => {
  it('queueWaitMs: median waits only past rho 0.5, p99 grows faster', () => {
    expect(queueWaitMs(0.4, 10, 0.5)).toBe(0);
    expect(queueWaitMs(0.9, 10, 0.5)).toBeGreaterThan(0);
    expect(queueWaitMs(0.9, 10, 0.99)).toBeGreaterThan(queueWaitMs(0.9, 10, 0.5));
    expect(queueWaitMs(1, 10, 0.99)).toBe(Infinity);
  });
  it('p99EstMs is between the biggest hop and the summed upper bound', () => {
    const w = analyzeCapacity(chain({ capacityRps: 200 })).worstPath!;
    expect(w.p99EstMs!).toBeLessThanOrEqual(w.p99Ms);
    expect(w.p99EstMs!).toBeGreaterThanOrEqual(w.p50Ms);
  });
});

describe('retries', () => {
  const withTraffic = (traffic: Record<string, unknown>, apiCap = 100) =>
    page(
      [icon('c', 'server', { rps: 100 }), icon('api', 'server', { capacityRps: apiCap, p50Ms: 10, p99Ms: 20 })],
      [{ ...edge('e', 'c', 'api'), data: { traffic } } as CEdge],
    );
  it('no retries: nothing changes', () => {
    const r = analyzeCapacity(withTraffic({}, 50));
    expect(r.nodes.api.load).toBe(100);
    expect(r.edges.e.amplification).toBeUndefined();
    expect(r.totals.retryStorm).toBe(false);
  });
  it('healthy target: amplification 1', () => {
    const r = analyzeCapacity(withTraffic({ retries: 3 }, 1000));
    expect(r.edges.e.amplification).toBeCloseTo(1);
    expect(r.nodes.api.load).toBeCloseTo(100);
  });
  it('overloaded target: retries raise its load', () => {
    const plain = analyzeCapacity(withTraffic({}, 50));
    const r = analyzeCapacity(withTraffic({ retries: 3 }, 50));
    expect(r.nodes.api.load).toBeGreaterThan(plain.nodes.api.load);
    expect(r.edges.e.amplification!).toBeGreaterThan(1);
    expect(r.edges.e.failRate!).toBeGreaterThan(0.5);
  });
  it('down target: every attempt fails, amplification retries + 1', () => {
    const r = analyzeCapacity(withTraffic({ retries: 3 }), { chaos: { nodes: { api: 'down' } } });
    expect(r.edges.e.failRate).toBe(1);
    expect(r.edges.e.amplification).toBe(4);
  });
  it('timeout below p50 fails half the calls and adds retry latency', () => {
    const r = analyzeCapacity(withTraffic({ retries: 2, timeoutMs: 5, backoffMs: 5 }, 1000));
    expect(r.edges.e.failRate).toBeCloseTo(0.5);
    expect(r.edges.e.amplification).toBeCloseTo(1 + 0.5 + 0.25, 1);
    expect(r.worstPath!.p99Ms).toBeCloseTo(r.nodes.api.p99Ms! + 0.5 * (5 + 5), 5); // api p99 + failed share x (timeout + backoff)
  });
  it('retries do not break the dropped share baseline', () => {
    const r = analyzeCapacity(withTraffic({ retries: 3 }, 50));
    expect(r.totals.droppedPct).toBeGreaterThan(0);
    expect(r.totals.droppedPct).toBeLessThanOrEqual(100);
  });
});
