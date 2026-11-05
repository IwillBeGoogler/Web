// node scripts/build-gcp-icons.ts <extracted google-cloud-icons dir>   (https://cloud.google.com/icons)
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProvider, normLabel } from './cloudpack.mjs';
import { CATALOG_DEFS } from '../src/data/catalog.generated.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] ?? process.env.GCP_ICON_DIR;
if (!src || !existsSync(src)) throw new Error('usage: node scripts/build-gcp-icons.ts <extracted Google Cloud icons dir>');

const SUBS: [string, string, RegExp, string[]][] = [
  ['ai', 'AI & Machine Learning', /^(ai_|automl|agent_assist|dialogflow|document_ai|recommendations|speech|text-to|translation|cloud_translation|cloud_vision|cloud_natural|cloud_inference|cloud_jobs|contact_center|healthcare_nlp|media_translation|vertex|tensorflow|data_labeling|advanced_agent|cloud_optimization|retail_api|cloud_tpu|cloud_gpu|data_qna|visual_inspection|genomics)/, ['ml', 'ai']],
  ['containers', 'Containers & Kubernetes', /^(google_kubernetes|gke|anthos|kuberun|cloud_run|container_|migrate_for_anthos|artifact_registry|binary_authorization)/, ['container', 'k8s']],
  ['compute', 'Compute', /^(compute_engine|app_engine|cloud_functions|batch|cloud_gpu|bare_metal|local_ssd|gce_|os_|cloud_scheduler|cloud_tasks|game_servers|migrate_for_compute|launcher|vmware)/, ['compute']],
  ['databases', 'Databases', /^(cloud_sql|cloud_spanner|bigtable|firestore|datastore|memorystore|database_migration|alloydb|datastream)/, ['database']],
  ['storage', 'Storage', /^(cloud_storage|persistent_disk|filestore|data_transfer|transfer|storage|datashare)/, ['storage']],
  ['analytics', 'Data analytics', /^(bigquery|dataflow|dataproc|dataplex|dataprep|datalab|data_catalog|data_fusion|cloud_data_fusion|composer|cloud_composer|pubsub|looker|data_studio|analytics_hub|data_layers|datapol|stream_suite|dataproc_metastore|cloud_healthcare|healthcare)/, ['analytics']],
  ['network', 'Networking', /^(cloud_load|cloud_cdn|cloud_dns|cloud_armor|cloud_nat|cloud_router|cloud_routes|cloud_vpn|cloud_interconnect|partner_interconnect|cloud_network|cloud_firewall|cloud_external|network_|traffic_director|private_|premium_|standard_|service_discovery|connectivity|virtual_private|cloud_ids|cloud_domains|cloud_media_edge)/, ['network']],
  ['security', 'Security & Identity', /^(identity|iam|key_|secret_|security|certificate|cloud_hsm|cloud_ekm|cloud_kms|access_context|beyondcorp|phishing|risk_manager|policy_analyzer|assured|data_loss|managed_service_for_microsoft|permissions|cloud_security|binary|cloud_audit)/, ['security']],
  ['devtools', 'Developer tools', /^(cloud_build|cloud_code|cloud_deploy|cloud_deployment|cloud_shell|cloud_test|cloud_endpoints|cloud_api_gateway|apigee|api|developer|debugger|profiler|tools_for|source|cloud_apis|runtime_config|eventarc|connectors|cloud_deployment_manager)/, ['devtools']],
  ['operations', 'Operations & Management', /^(stackdriver|cloud_monitoring|cloud_logging|cloud_ops|error_reporting|trace|cloud_asset|asset_inventory|billing|quotas|recommend|release|support|performance|onboarding|project|administration|configuration|catalog|my_cloud|early_access|free_trial|home|network_intelligence|cloud_generic|partner|producer|financial|google_cloud_marketplace|google_maps|advanced_solutions|cloud_for_marketing|iot|cloud_healthcare_marketplace|fleet|cloud_cdn_x)/, ['management', 'monitoring']],
];
const FALLBACK = ['other', 'Other services', [] as string[]] as const;
const LABEL: Record<string, { label: string; aliases?: string[]; tags?: string[] }> = {
  google_kubernetes_engine: { label: 'Google GKE', aliases: ['gke', 'google kubernetes engine', 'kubernetes'], tags: ['k8s'] },
  compute_engine: { label: 'Compute Engine', aliases: ['gce', 'vm', 'virtual machine'] },
  cloud_storage: { label: 'Google Cloud Storage', aliases: ['gcs', 'bucket', 'cloud storage'] },
  cloud_sql: { label: 'Cloud SQL', aliases: ['gcp sql', 'google cloud sql', 'cloudsql'], tags: ['sql'] },
  cloud_spanner: { label: 'Cloud Spanner', aliases: ['spanner', 'gcp spanner'], tags: ['sql'] },
  bigtable: { label: 'Cloud Bigtable', aliases: ['bigtable', 'gcp bigtable'], tags: ['nosql'] },
  bigquery: { label: 'BigQuery', aliases: ['bq', 'gcp bigquery'], tags: ['data-warehouse'] },
  pubsub: { label: 'Google Pub/Sub', aliases: ['pubsub', 'gcp pubsub', 'pub/sub'], tags: ['queue', 'streaming'] },
  artifact_registry: { label: 'Google Artifact Registry', aliases: ['gcr', 'artifact registry', 'container registry'] },
  cloud_monitoring: { label: 'Google Cloud Monitoring', aliases: ['stackdriver', 'cloud logging', 'monitoring'] },
  cloud_run: { label: 'Cloud Run', aliases: ['run'], tags: ['serverless'] },
  cloud_functions: { label: 'Cloud Functions', aliases: ['functions', 'faas', 'lambda'], tags: ['serverless'] },
  app_engine: { label: 'App Engine', aliases: ['gae'], tags: ['serverless'] },
  firestore: { label: 'Firestore', aliases: ['cloud firestore'], tags: ['nosql'] },
  memorystore: { label: 'Memorystore', aliases: ['redis', 'memcached'], tags: ['cache'] },
  cloud_load_balancing: { label: 'Cloud Load Balancing', aliases: ['load balancer', 'glb', 'lb'] },
  cloud_build: { label: 'Cloud Build', aliases: ['build'], tags: ['ci-cd'] },
  identity_and_access_management: { label: 'Cloud IAM', aliases: ['iam'] },
  key_management_service: { label: 'Cloud KMS', aliases: ['kms'] },
  cloud_dns: { label: 'Cloud DNS', aliases: ['dns'] },
  cloud_cdn: { label: 'Cloud CDN', aliases: ['cdn'], tags: ['cdn'] },
  cloud_armor: { label: 'Cloud Armor', aliases: ['waf'] },
  dataflow: { label: 'Dataflow', aliases: ['beam'], tags: ['streaming'] },
  dataproc: { label: 'Dataproc', aliases: ['spark', 'hadoop'] },
  cloud_composer: { label: 'Cloud Composer', aliases: ['airflow'], tags: ['workflow'] },
  cloud_scheduler: { label: 'Cloud Scheduler', aliases: ['cron'] },
  cloud_tasks: { label: 'Cloud Tasks', aliases: ['task queue'], tags: ['queue'] },
  secret_manager: { label: 'Secret Manager', aliases: ['secrets'] },
  cloud_nat: { label: 'Cloud NAT', aliases: ['nat'] },
  cloud_vpn: { label: 'Cloud VPN', aliases: ['vpn'] },
  vertex_ai: { label: 'Vertex AI', aliases: ['vertex'] },
  ai_platform: { label: 'AI Platform', aliases: ['ml engine'] },
};
const title = (f: string) =>
  f.replace(/_-_/g, ' ').split(/[_-]/).map((w) => (w.length <= 3 && /^(api|sql|ai|ml|iot|gpu|tpu|vpn|nat|dns|cdn|ids|hsm|ekm|iam|kms)$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ');

const items: any[] = [];
for (const dir of readdirSync(src).filter((d) => existsSync(join(src, d, `${d}.svg`))).sort()) {
  const [sid, slabel, , stags] = SUBS.find((s) => s[2].test(dir)) ?? [FALLBACK[0], FALLBACK[1], null, FALLBACK[2]];
  const cur = LABEL[dir];
  const label = cur?.label ?? title(dir);
  items.push({ label, sub: { id: sid, label: slabel }, svg: readFileSync(join(src, dir, `${dir}.svg`), 'utf8'), aliases: [...new Set([...(cur?.aliases ?? []), title(dir).toLowerCase()])].filter((a) => a !== label.toLowerCase()), tags: [...stags, ...(cur?.tags ?? [])] });
}
// groups (official blue dashed outlines)
const proj = readFileSync(join(src, 'project', 'project.svg'), 'utf8');
const net = readFileSync(join(src, 'cloud_network', 'cloud_network.svg'), 'utf8');
for (const [id, label, svg, dashed] of [['gcp-group-project', 'Google Cloud project', proj, false], ['gcp-group-vpc', 'VPC network', net, true], ['gcp-group-region', 'Region / zone', net, true]] as const)
  items.push({ id, label, sub: { id: 'groups', label: 'Groups & containers' }, svg, kind: 'group', aliases: ['group', 'boundary'], tags: ['group', 'boundary'], preset: { width: 420, height: 280, data: { label, stroke: '#4285F4', strokeStyle: dashed ? 'dashed' : 'solid', strokeWidth: 1.5, fill: '#4285F4', fillOpacity: 4, border: true } } });
const legacy = new Map<string, string>(CATALOG_DEFS.filter((d) => d.tags.includes('gcp')).map((d) => [normLabel(d.label), d.id]));
const r = writeProvider(root, { provider: 'gcp', providerLabel: 'Google Cloud', tags: ['cloud', 'managed', 'google-cloud'], items, legacyLabels: legacy, subOrder: ['groups', 'compute', 'containers', 'databases', 'storage', 'network', 'security', 'analytics', 'ai', 'devtools', 'operations', 'other'] });
console.log(`gcp: ${r.count} items in ${r.packs} packs (${r.overrides} legacy ids upgraded)`);
if (r.problems.length) console.log('skipped:\n  ' + r.problems.join('\n  '));
