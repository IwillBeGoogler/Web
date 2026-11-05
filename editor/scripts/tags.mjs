// Tag generation for catalog items (generated rules + curated additions). Pure: no I/O.

/** sub-category id (or section id) -> category tags */
const SUB_TAGS = {
  relational: ['database', 'sql'], document: ['database', 'nosql'], kv: ['database', 'nosql', 'cache'], wide: ['database', 'nosql'],
  'db-search': ['database', 'search'], tsdb: ['database', 'time-series', 'metrics'], graph: ['database', 'nosql', 'graph'],
  olap: ['database', 'analytics', 'data-warehouse'], vector: ['database', 'vector', 'ml'], embedded: ['database'], object: ['storage'], 'db-tools': ['database', 'tooling'], 'db-generic': ['database'],
  brokers: ['messaging', 'queue', 'streaming'], bigdata: ['big-data', 'streaming'], 'asf-stream': ['streaming', 'messaging'], 'asf-bigdata': ['big-data'], 'asf-db': ['database'],
  'asf-formats': ['data-format', 'storage'], 'asf-processing': ['big-data', 'processing'], 'asf-web': ['web'], 'asf-security': ['security'],
  languages: ['language', 'backend'], frameworks: ['framework', 'backend'], protocols: ['protocol', 'network'], web: ['frontend', 'web'], mobile: ['frontend', 'mobile'], ai: ['ml', 'ai'],
  scm: ['scm', 'ci-cd'], cicd: ['ci-cd'], gitops: ['ci-cd', 'gitops', 'k8s'], containers: ['container', 'compute'], orchestration: ['container', 'orchestration', 'compute'], 'k8s-tools': ['k8s', 'container'],
  mesh: ['network', 'service-mesh'], iac: ['iac'], registries: ['container', 'registry', 'ci-cd'], testing: ['testing', 'ci-cd'], chatops: ['chatops', 'ci-cd'], build: ['build', 'ci-cd'], 'devops-os': ['os', 'compute'],
  'grafana-stack': ['monitoring', 'observability'], metrics: ['monitoring', 'metrics'], exporters: ['monitoring', 'metrics'], logs: ['monitoring', 'logs'], traces: ['monitoring', 'tracing'], profiling: ['monitoring', 'profiling'],
  dashboards: ['monitoring', 'dashboards'], alerting: ['monitoring', 'alerting'], uptime: ['monitoring'], errors: ['monitoring', 'error-tracking'], ebpf: ['monitoring', 'ebpf'], 'cloud-mon': ['monitoring', 'cloud'],
  'sec-generic': ['security'], identity: ['security', 'identity', 'auth'], secsec: ['security', 'secrets'], netsec: ['security', 'network'], 'identity-generic': ['security', 'identity', 'auth'],
  payments: ['saas', 'payments'], comms: ['saas', 'communication'], 'backend-saas': ['saas', 'backend'], analytics: ['saas', 'analytics'], maps: ['saas', 'maps'],
  cdc: ['cdc', 'data-integration', 'streaming'], 'kafka-eco': ['streaming', 'messaging', 'kafka'],
  devices: ['network'], 'net-software': ['network', 'proxy'], edge: ['network', 'cdn', 'edge'], compute: ['compute'], os: ['os', 'compute'],
  webservers: ['web', 'network', 'proxy'], gateways: ['network', 'api-gateway'], workflow: ['workflow', 'orchestration'], config: ['config'], discovery: ['network', 'service-discovery'],
  backup: ['backup', 'storage'], virt: ['virtualization', 'compute'], hardware: ['hardware'],
};
const SEC_TAGS = { clients: ['client'], network: ['network'], security: ['security'], cloud: ['cloud'], compute: ['compute'], saas: ['saas'], generic: [] };

