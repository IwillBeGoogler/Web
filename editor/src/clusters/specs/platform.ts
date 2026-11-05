/* eslint-disable @typescript-eslint/no-explicit-any */
import { azs, bool, comp, defineSpecProfile, grp, lead, num, oddRule, quorum, sel, when, withExporter } from '../spec';

type A = Record<string, any>;
const ORCH = 'Coordination & Orchestration';
const STO = 'Storage';
const NET = 'Networking & Security';
const OBS = 'Observability';
const CICD = 'CI/CD & Identity';

export const nomadProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'nomad', tech: 'Nomad', label: 'Nomad (servers + clients)', iconId: 'nomad', accent: '#00ca8e', category: ORCH, aliases: ['hashicorp nomad cluster'], topologies: ['quorum'], roles: ['leader', 'follower', 'worker'],
  fields: [quorum('servers', 'Servers (Raft)'), num('clients', 'Client nodes', 1, 24, 4), azs(), bool('consul', 'Consul for service discovery', true)], topology: 'quorum',
  groups: [grp('s', 'Nomad servers (Raft)', [comp('server', 'server', (p) => p.servers, { port: 4646, role: lead, noun: 'servers' })], { azSpread: true }), grp('c', 'Nomad clients (run allocations)', [comp('client', 'client', (p) => p.clients, { port: 4646, role: 'worker', noun: 'clients' })], { azSpread: true, maxCols: 6 })],
  externals: [comp('consul', 'Consul', (p) => (p.consul ? 1 : 0), { port: 8500, iconId: 'consul' })],
  links: [{ from: 'server', to: 'server', mode: 'chain', kind: 'heartbeat', label: 'Raft :4647' }, { from: 'server', to: 'client', mode: 'first-to-all', label: 'evals / allocs' }, { from: 'client', to: 'consul', mode: 'first-to-first', label: 'register' }],
  rules: [oddRule('servers', (p) => p.servers)],
  summarize: (p) => `${p.servers} servers · ${p.clients} clients${p.azs > 1 ? ` · ${p.azs} AZ` : ''}`,
}, { target: 'server', port: 4646, label: 'metrics' }));

export const vaultProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'vault', tech: 'Vault', label: 'Vault (integrated Raft storage)', iconId: 'vault', accent: '#ffd814', category: NET, aliases: ['vault raft', 'vault ha'], topologies: ['quorum'], roles: ['leader', 'follower', 'standby'],
  fields: [quorum('nodes', 'Vault nodes (Raft voters)'), num('perf', 'Performance standbys (non-voting)', 0, 4, 0), sel('unseal', 'Auto-unseal', [['kms', 'Cloud KMS / HSM'], ['transit', 'Transit (another Vault)'], ['shamir', 'Shamir (manual)']], 'kms'), bool('lb', 'Load balancer', true), azs()], topology: 'quorum',
  groups: [grp('v', 'Vault nodes (active + standbys)', [comp('node', 'vault', (p) => p.nodes, { port: 8200, role: (i) => (i === 0 ? 'leader' : 'standby'), noun: 'nodes' }), comp('perf', 'perf-standby', (p) => p.perf, { port: 8200, role: 'follower', noun: 'performance standbys' })], { azSpread: true })],
  externals: [comp('lb', 'Load balancer', (p) => (p.lb ? 1 : 0), { port: 8200, iconId: 'load-balancer' }), comp('kms', 'KMS / HSM', (p) => (p.unseal === 'kms' ? 1 : 0), { iconId: 'secrets' }), comp('transit', 'transit Vault', (p) => (p.unseal === 'transit' ? 1 : 0), { port: 8200, iconId: 'vault' })],
  links: [{ from: 'node', to: 'node', mode: 'chain', kind: 'replication', replMode: 'sync', label: 'Raft :8201' }, { from: 'node', to: 'perf', mode: 'first-to-all', kind: 'replication', replMode: 'async' }, { from: 'lb', to: 'node', mode: 'first-to-first', label: 'active node' }, { from: 'node', to: 'kms', mode: 'first-to-first', label: 'unseal' }, { from: 'node', to: 'transit', mode: 'first-to-first', label: 'unseal' }],
  rules: [oddRule('Vault nodes', (p) => p.nodes), when((p) => p.unseal === 'shamir', 'Shamir unseal: every restart needs manual key holders; prefer auto-unseal for HA.')],
  summarize: (p) => `${p.nodes} voters${p.perf ? ` + ${p.perf} perf standby` : ''} · unseal ${p.unseal}`,
}, { target: 'node', port: 8200, label: 'telemetry' }));

