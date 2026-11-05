/**
 * Rule-based lint (no AI): architecture, ERD and UML checks over a page. Pure and deterministic. Each rule has an id, a default
 * severity and can be disabled or re-leveled through `LintConfig`. Some problems carry a trivial quick fix (`applyFix`).
 */
import { resolveIcon } from './catalog';
import type { Fix } from './lintFix';
import type { CEdge, CNode, CPage } from './types';

export { applyFix, type Fix } from './lintFix';

export type Severity = 'error' | 'warning' | 'info';
export type NamingStyle = 'snake_case' | 'camelCase' | 'any';
export interface Problem {
  /** stable across runs for the same problem */
  id: string;
  rule: string;
  severity: Severity;
  message: string;
  /** the nodes involved; the first one is where "show" zooms to */
  nodeIds: string[];
  edgeIds?: string[];
  fix?: Fix;
}
export interface LintConfig {
  rules?: Record<string, { enabled?: boolean; severity?: Severity }>;
  naming?: NamingStyle;
}
export interface RuleDef { id: string; category: 'architecture' | 'erd' | 'uml'; title: string; description: string; severity: Severity }

export const LINT_RULES: RuleDef[] = [
  { id: 'arch/spof', category: 'architecture', title: 'Single point of failure', description: 'A load balancer that sends to only one instance, so there is no redundancy behind it.', severity: 'warning' },
  { id: 'arch/db-no-replica', category: 'architecture', title: 'Database without a replica', description: 'A database with no replica, standby or replicated cluster.', severity: 'warning' },
  { id: 'arch/db-no-backup', category: 'architecture', title: 'Database without a backup', description: 'A database with no connection to backup storage.', severity: 'info' },
  { id: 'arch/public-no-waf', category: 'architecture', title: 'Public service without WAF or load balancer', description: 'A client or the internet talks straight to a service.', severity: 'warning' },
  { id: 'arch/sync-cycle', category: 'architecture', title: 'Cycle of synchronous calls', description: 'Services that call each other in a loop can deadlock or amplify load.', severity: 'warning' },
  { id: 'arch/no-monitoring', category: 'architecture', title: 'No monitoring connection', description: 'A service or database that no monitoring component is connected to.', severity: 'info' },
  { id: 'arch/cluster-profile', category: 'architecture', title: 'Cluster profile warning', description: 'Problems found by the cluster profile (replication factor, quorum, zone spread).', severity: 'warning' },
  { id: 'erd/fk-index', category: 'erd', title: 'Foreign key without an index', description: 'Joins and deletes on the parent scan the child table.', severity: 'warning' },
  { id: 'erd/no-pk', category: 'erd', title: 'Table without a primary key', description: 'Rows cannot be identified.', severity: 'error' },
  { id: 'erd/fk-type', category: 'erd', title: 'Foreign key type differs from the referenced key', description: 'The column and the key it references have different types.', severity: 'error' },
  { id: 'erd/nullable-fk', category: 'erd', title: 'Nullable foreign key on a required relation', description: 'The relation says the parent is required but the column allows NULL.', severity: 'warning' },
  { id: 'erd/naming', category: 'erd', title: 'Naming convention', description: 'Table and column names should follow one style (Settings > Lint).', severity: 'info' },
  { id: 'uml/inheritance-cycle', category: 'uml', title: 'Inheritance cycle', description: 'A class is its own ancestor.', severity: 'error' },
  { id: 'uml/interface-no-impl', category: 'uml', title: 'Interface without implementation', description: 'No class realizes this interface.', severity: 'info' },
  { id: 'uml/unused-class', category: 'uml', title: 'Unused class', description: 'A class with no relations to anything and no sequence diagram participant of the same name.', severity: 'info' },
  { id: 'uml/seq-missing-method', category: 'uml', title: 'Sequence message calls a missing method', description: 'A sequence message calls a method that the class of the same name as the target participant does not have (own or inherited).', severity: 'warning' },
  { id: 'uml/object-unknown-slot', category: 'uml', title: 'Object slot not in its class', description: 'A slot of an object that names no attribute of its class (own or inherited).', severity: 'warning' },
];