/** curated: id -> extra tags (aliases, providers, traits) */
const CURATED = {
  gke: ['k8s', 'container'], aks: ['k8s', 'container'], eks: ['k8s', 'container'], gar: ['container', 'registry'], acr: ['container', 'registry'], ecr: ['container', 'registry'],
  kubernetes: ['k8s', 'cncf', 'container', 'orchestration'], docker: ['container'], prometheus: ['cncf', 'metrics', 'monitoring'],
  postgresql: ['postgres', 'sql'], mysql: ['sql'], mongodb: ['nosql'], redis: ['cache', 'nosql'],
  kafka: ['streaming', 'queue', 'apache'], rabbitmq: ['queue', 'amqp'], terraform: ['iac', 'hashicorp'], vault: ['hashicorp', 'secrets'], consul: ['hashicorp', 'service-discovery'], nomad: ['hashicorp'],
  grafana: ['grafana-labs'], loki: ['grafana-labs', 'logs'], tempo: ['grafana-labs', 'tracing'], mimir: ['grafana-labs', 'metrics'], alloy: ['grafana-labs'], pyroscope: ['grafana-labs', 'profiling'],
  elasticsearch: ['elastic', 'search'], kibana: ['elastic', 'dashboards'], logstash: ['elastic', 'logs'], filebeat: ['elastic', 'logs'], metricbeat: ['elastic', 'metrics'],
  confluent: ['confluent', 'kafka'], ksqldb: ['confluent', 'kafka'], 'schema-registry': ['confluent', 'kafka'], 'kafka-connect': ['confluent', 'kafka', 'cdc'], debezium: ['cdc', 'kafka'],
  lambda: ['serverless'], function: ['serverless'], cloudflare: ['edge', 'cdn'], 'azure-pipelines': ['ci-cd'],
  jenkins: ['ci-cd'], gitlab: ['scm', 'ci-cd'], github: ['scm'], argocd: ['gitops', 'cncf', 'k8s'], flux: ['gitops', 'cncf', 'k8s'],
  istio: ['cncf', 'service-mesh'], envoy: ['cncf', 'proxy'], linkerd: ['cncf', 'service-mesh'], etcd: ['cncf', 'kv'], jaeger: ['cncf', 'tracing'], opentelemetry: ['cncf', 'tracing', 'metrics', 'logs'], 'otel-collector': ['cncf', 'tracing', 'metrics', 'logs'],
  victoriametrics: ['metrics'], victorialogs: ['logs'], vector: ['logs', 'metrics'],
};
const OSS_PROVIDERS = new Set(['apache', 'cncf', 'grafana-labs', 'hashicorp', 'elastic', 'confluent']);

const PROVIDERS = [
  ['aws', /(^|\b)(aws|amazon)(\b|$)|source:logos:aws|source:file:aws-/i],
  ['gcp', /\b(gcp|google cloud|google)\b|source:si:google/i],
  ['azure', /\bazure\b|source:logos:azure/i],
  ['k8s', /\b(k8s|kubernetes)\b/i],
  ['microsoft', /\bmicrosoft\b/i],
  ['oracle', /\boracle\b/i],
  ['ibm', /\bibm\b/i],
  ['redhat', /\bred ?hat|openshift\b/i],
];

/** ordered unique tag list for one catalog definition. */
export function computeTags(def, locations /* [{section, sub}] */) {
  const tags = new Set();
  const hay = `${def.label} ${(def.aliases ?? []).join(' ')} ${def.id} source:${def.source ?? ''}`;
  for (const { section, sub } of locations) {
    for (const t of SUB_TAGS[sub] ?? []) tags.add(t);
    for (const t of SEC_TAGS[section] ?? []) tags.add(t);
    if (section === 'apache') tags.add('apache');
  }
  for (const [p, re] of PROVIDERS) if (re.test(hay)) tags.add(p);
  for (const t of CURATED[def.id] ?? []) tags.add(t);
  const cloudProvider = ['aws', 'gcp', 'azure'].some((p) => tags.has(p));
  if (cloudProvider) {
    tags.add('cloud');
    tags.add('managed');
  } else if ([...tags].some((t) => OSS_PROVIDERS.has(t)) || tags.has('database') || tags.has('monitoring') || tags.has('streaming')) {
    tags.add('open-source');
    tags.add('self-hosted');
  }
  if (!tags.size) tags.add('generic');
  return [...tags];
}