export const kubernetesProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'kubernetes', tech: 'Kubernetes', label: 'Kubernetes (HA control plane + worker pools)', iconId: 'kubernetes', accent: '#326ce5', category: ORCH, aliases: ['k8s cluster', 'kubernetes ha', 'eks cluster', 'kubeadm ha'], topologies: ['tiered'], roles: ['controller', 'worker'],
  fields: [quorum('cp', 'Control-plane nodes'), num('workers', 'On-demand workers', 1, 30, 3), num('spot', 'Spot / burst workers', 0, 20, 0), sel('etcd', 'etcd topology', [['stacked', 'Stacked (on control plane)'], ['external', 'External etcd']], 'stacked'), azs(), bool('lb', 'API server load balancer', true), bool('ingress', 'Ingress controller', true)], topology: 'tiered',
  groups: [
    grp('cp', 'Control plane (apiserver, scheduler, controller-manager)', [comp('cp', 'cp', (p) => p.cp, { port: 6443, role: 'controller', noun: 'control-plane nodes' })], { azSpread: true }),
    grp('etcd', 'etcd (external)', [comp('etcd', 'etcd', (p) => p.cp, { port: 2379, role: lead, iconId: 'etcd', noun: 'etcd nodes' })], { show: (p) => p.etcd === 'external' }),
    grp('w', 'Worker pools (kubelet)', [comp('worker', 'worker', (p) => p.workers, { role: 'worker', noun: 'workers' }), comp('spotw', 'spot', (p) => p.spot, { role: 'worker', sub: 'spot', noun: 'spot workers' })], { azSpread: true, maxCols: 6 }),
  ],
  externals: [comp('lb', 'API LB', (p) => (p.lb ? 1 : 0), { port: 6443, iconId: 'load-balancer' }), comp('ingress', 'Ingress', (p) => (p.ingress ? 1 : 0), { port: 443, iconId: 'nginx' })],
  links: [{ from: 'cp', to: 'cp', mode: 'chain', kind: 'heartbeat', label: 'etcd Raft :2380', show: (p) => p.etcd === 'stacked' }, { from: 'etcd', to: 'etcd', mode: 'chain', kind: 'heartbeat', label: 'Raft' }, { from: 'cp', to: 'etcd', mode: 'first-to-first', show: (p) => p.etcd === 'external' }, { from: 'lb', to: 'cp', mode: 'first-to-all' }, { from: 'cp', to: 'worker', mode: 'first-to-first', label: 'kubelet :10250' }, { from: 'ingress', to: 'worker', mode: 'first-to-first', label: 'NodePort' }],
  rules: [oddRule('control-plane nodes', (p) => p.cp), when((p) => p.azs > 1 && p.cp < 3, 'Multi-AZ with fewer than 3 control-plane nodes: losing an AZ can lose etcd quorum.'), when((p) => p.azs > p.workers + p.spot, 'More AZs than workers: some AZs get no capacity.')],
  summarize: (p) => `${p.cp} control-plane · ${p.workers}${p.spot ? `+${p.spot} spot` : ''} workers${p.azs > 1 ? ` · ${p.azs} AZ` : ''}`,
}, { target: 'worker', port: 9100, label: 'node-exporter' }));