// ---------- roles of architecture nodes ----------
export type Role = 'client' | 'lb' | 'gateway' | 'waf' | 'cdn' | 'database' | 'cache' | 'queue' | 'storage' | 'monitoring' | 'service' | 'other';
const ID_ROLES: [RegExp, Role][] = [
  [/^(user|users|browser|mobile|desktop|iot|admin|internet)$/, 'client'],
  [/(^|-)(waf|cloud-armor|firewall)(-|$)|^aws-waf$|^cloudflare$/, 'waf'],
  [/(^|-)(load-balanc\w*|haproxy|traefik|envoy|reverse-proxy|nginx|lb|alb|nlb|elb)(-|$)|^aws-elastic-load-balancing$/, 'lb'],
  [/api-gateway|^kong$|^aws-api-gateway$/, 'gateway'],
  [/^(cdn|aws-amazon-cloudfront|gcp-cloud-cdn|akamai|fastly)$/, 'cdn'],
  [/^(redis|valkey|keydb|dragonfly|memcached|cache|hazelcast|aerospike|aws-amazon-elasticache|gcp-memorystore|azure-cache-for-redis)$/, 'cache'],
  [/^(queue|pubsub|event-bus|kafka|rabbitmq|nats|activemq|pulsar|redis-streams|sqs|sns|kinesis|gcp-pubsub|service-bus|event-hubs|eventbridge|redpanda|stream-processor)$/, 'queue'],
  [/^(object-storage|file-storage|s3|minio|gcs|azure-blob|ceph|hdfs|nfs|backblaze|cloudflare-r2|aws-amazon-s3-glacier)$/, 'storage'],
  [/^(prometheus|grafana|loki|tempo|mimir|thanos|alertmanager|jaeger|zipkin|opentelemetry|datadog|newrelic|sentry|pagerduty|cloudwatch|azure-monitor|gcp-monitoring|victoriametrics|elasticsearch-monitoring|kibana|logstash|fluentd|fluent-bit|vector|telegraf|netdata|zabbix|nagios|aws-amazon-managed-grafana|aws-amazon-managed-service-for-prometheus)$/, 'monitoring'],
  [/^(database|nosql|postgresql|mysql|mariadb|oracle-db|sqlserver|sqlite|mongodb|cassandra|cockroachdb|yugabytedb|couchbase|couchdb|dynamodb|aurora|cloud-sql|spanner|cosmosdb|firestore|documentdb|tidb|neon|supabase|planetscale|vitess|clickhouse|timescaledb|influxdb|data-warehouse|aws-amazon-rds|azure-sql\w*|azure-database-\w+)$/, 'database'],
];
export function roleOf(n: CNode): Role {
  // only architecture nodes have a role; UML / ER / board nodes (deployment, component, object, ...) never get architecture advice
  if (n.type !== 'icon' && n.type !== 'cluster' && n.type !== 'card') return 'other';
  const id = String(n.data.iconId ?? '');
  const label = String(n.data.label ?? '').toLowerCase();
  const profile = String(n.data.profileId ?? '');
  for (const [re, role] of ID_ROLES) if (re.test(id) || (profile && re.test(profile))) return role;
  const tags = id ? resolveIcon(id)?.tags ?? [] : [];
  if (tags.includes('sql') || tags.includes('nosql') || tags.includes('data-warehouse')) return 'database';
  if (tags.includes('queue') || tags.includes('streaming')) return 'queue';
  if (tags.includes('observability')) return 'monitoring';
  if (/\b(database|db|postgres|mysql)\b/.test(label) && !id) return 'database';
  return n.type === 'icon' || n.type === 'cluster' || n.type === 'card' ? 'service' : 'other';
}

const REPLICA_LABEL = /replica|standby|secondary|follower|read[- ]only/i;
const BACKUP_LABEL = /backup|snapshot|archive|dump/i;
const ASYNC_LABEL = /async|event|publish|consume|subscribe|stream|batch|cron|queue|notify|webhook/i;
const ASYNC_PRESETS = new Set(['metrics', 'logs', 'traces', 'backup']);

const sevOf = (cfg: LintConfig | undefined, id: string): Severity | null => {
  const c = cfg?.rules?.[id];
  if (c?.enabled === false) return null;
  return c?.severity ?? LINT_RULES.find((r) => r.id === id)!.severity;
};

const isReplicaNode = (n: CNode) => n.data.role === 'replica' || n.data.role === 'standby' || REPLICA_LABEL.test(String(n.data.label ?? ''));
const redundant = (n: CNode) => Number(n.data.replicas ?? 1) > 1 || !!n.data.repeatOf || (n.type === 'cluster' && n.data.topology !== 'single');

