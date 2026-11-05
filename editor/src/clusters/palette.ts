import { withTags, type CatalogItem, type CatalogSection, type CatalogSub } from '../data/catalog';
import { PROFILES } from './profiles';
import type { ClusterProfile } from './profiles/types';

/** category of the hand-written (non-spec) profiles */
const LEGACY_CATEGORY: Record<string, string> = {
  kafka: 'Messaging', rabbitmq: 'Messaging', quorum: 'Coordination & Orchestration',
  elasticsearch: 'Search & Analytics', clickhouse: 'Search & Analytics',
};
/** extra search aliases for the hand-written profiles */
const LEGACY_ALIASES: Record<string, string[]> = {
  postgresql: ['pg cluster', 'postgres cluster', 'patroni', 'pg ha'], mysql: ['innodb cluster', 'mysql replication', 'group replication'], mongodb: ['mongo replica set', 'mongo cluster', 'replica set'],
  redis: ['redis sentinel', 'redis cluster'], cassandra: ['cassandra ring', 'cassandra dc'], elasticsearch: ['es cluster', 'elk', 'elastic cluster'], clickhouse: ['ch cluster', 'clickhouse keeper'],
  kafka: ['kafka brokers', 'kraft', 'msk'], rabbitmq: ['rmq cluster', 'amqp cluster', 'mirrored queues'], quorum: ['etcd cluster', 'zookeeper ensemble', 'consul servers', 'raft'],
};
type WithMeta = ClusterProfile & { category?: string; aliases?: string[] };
export const categoryOf = (p: ClusterProfile): string => (p as WithMeta).category ?? LEGACY_CATEGORY[p.id] ?? 'Databases';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Palette section "Clusters" with one sub-section per category (shown as "Clusters › <category>"); one item per profile (opens the wizard). */
export function clusterSection(): CatalogSection {
  const byCat = new Map<string, CatalogItem[]>();
  for (const p of PROFILES) {
    const extra = [...((p as WithMeta).aliases ?? []), ...(LEGACY_ALIASES[p.id] ?? [])];
    const item = withTags([{
      id: `cluster-${p.id}`, label: `${p.tech} cluster`, kind: 'cluster' as const, iconId: p.iconId, profileId: p.id,
      aliases: [...new Set([`${p.tech} ha`, `${p.id} cluster`, ...extra, ...p.topologies])], keywords: ['cluster', 'replication', 'ha', 'quorum', p.tech.toLowerCase(), ...p.label.toLowerCase().split(/\W+/).filter((w) => w.length > 2)],
      tags: ['cluster', 'ha', p.tech.toLowerCase()],
    }])[0];
    const cat = categoryOf(p);
    byCat.set(cat, [...(byCat.get(cat) ?? []), item]);
  }
  const subs: CatalogSub[] = [...byCat.entries()].map(([cat, items]) => ({ id: `clusters-${slug(cat)}`, label: cat, items }));
  return { id: 'clusters', label: 'Clusters', subs, count: subs.reduce((n, s) => n + s.items.length, 0) };
}