export const k3sProfile = defineSpecProfile<A>({
  id: 'k3s', tech: 'k3s', label: 'k3s (lightweight Kubernetes)', iconId: 'k3s', accent: '#ffc61c', category: ORCH, aliases: ['k3s cluster', 'rancher k3s', 'edge kubernetes'], topologies: ['hub-spoke'], roles: ['controller', 'worker'],
  fields: [sel('datastore', 'Datastore', [['etcd', 'Embedded etcd (HA)'], ['sqlite', 'SQLite (single server)'], ['external', 'External SQL (PostgreSQL / MySQL)']], 'etcd'), sel('servers', 'Server nodes', [[1, '1'], [3, '3'], [5, '5']], 3), num('agents', 'Agent nodes', 0, 30, 3), bool('lb', 'Fixed registration address (LB / kube-vip)', true)], topology: 'hub-spoke',
  groups: [grp('s', 'k3s servers', [comp('server', 'server', (p) => p.servers, { port: 6443, role: 'controller', noun: 'servers' })]), grp('a', 'k3s agents', [comp('agent', 'agent', (p) => p.agents, { port: 10250, role: 'worker', noun: 'agents' })], { maxCols: 6, show: (p) => p.agents > 0 })],
  externals: [comp('lb', 'kube-vip / LB', (p) => (p.lb ? 1 : 0), { port: 6443, iconId: 'load-balancer' }), comp('db', 'external datastore', (p) => (p.datastore === 'external' ? 1 : 0), { port: 5432, iconId: 'postgresql' })],
  links: [{ from: 'server', to: 'server', mode: 'chain', kind: 'heartbeat', label: 'etcd :2380', show: (p) => p.datastore === 'etcd' }, { from: 'server', to: 'db', mode: 'all-to-first', show: (p) => p.datastore === 'external' }, { from: 'server', to: 'agent', mode: 'first-to-first', label: 'tunnel' }, { from: 'agent', to: 'lb', mode: 'first-to-first', label: 'register :6443' }, { from: 'lb', to: 'server', mode: 'first-to-all' }],
  rules: [when((p) => p.datastore === 'etcd' && p.servers === 1, 'Embedded etcd with one server is not HA; use 3 servers.'), when((p) => p.datastore === 'sqlite' && p.servers > 1, 'SQLite cannot be shared by several servers; pick embedded etcd or an external SQL datastore.'), when((p) => p.datastore === 'external' && p.servers < 2, 'External datastore with one server: server is still a single point of failure.')],
  summarize: (p) => `${p.servers} server${p.servers === 1 ? '' : 's'} (${p.datastore}) · ${p.agents} agents`,
});

export const swarmProfile = defineSpecProfile<A>({
  id: 'docker-swarm', tech: 'Docker Swarm', label: 'Docker Swarm', iconId: 'swarm', accent: '#2496ed', category: ORCH, aliases: ['swarm cluster', 'docker swarm'], topologies: ['quorum'], roles: ['leader', 'follower', 'worker'],
  fields: [quorum('managers', 'Managers (Raft)'), num('workers', 'Workers', 0, 30, 4), azs(), bool('ingress', 'Routing mesh LB', true)], topology: 'quorum',
  groups: [grp('m', 'Managers', [comp('manager', 'manager', (p) => p.managers, { port: 2377, role: lead, noun: 'managers' })], { azSpread: true }), grp('w', 'Workers', [comp('worker', 'worker', (p) => p.workers, { role: 'worker', noun: 'workers' })], { maxCols: 6, show: (p) => p.workers > 0 })],
  externals: [comp('lb', 'Load balancer', (p) => (p.ingress ? 1 : 0), { iconId: 'load-balancer' })],
  links: [{ from: 'manager', to: 'manager', mode: 'chain', kind: 'heartbeat', label: 'Raft :2377' }, { from: 'manager', to: 'worker', mode: 'first-to-first', label: 'tasks' }, { from: 'worker', to: 'worker', mode: 'chain', kind: 'heartbeat', label: 'gossip :7946' }, { from: 'lb', to: 'worker', mode: 'first-to-all', label: 'routing mesh :4789' }],
  rules: [oddRule('managers', (p) => p.managers), when((p) => p.managers > 7, 'Docker recommends at most 7 managers.')],
  summarize: (p) => `${p.managers} managers · ${p.workers} workers`,
});