function sccs(ids: string[], adj: Map<string, string[]>): string[][] {
  let idx = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const on = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  const visit = (v: string) => {
    index.set(v, idx);
    low.set(v, idx++);
    stack.push(v);
    on.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = [];
      let w: string;
      do { w = stack.pop()!; on.delete(w); comp.push(w); } while (w !== v);
      out.push(comp);
    }
  };
  for (const v of ids) if (!index.has(v)) visit(v);
  return out;
}

const baseType = (t: string): string => {
  const x = String(t ?? '').toLowerCase().replace(/\(.*\)/, '').replace(/\s+/g, ' ').trim();
  const map: Record<string, string> = { int: 'int', integer: 'int', int4: 'int', serial: 'int', serial4: 'int', smallint: 'smallint', int2: 'smallint', smallserial: 'smallint', bigint: 'bigint', int8: 'bigint', bigserial: 'bigint', serial8: 'bigint', varchar: 'text', 'character varying': 'text', text: 'text', char: 'text', uuid: 'uuid', bool: 'boolean', boolean: 'boolean', timestamptz: 'timestamp', 'timestamp with time zone': 'timestamp', 'timestamp without time zone': 'timestamp', datetime: 'timestamp', float8: 'double', 'double precision': 'double', float4: 'float', real: 'float', decimal: 'numeric' };
  return map[x] ?? x;
};
const snake = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const camel = /^[a-z][a-zA-Z0-9]*$/;