export const cephProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'ceph', tech: 'Ceph', label: 'Ceph (MON / MGR / OSD)', iconId: 'ceph', accent: '#ef5c55', category: STO, aliases: ['ceph cluster', 'rook ceph'], topologies: ['tiered'], roles: ['leader', 'follower', 'data', 'coordinator'],
  fields: [quorum('mons', 'Monitors (Paxos)'), num('mgrs', 'Managers', 1, 3, 2), num('osds', 'OSD hosts', 3, 24, 3), num('replicas', 'Pool size (replicas)', 1, 5, 3), bool('mds', 'CephFS metadata (MDS)', false), bool('rgw', 'Object gateway (RGW)', false), azs()], topology: 'tiered',
  groups: [grp('mon', 'Monitors + managers', [comp('mon', 'mon', (p) => p.mons, { port: 3300, role: lead, noun: 'monitors' }), comp('mgr', 'mgr', (p) => p.mgrs, { port: 8443, role: (i) => (i === 0 ? 'leader' : 'standby'), noun: 'managers' })]), grp('osd', (p) => `OSDs (CRUSH, size ${p.replicas}, failure domain ${p.azs > 1 ? 'rack/AZ' : 'host'})`, [comp('osd', 'osd', (p) => p.osds, { port: 6800, role: 'data', noun: 'OSD hosts' })], { azSpread: true, maxCols: 6 }), grp('svc', 'Gateways', [comp('mds', 'mds', (p) => (p.mds ? 2 : 0), { port: 6800, role: 'coordinator' }), comp('rgw', 'rgw', (p) => (p.rgw ? 2 : 0), { port: 7480, role: 'coordinator' })], { show: (p) => p.mds || p.rgw })],
  links: [{ from: 'mon', to: 'mon', mode: 'chain', kind: 'heartbeat', label: 'Paxos' }, { from: 'mon', to: 'osd', mode: 'first-to-first', label: 'cluster map' }, { from: 'osd', to: 'osd', mode: 'chain', kind: 'replication', replMode: 'sync', label: 'replicate' }, { from: 'mds', to: 'osd', mode: 'first-to-first' }, { from: 'rgw', to: 'osd', mode: 'first-to-first' }],
  rules: [oddRule('monitors', (p) => p.mons), when((p) => p.replicas > p.osds, 'Pool size exceeds the number of OSD hosts: PGs stay degraded (failure domain = host).'), when((p) => p.replicas === 1, 'Pool size 1: no redundancy.'), when((p) => p.replicas === 2, 'Pool size 2: min_size 2 stops IO on one failure, min_size 1 risks data loss; use 3.')],
  summarize: (p) => `${p.mons} mon · ${p.mgrs} mgr · ${p.osds} OSD hosts · size ${p.replicas}`,
}, { target: 'mgr', port: 9283, label: 'mgr/prometheus' }));

export const minioProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'minio', tech: 'MinIO', label: 'MinIO (distributed, erasure coded)', iconId: 'minio', accent: '#c72c48', category: STO, aliases: ['minio distributed', 's3 cluster'], topologies: ['ring'], roles: ['data'],
  fields: [num('nodes', 'Nodes', 4, 16, 4), num('drives', 'Drives per node', 1, 24, 4), num('parity', 'Parity (EC:N)', 2, 8, 4), bool('lb', 'Load balancer (S3 :9000)', true), azs()], topology: 'ring',
  groups: [grp('n', (p) => `Server pool (${p.nodes * p.drives} drives, EC:${p.parity})`, [comp('node', 'minio', (p) => p.nodes, { port: 9000, role: 'data', sub: (_i, _n, p) => `${p.drives} drives`, noun: 'nodes' })], { azSpread: true, maxCols: 8 })],
  externals: [comp('lb', 'Load balancer', (p) => (p.lb ? 1 : 0), { port: 9000, iconId: 'load-balancer' })],
  links: [{ from: 'node', to: 'node', mode: 'mesh', kind: 'replication', replMode: 'sync', label: 'erasure set', show: (p) => p.nodes <= 6, data: { arrows: 'both' } }, { from: 'node', to: 'node', mode: 'ring', kind: 'replication', replMode: 'sync', show: (p) => p.nodes > 6 }, { from: 'lb', to: 'node', mode: 'first-to-all' }],
  rules: [when((p) => p.parity > (p.nodes * p.drives) / 2, 'Parity cannot exceed half of the drives in an erasure set.'), when((p) => (p.nodes * p.drives) % 2 === 1, 'Odd total drive count: erasure sets use an even number of drives.'), when((p) => p.nodes * p.drives < 4, 'MinIO distributed mode needs at least 4 drives.')],
  summarize: (p) => `${p.nodes} nodes x ${p.drives} drives · EC:${p.parity}`,
}, { target: 'node', port: 9000, label: 'minio-prom' }));

export const longhornProfile = defineSpecProfile<A>({
  id: 'longhorn', tech: 'Longhorn', label: 'Longhorn (replicated block storage)', iconId: 'longhorn', accent: '#5f224a', category: STO, aliases: ['longhorn volumes'], topologies: ['shard-matrix'], roles: ['primary', 'replica', 'controller'],
  fields: [num('nodes', 'Storage nodes', 1, 12, 3), num('replicas', 'Replica count per volume', 1, 5, 3), num('volumes', 'Volumes shown', 1, 6, 2), azs()], topology: 'shard-matrix',
  groups: [grp('v', (p) => `Volumes (${p.replicas} replicas each)`, [comp('engine', 'engine', (p) => p.volumes, { role: 'primary', noun: 'volume engines' }), comp('r2', 'replica', (p) => (p.replicas >= 2 ? p.volumes : 0), { role: 'replica', noun: 'replicas' }), comp('r3', 'replica-b', (p) => (p.replicas >= 3 ? p.volumes : 0), { role: 'replica', noun: 'replicas' })], { maxCols: 6 }), grp('n', 'Storage nodes (disks)', [comp('node', 'node', (p) => p.nodes, { iconId: 'disk', role: 'data', noun: 'nodes' })], { azSpread: true })],
  links: [{ from: 'engine', to: 'r2', mode: 'pair', kind: 'replication', replMode: 'sync' }, { from: 'engine', to: 'r3', mode: 'pair', kind: 'replication', replMode: 'sync' }],
  rules: [when((p) => p.replicas > p.nodes, 'Replica count exceeds storage nodes: replicas get scheduled on the same node (or stay degraded).'), when((p) => p.replicas === 1, 'One replica: volume is lost with its node.')],
  summarize: (p) => `${p.nodes} nodes · ${p.replicas} replicas/volume`,
});

export const haproxyKeepalivedProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'haproxy-keepalived', tech: 'HAProxy + Keepalived', label: 'HAProxy + Keepalived (floating VIP)', iconId: 'haproxy', accent: '#106da9', category: NET, aliases: ['vrrp', 'floating ip', 'virtual ip', 'ha load balancer'], topologies: ['active-passive'], roles: ['master', 'standby', 'worker'],
  fields: [num('lbs', 'HAProxy nodes', 2, 4, 2), num('backends', 'Backend servers', 1, 12, 3), sel('algo', 'Balance algorithm', [['roundrobin', 'roundrobin'], ['leastconn', 'leastconn'], ['source', 'source (sticky)']], 'roundrobin'), azs()], topology: 'active-passive',
  groups: [grp('lb', 'HAProxy + Keepalived (VRRP)', [comp('lb', 'haproxy', (p) => p.lbs, { port: 443, role: (i) => (i === 0 ? 'master' : 'standby'), noun: 'haproxy nodes' })], { azSpread: true }), grp('be', (p) => `Backends (${p.algo})`, [comp('be', 'backend', (p) => p.backends, { port: 8080, iconId: 'server', role: 'worker', noun: 'backends' })], { maxCols: 6 })],
  externals: [comp('vip', 'VIP', 1, { port: 443, iconId: 'keepalived' })],
  links: [{ from: 'lb', to: 'lb', mode: 'chain', kind: 'heartbeat', label: 'VRRP' }, { from: 'vip', to: 'lb', mode: 'first-to-first', kind: 'failover', label: 'floats to master' }, { from: 'lb', to: 'be', mode: 'first-to-all', label: 'health-checked' }],
  rules: [when((p) => p.backends < 2, 'One backend: the load balancer adds HA at the edge only.')],
  summarize: (p) => `${p.lbs} HAProxy (1 master + ${p.lbs - 1} standby) · ${p.backends} backends · ${p.algo}`,
}, { target: 'lb', port: 9101, label: 'haproxy-exporter', iconId: 'prometheus' }));

export const istioProfile = defineSpecProfile<A>({
  id: 'istio', tech: 'Istio', label: 'Istio service mesh', iconId: 'istio', accent: '#466bb0', category: NET, aliases: ['service mesh', 'istio mesh', 'envoy mesh'], topologies: ['hub-spoke'], roles: ['controller', 'coordinator', 'worker'],
  fields: [num('istiod', 'istiod replicas', 1, 5, 2), num('ingress', 'Ingress gateways', 1, 4, 2), num('egress', 'Egress gateways', 0, 3, 0), num('services', 'Meshed services', 1, 8, 3), bool('mtls', 'Strict mTLS', true)], topology: 'hub-spoke',
  groups: [grp('cp', 'Control plane (istio-system)', [comp('istiod', 'istiod', (p) => p.istiod, { port: 15012, role: 'controller', noun: 'istiod' })]), grp('gw', 'Gateways', [comp('ingress', 'ingress-gw', (p) => p.ingress, { port: 443, role: 'coordinator', iconId: 'envoy', noun: 'ingress gateways' }), comp('egress', 'egress-gw', (p) => p.egress, { port: 443, role: 'coordinator', iconId: 'envoy', noun: 'egress gateways' })]), grp('dp', 'Data plane (Envoy sidecars)', [comp('svc', 'svc+envoy', (p) => p.services, { role: 'worker', iconId: 'envoy', noun: 'meshed services' })], { maxCols: 6 })],
  links: [{ from: 'istiod', to: 'ingress', mode: 'first-to-first', label: 'xDS' }, { from: 'istiod', to: 'svc', mode: 'first-to-all', label: 'xDS (config + certs)', data: { strokeStyle: 'dashed' } as never }, { from: 'ingress', to: 'svc', mode: 'first-to-first', label: 'mTLS', show: (p) => p.mtls }, { from: 'ingress', to: 'svc', mode: 'first-to-first', show: (p) => !p.mtls }, { from: 'svc', to: 'svc', mode: 'chain', label: 'mTLS', show: (p) => p.mtls }, { from: 'svc', to: 'egress', mode: 'first-to-first' }],
  rules: [when((p) => p.istiod < 2, 'Single istiod: running proxies keep working, but no config / cert updates during an outage.'), when((p) => p.ingress < 2, 'Single ingress gateway: single point of failure at the edge.'), when((p) => !p.mtls, 'mTLS is permissive/off: traffic between services is unauthenticated.')],
  summarize: (p) => `${p.istiod} istiod · ${p.ingress} ingress · ${p.services} meshed services · ${p.mtls ? 'strict mTLS' : 'mTLS off'}`,
});