export function lintPage(page: CPage, cfg: LintConfig = {}): Problem[] {
  const out: Problem[] = [];
  const byId = new Map(page.nodes.map((n) => [n.id, n]));
  const label = (id: string) => String(byId.get(id)?.data.label ?? id);
  const push = (rule: string, key: string, message: string, nodeIds: string[], extra: Partial<Problem> = {}) => {
    const severity = sevOf(cfg, rule);
    if (severity) out.push({ id: `${rule}:${key}`, rule, severity, message, nodeIds, ...extra });
  };
  const edges = page.edges.filter((e) => byId.has(e.source) && byId.has(e.target));
  const outs = (id: string) => edges.filter((e) => e.source === id);
  const ins = (id: string) => edges.filter((e) => e.target === id);
  const role = new Map(page.nodes.map((n) => [n.id, roleOf(n)]));
  const dbs = page.nodes.filter((n) => role.get(n.id) === 'database');

  // ---- architecture ----
  for (const lb of page.nodes.filter((n) => role.get(n.id) === 'lb')) {
    const targets = [...new Set(outs(lb.id).map((e) => e.target))].map((id) => byId.get(id)!).filter((t) => ['service', 'cache', 'database', 'other'].includes(role.get(t.id)!) && t.type !== 'group');
    if (targets.length === 1 && !redundant(targets[0]))
      push('arch/spof', lb.id, `${label(lb.id)} sends traffic to only one instance (${label(targets[0].id)}): there is no redundancy behind it. Add a second instance or set replicas.`, [lb.id, targets[0].id], { edgeIds: outs(lb.id).map((e) => e.id) });
  }
  for (const db of dbs) {
    const peers = [...ins(db.id), ...outs(db.id)].map((e) => ({ e, other: byId.get(e.source === db.id ? e.target : e.source)! }));
    const hasReplica = redundant(db) || !!db.data.replication || isReplicaNode(db) || peers.some(({ e, other }) => role.get(other.id) === 'database' && (e.data?.kind === 'replication' || isReplicaNode(other) || other.data.iconId === db.data.iconId));
    if (!hasReplica && !isReplicaNode(db)) push('arch/db-no-replica', db.id, `${label(db.id)} has no replica or standby: a failure loses availability. Add a replica or use a replicated cluster.`, [db.id]);
    const hasBackup = peers.some(({ e, other }) => role.get(other.id) === 'storage' || BACKUP_LABEL.test(String(e.label ?? '')) || e.data?.preset === 'backup' || BACKUP_LABEL.test(String(other.data.label ?? '')));
    if (!hasBackup && !isReplicaNode(db)) push('arch/db-no-backup', db.id, `${label(db.id)} has no backup: connect it to backup storage (or label the edge "backup").`, [db.id]);
  }
  const shields = new Set<Role>(['lb', 'gateway', 'waf', 'cdn', 'client', 'monitoring', 'queue']);
  for (const e of edges) {
    const from = byId.get(e.source)!, to = byId.get(e.target)!;
    if (role.get(from.id) !== 'client') continue;
    const tr = role.get(to.id)!;
    if (shields.has(tr) || tr === 'other' || tr === 'storage') continue;
    push('arch/public-no-waf', `${from.id}>${to.id}`, `${label(from.id)} talks directly to ${label(to.id)}. Put a WAF or a load balancer in front of it.`, [from.id, to.id], { edgeIds: [e.id] });
  }
  // synchronous cycles
  const isAsync = (e: CEdge) => role.get(e.source) === 'queue' || role.get(e.target) === 'queue' || ASYNC_LABEL.test(String(e.label ?? '')) || ASYNC_PRESETS.has(String(e.data?.preset ?? '')) || !!e.data?.kind;
  const callable = new Set(page.nodes.filter((n) => ['service', 'gateway', 'lb', 'cache', 'database'].includes(role.get(n.id)!)).map((n) => n.id));
  const adj = new Map<string, string[]>();
  for (const e of edges) if (!isAsync(e) && callable.has(e.source) && callable.has(e.target) && e.source !== e.target) adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
  for (const comp of sccs([...callable], adj)) {
    if (comp.length < 2) continue;
    const ids = page.nodes.map((n) => n.id).filter((i) => comp.includes(i));
    push('arch/sync-cycle', ids.join(','), `Synchronous calls form a cycle: ${ids.map(label).join(' → ')} → ${label(ids[0])}. Make one hop asynchronous or break the loop.`, ids);
  }
  // monitoring
  const monitors = page.nodes.filter((n) => role.get(n.id) === 'monitoring');
  const watchable = page.nodes.filter((n) => ['service', 'database', 'cache', 'queue', 'lb', 'gateway'].includes(role.get(n.id)!));
  if (watchable.length) {
    if (!monitors.length) push('arch/no-monitoring', 'none', 'No monitoring component in this diagram: add Prometheus, CloudWatch or similar and connect it.', []);
    else
      for (const n of watchable)
        if (!edges.some((e) => (e.source === n.id && role.get(e.target) === 'monitoring') || (e.target === n.id && role.get(e.source) === 'monitoring')))
          push('arch/no-monitoring', n.id, `${label(n.id)} is not connected to any monitoring component.`, [n.id]);
  }
  for (const n of page.nodes) for (const w of (n.data.warnings as string[] | undefined) ?? []) push('arch/cluster-profile', `${n.id}:${w}`, `${label(n.id)}: ${w}`, [n.id]);

  // ---- ERD ----
  const tables = page.nodes.filter((n) => n.type === 'table' && n.data.tableKind !== 'enum' && n.data.tableKind !== 'view');
  const colsOf = (t: CNode): any[] => t.data.columns ?? [];
  const nextColId = (t: CNode) => { let m = -1; for (const c of colsOf(t)) { const r = /^c(\d+)$/.exec(c.id); if (r) m = Math.max(m, Number(r[1])); } return `c${m + 1}`; };
  void nextColId;
  const fkCols = (t: CNode) => colsOf(t).filter((c) => c.fk);
  for (const t of tables) {
    const indexes: { columns: string[] }[] = t.data.indexes ?? [];
    const pk = colsOf(t).filter((c) => c.pk).map((c) => c.name);
    for (const c of fkCols(t)) {
      const covered = c.pk && pk[0] === c.name ? true : c.unique || indexes.some((i) => i.columns[0] === c.name) || pk[0] === c.name;
      if (!covered) push('erd/fk-index', `${t.id}.${c.id}`, `${label(t.id)}.${c.name} references ${c.fk.table} but has no index.`, [t.id], { fix: { kind: 'add-index', label: `Add index on ${c.name}`, nodeId: t.id, column: c.name } });
    }
    if (!colsOf(t).some((c) => c.pk)) push('erd/no-pk', t.id, `${label(t.id)} has no primary key.`, [t.id], { fix: { kind: 'add-pk', label: 'Add an id primary key', nodeId: t.id } });
  }
  for (const e of page.edges) {
    const r = e.data?.relation;
    if (!r) continue;
    const parent = byId.get(e.source), child = byId.get(e.target);
    if (!parent || !child || parent.type !== 'table' || child.type !== 'table') continue;
    const pc = colsOf(parent).find((c) => c.id === r.fromCol), cc = colsOf(child).find((c) => c.id === r.toCol);
    if (!pc || !cc) continue;
    if (baseType(pc.type) !== baseType(cc.type))
      push('erd/fk-type', `${child.id}.${cc.id}`, `${label(child.id)}.${cc.name} is ${cc.type} but references ${label(parent.id)}.${pc.name} (${pc.type}).`, [child.id, parent.id], { edgeIds: [e.id], fix: { kind: 'sync-type', label: `Change to ${pc.type}`, nodeId: child.id, column: cc.name, type: pc.type } });
    if (r.optional === false && cc.nullable && !cc.pk)
      push('erd/nullable-fk', `${child.id}.${cc.id}`, `${label(child.id)}.${cc.name} allows NULL but the relation to ${label(parent.id)} is required.`, [child.id, parent.id], { edgeIds: [e.id], fix: { kind: 'set-not-null', label: `Make ${cc.name} NOT NULL`, nodeId: child.id, column: cc.name } });
  }
  const style = cfg.naming ?? 'snake_case';
  if (style !== 'any') {
    const ok = (s: string) => (style === 'snake_case' ? snake.test(s) : camel.test(s));
    for (const t of page.nodes.filter((n) => n.type === 'table' && n.data.tableKind !== 'enum')) {
      if (!ok(String(t.data.label))) push('erd/naming', `${t.id}`, `Table "${t.data.label}" is not ${style}.`, [t.id]);
      for (const c of colsOf(t)) if (!ok(String(c.name))) push('erd/naming', `${t.id}.${c.id}`, `Column "${t.data.label}.${c.name}" is not ${style}.`, [t.id]);
    }
  }

  // ---- UML ----
  const classes = page.nodes.filter((n) => n.type === 'class');
  const umlEdges = edges.filter((e) => e.data?.uml && byId.get(e.source)?.type === 'class' && byId.get(e.target)?.type === 'class');
  const inh = new Map<string, string[]>();
  for (const e of umlEdges) if (e.data!.uml.kind === 'inheritance') inh.set(e.source, [...(inh.get(e.source) ?? []), e.target]);
  for (const comp of sccs(classes.map((c) => c.id), inh)) {
    const self = comp.length === 1 && (inh.get(comp[0]) ?? []).includes(comp[0]);
    if (comp.length < 2 && !self) continue;
    const ids = page.nodes.map((n) => n.id).filter((i) => comp.includes(i));
    // the last drawn inheritance edge inside the cycle is the one to cut
    const inside = umlEdges.filter((e) => e.data!.uml.kind === 'inheritance' && comp.includes(e.source) && comp.includes(e.target));
    const cut = inside[inside.length - 1];
    push('uml/inheritance-cycle', ids.join(','), `Inheritance cycle: ${ids.map(label).join(' → ')} → ${label(ids[0])}.`, ids, { edgeIds: inside.map((e) => e.id), ...(cut ? { fix: { kind: 'remove-edge', label: `Remove ${label(cut.source)} → ${label(cut.target)}`, nodeId: cut.source, edgeId: cut.id } as Fix } : {}) });
  }
  for (const c of classes.filter((x) => x.data.kind === 'interface')) {
    if (!umlEdges.some((e) => e.target === c.id && (e.data!.uml.kind === 'realization' || e.data!.uml.kind === 'inheritance')))
      push('uml/interface-no-impl', c.id, `Interface ${label(c.id)} has no implementing class.`, [c.id], { fix: { kind: 'add-impl', label: 'Add an implementing class', nodeId: c.id } });
  }

  // sequence diagrams on the page: participants named like a class count as uses of it
  const seqs = page.nodes.filter((n) => n.type === 'sequence');
  const partName = (raw: string) => {
    const t = String(raw ?? '').trim();
    const k = t.lastIndexOf(':');
    return (k >= 0 ? t.slice(k + 1) : t).trim().toLowerCase();
  };
  const classByName = new Map<string, CNode>();
  for (const c of classes) { const k = String(c.data.label ?? '').trim().toLowerCase(); if (k && !classByName.has(k)) classByName.set(k, c); }
  const usedInSeq = new Set<string>();
  for (const q of seqs) for (const p of (q.data.participants ?? []) as { name: string }[]) { const c = classByName.get(partName(p.name)); if (c) usedInSeq.add(c.id); }
  if (classes.length > 1)
    for (const c of classes)
      if (!edges.some((e) => e.source === c.id || e.target === c.id) && !usedInSeq.has(c.id))
        push('uml/unused-class', c.id, `${label(c.id)} has no relations to any other class.`, [c.id], { fix: { kind: 'remove-node', label: `Delete ${label(c.id)}`, nodeId: c.id } });

  // methods of a class: its own plus everything it inherits or realizes
  const parents = new Map<string, string[]>();
  for (const e of umlEdges) if (e.data!.uml.kind === 'inheritance' || e.data!.uml.kind === 'realization') parents.set(e.source, [...(parents.get(e.source) ?? []), e.target]);
  const methodsOf = (id: string): Set<string> => {
    const names = new Set<string>();
    const seen = new Set<string>();
    const walk = (x: string) => {
      if (seen.has(x)) return;
      seen.add(x);
      for (const o of (byId.get(x)?.data.operations ?? []) as { name: string }[]) names.add(String(o.name).trim());
      for (const p of parents.get(x) ?? []) walk(p);
    };
    walk(id);
    return names;
  };
  const methodOf = (text: string): string | null => {
    let t = String(text ?? '').trim();
    t = t.replace(/^\d+[.):]\s*/, '');
    const eq = t.indexOf('=');
    if (eq >= 0 && !t.slice(0, eq).includes('(')) t = t.slice(eq + 1).trim();
    t = t.replace(/^(new|await)\s+/, '');
    const m = /^([A-Za-z_$][\w$]*)\s*(\(.*\))?\s*$/.exec(t);
    return m && (m[2] !== undefined || /^[a-z_$]/.test(m[1])) ? m[1] : null;
  };
  const messagesOf = (items: any[], acc: any[] = []): any[] => {
    for (const it of items ?? []) {
      if (it.type === 'message') acc.push(it);
      else if (it.type === 'fragment') for (const sec of it.sections ?? []) messagesOf(sec.items, acc);
    }
    return acc;
  };
  for (const q of seqs) {
    const parts = new Map<string, { name: string }>(((q.data.participants ?? []) as { id: string; name: string }[]).map((p) => [p.id, p]));
    const seen = new Set<string>();
    for (const m of messagesOf(q.data.items)) {
      if (m.kind === 'return' || m.kind === 'create' || m.kind === 'destroy') continue;
      const target = parts.get(m.to);
      const cls = target ? classByName.get(partName(target.name)) : undefined;
      const method = methodOf(m.text);
      if (!cls || !method || cls.data.kind === 'enum') continue;
      const key = `${q.id}:${m.to}:${method}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!methodsOf(cls.id).has(method))
        push('uml/seq-missing-method', key, `${label(q.id)}: message "${String(m.text).trim()}" calls ${method}() on ${target!.name}, but class ${label(cls.id)} has no such method.`, [q.id, cls.id], { fix: { kind: 'add-operation', label: `Add ${method}() to ${label(cls.id)}`, nodeId: cls.id, name: method } });
    }
  }

  // object diagram: every slot of an object names an attribute of its class (own or inherited)
  const attrsOf = (id: string): Set<string> => {
    const names = new Set<string>();
    const seen = new Set<string>();
    const walk = (x: string) => {
      if (seen.has(x)) return;
      seen.add(x);
      for (const a of (byId.get(x)?.data.attributes ?? []) as { name: string }[]) names.add(String(a.name).trim());
      for (const p of parents.get(x) ?? []) walk(p);
    };
    walk(id);
    return names;
  };
  for (const o of page.nodes.filter((n) => n.type === 'object')) {
    const cls = classByName.get(String(o.data.className ?? '').trim().toLowerCase());
    if (!cls || cls.data.kind === 'enum') continue;
    const known = attrsOf(cls.id);
    const seen = new Set<string>();
    for (const sl of (o.data.slots ?? []) as { name: string }[]) {
      const name = String(sl.name ?? '').trim();
      if (!name || known.has(name) || seen.has(name)) continue;
      seen.add(name);
      push('uml/object-unknown-slot', `${o.id}:${name}`, `Object ${label(o.id)}: slot "${name}" is not an attribute of class ${label(cls.id)}.`, [o.id, cls.id]);
    }
  }

  const rank = { error: 0, warning: 1, info: 2 } as const;
  const order = new Map(LINT_RULES.map((r, i) => [r.id, i]));
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || order.get(a.rule)! - order.get(b.rule)! || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