export const prometheusHaProfile = defineSpecProfile<A>({
  id: 'prometheus-ha', tech: 'Prometheus', label: 'Prometheus HA pair (+ Thanos sidecar)', iconId: 'prometheus', accent: '#e6522c', category: OBS, aliases: ['prometheus cluster', 'prometheus ha'], topologies: ['active-active'], roles: ['data', 'coordinator'],
  fields: [num('replicas', 'Identical replicas', 2, 4, 2), num('targets', 'Scrape targets', 1, 6, 3), sel('am', 'Alertmanagers (gossip)', [[0, 'none'], [3, '3']], 3), bool('thanos', 'Thanos sidecars', false)], topology: 'active-active',
  groups: [grp('p', 'Prometheus replicas (same config, same scrapes)', [comp('prom', 'prometheus', (p) => p.replicas, { port: 9090, role: 'data', sub: (i) => `replica="${String.fromCharCode(97 + i)}"`, noun: 'replicas' }), comp('side', 'thanos-sidecar', (p) => (p.thanos ? p.replicas : 0), { port: 10901, iconId: 'thanos', role: 'data' })]), grp('am', 'Alertmanager cluster', [comp('am', 'alertmanager', (p) => p.am, { port: 9093, role: 'coordinator', noun: 'alertmanagers' })], { show: (p) => p.am > 0 })],
  externals: [comp('target', 'target', (p) => p.targets, { port: 9100, iconId: 'server' })],
  links: [{ from: 'target', to: 'prom', mode: 'all-to-first', label: 'scrape' }, { from: 'prom', to: 'side', mode: 'pair' }, { from: 'prom', to: 'am', mode: 'first-to-first', label: 'alerts (fan-out to all AM)' }, { from: 'am', to: 'am', mode: 'mesh', kind: 'heartbeat', label: 'gossip :9094' }],
  rules: [when((p) => p.am === 0, 'No Alertmanager: alerts are not delivered.')],
  summarize: (p) => `${p.replicas} Prometheus replicas${p.am ? ` · ${p.am} AM` : ''}${p.thanos ? ' · Thanos sidecars' : ''}`,
});

export const alertmanagerProfile = defineSpecProfile<A>({
  id: 'alertmanager', tech: 'Alertmanager', label: 'Alertmanager (gossip cluster)', iconId: 'alertmanager', accent: '#e6522c', category: OBS, aliases: ['alertmanager cluster', 'alertmanager ha'], topologies: ['mesh'], roles: ['data'],
  fields: [num('nodes', 'Alertmanagers', 2, 5, 3), num('senders', 'Prometheus senders', 1, 4, 2), sel('receiver', 'Receiver', [['pagerduty', 'PagerDuty / Opsgenie'], ['slack', 'Slack'], ['email', 'Email']], 'pagerduty')], topology: 'mesh',
  groups: [grp('am', 'Alertmanager (gossip mesh :9094)', [comp('am', 'alertmanager', (p) => p.nodes, { port: 9093, role: 'data', noun: 'alertmanagers' })], { layout: (p) => (p.nodes > 3 ? 'ring' : 'rows') })],
  externals: [comp('prom', 'prometheus', (p) => p.senders, { port: 9090, iconId: 'prometheus' }), comp('rcv', 'receiver', 1, { iconId: 'service' })],
  links: [{ from: 'am', to: 'am', mode: 'mesh', kind: 'heartbeat', label: 'gossip', data: { arrows: 'both' } }, { from: 'prom', to: 'am', mode: 'all-to-all', label: 'send to ALL' }, { from: 'am', to: 'rcv', mode: 'first-to-first', label: 'deduplicated' }],
  summarize: (p) => `${p.nodes} Alertmanagers · ${p.senders} Prometheus · ${p.receiver}`,
});

export const grafanaHaProfile = defineSpecProfile<A>({
  id: 'grafana-ha', tech: 'Grafana', label: 'Grafana HA', iconId: 'grafana', accent: '#f46800', category: OBS, aliases: ['grafana cluster'], topologies: ['active-active'], roles: ['primary', 'data'],
  fields: [num('nodes', 'Grafana instances', 2, 8, 2), sel('db', 'Shared database', [['postgresql', 'PostgreSQL'], ['mysql', 'MySQL']], 'postgresql'), bool('lb', 'Load balancer', true), bool('alerting', 'Unified alerting HA (gossip)', true), num('sources', 'Datasources', 1, 4, 2)], topology: 'active-active',
  groups: [grp('g', 'Grafana (stateless)', [comp('graf', 'grafana', (p) => p.nodes, { port: 3000, role: 'primary', noun: 'instances' })])],
  externals: [comp('lb', 'Load balancer', (p) => (p.lb ? 1 : 0), { port: 443, iconId: 'load-balancer' }), comp('db', 'postgresql', (p) => (p.db === 'postgresql' ? 1 : 0), { port: 5432, iconId: 'postgresql' }), comp('db', 'mysql', (p) => (p.db === 'mysql' ? 1 : 0), { port: 3306, iconId: 'mysql' }), comp('ds', 'datasource', (p) => p.sources, { iconId: 'prometheus' })],
  links: [{ from: 'lb', to: 'graf', mode: 'first-to-all' }, { from: 'graf', to: 'db', mode: 'all-to-first', label: 'dashboards / sessions' }, { from: 'graf', to: 'graf', mode: 'mesh', kind: 'heartbeat', label: 'alert gossip :9094', show: (p) => p.alerting && p.nodes <= 4, data: { arrows: 'both' } }, { from: 'graf', to: 'ds', mode: 'first-to-first' }],
  rules: [when((p) => !p.lb, 'No load balancer: clients pin to a single instance.')],
  summarize: (p) => `${p.nodes} instances · ${p.db}${p.alerting ? ' · HA alerting' : ''}`,
});

export const jenkinsProfile = defineSpecProfile<A>({
  id: 'jenkins', tech: 'Jenkins', label: 'Jenkins (controller + agents)', iconId: 'jenkins', accent: '#d33833', category: CICD, aliases: ['jenkins controller', 'jenkins agents'], topologies: ['hub-spoke'], roles: ['primary', 'standby', 'worker'],
  fields: [bool('standby', 'Cold standby controller', false), num('agents', 'Static agents', 0, 20, 3), num('k8sAgents', 'Dynamic (Kubernetes) agents', 0, 10, 2), bool('scm', 'SCM webhook source', true)], topology: 'hub-spoke',
  groups: [grp('c', 'Controller (single active)', [comp('ctl', 'controller', 1, { port: 8080, role: 'primary' }), comp('stby', 'controller-standby', (p) => (p.standby ? 1 : 0), { port: 8080, role: 'standby' })]), grp('a', 'Build agents (JNLP :50000)', [comp('agent', 'agent', (p) => p.agents, { role: 'worker', iconId: 'server', noun: 'agents' }), comp('pod', 'k8s-agent', (p) => p.k8sAgents, { role: 'worker', iconId: 'k8s-pod', sub: 'ephemeral', noun: 'pod agents' })], { maxCols: 6, show: (p) => p.agents + p.k8sAgents > 0 })],
  externals: [comp('scm', 'SCM', (p) => (p.scm ? 1 : 0), { iconId: 'gitlab' })],
  links: [{ from: 'scm', to: 'ctl', mode: 'first-to-first', label: 'webhook' }, { from: 'ctl', to: 'agent', mode: 'first-to-all', label: 'jobs' }, { from: 'ctl', to: 'pod', mode: 'first-to-all', label: 'spawn' }, { from: 'ctl', to: 'stby', mode: 'first-to-first', kind: 'failover', label: 'shared home volume' }],
  rules: [when((p) => p.agents + p.k8sAgents === 0, 'No agents: builds run on the controller; set the controller to 0 executors and add agents.')],
  summarize: (p) => `1 controller${p.standby ? ' + standby' : ''} · ${p.agents} agents · ${p.k8sAgents} k8s agents`,
});

export const gitlabRunnerProfile = defineSpecProfile<A>({
  id: 'gitlab-runner', tech: 'GitLab Runner', label: 'GitLab Runner fleet', iconId: 'gitlab', accent: '#fc6d26', category: CICD, aliases: ['runner fleet', 'gitlab ci runners', 'gitlab runners'], topologies: ['hub-spoke'], roles: ['coordinator', 'worker'],
  fields: [num('managers', 'Runner managers', 1, 6, 2), num('executors', 'Executors per manager', 1, 6, 3), sel('executor', 'Executor', [['docker', 'Docker'], ['kubernetes', 'Kubernetes'], ['shell', 'Shell']], 'docker'), bool('cache', 'Shared cache (S3 / MinIO)', true), bool('registry', 'Container registry', false)], topology: 'hub-spoke',
  groups: [grp('m', 'Runner managers', [comp('mgr', 'runner', (p) => p.managers, { role: 'coordinator', noun: 'runners' })]), grp('e', (p) => `Executors (${p.executor})`, [comp('exec', 'job', (p) => p.managers * p.executors, { role: 'worker', iconId: 'docker', noun: 'executors' })], { maxCols: 6 })],
  externals: [comp('gl', 'GitLab', 1, { port: 443, iconId: 'gitlab' }), comp('cache', 'cache', (p) => (p.cache ? 1 : 0), { port: 9000, iconId: 'minio' }), comp('reg', 'registry', (p) => (p.registry ? 1 : 0), { port: 5000, iconId: 'docker' })],
  links: [{ from: 'mgr', to: 'gl', mode: 'all-to-first', label: 'poll jobs (HTTPS)' }, { from: 'mgr', to: 'exec', mode: 'pair', label: 'spawn' }, { from: 'exec', to: 'cache', mode: 'first-to-first', label: 'cache' }, { from: 'exec', to: 'reg', mode: 'first-to-first', label: 'push' }],
  rules: [when((p) => p.managers < 2, 'Single runner manager: no capacity when it restarts.')],
  summarize: (p) => `${p.managers} managers x ${p.executors} ${p.executor} executors`,
});

export const keycloakProfile = defineSpecProfile<A>(withExporter<A>({
  id: 'keycloak', tech: 'Keycloak', label: 'Keycloak (clustered, Infinispan)', iconId: 'keycloak', accent: '#4d4d4d', category: CICD, aliases: ['keycloak cluster', 'sso cluster'], topologies: ['active-active'], roles: ['primary'],
  fields: [num('nodes', 'Keycloak nodes', 2, 8, 3), sel('db', 'Database', [['postgresql', 'PostgreSQL'], ['mysql', 'MySQL']], 'postgresql'), bool('lb', 'Load balancer', true), sel('discovery', 'Cache discovery', [['jdbc', 'JDBC_PING'], ['dns', 'DNS_PING (Kubernetes)']], 'jdbc'), azs()], topology: 'active-active',
  groups: [grp('k', 'Keycloak nodes (distributed Infinispan caches)', [comp('kc', 'keycloak', (p) => p.nodes, { port: 8443, role: 'primary', noun: 'nodes' })], { azSpread: true })],
  externals: [comp('lb', 'Load balancer', (p) => (p.lb ? 1 : 0), { port: 443, iconId: 'load-balancer' }), comp('db', 'postgresql', (p) => (p.db === 'postgresql' ? 1 : 0), { port: 5432, iconId: 'postgresql' }), comp('db', 'mysql', (p) => (p.db === 'mysql' ? 1 : 0), { port: 3306, iconId: 'mysql' })],
  links: [{ from: 'kc', to: 'kc', mode: 'ring', kind: 'heartbeat', label: 'JGroups :7800' }, { from: 'lb', to: 'kc', mode: 'first-to-all' }, { from: 'kc', to: 'db', mode: 'all-to-first', label: 'JDBC' }],
  rules: [when((p) => !p.lb, 'No load balancer in front of the nodes: sessions are not distributed.')],
  summarize: (p) => `${p.nodes} nodes · ${p.db} · ${p.discovery === 'jdbc' ? 'JDBC_PING' : 'DNS_PING'}`,
}, { target: 'kc', port: 9000, label: 'metrics' }));

export const PLATFORM_PROFILES = [nomadProfile, vaultProfile, kubernetesProfile, k3sProfile, swarmProfile, cephProfile, minioProfile, longhornProfile, haproxyKeepalivedProfile, istioProfile, prometheusHaProfile, alertmanagerProfile, grafanaHaProfile, jenkinsProfile, gitlabRunnerProfile, keycloakProfile];
