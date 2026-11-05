// node scripts/build-ibm-icons.ts <dir containing icons.json of @iconify-json/carbon>   (or IBM_ICON_DIR=...)
// IBM Cloud / Watson / Db2 product glyphs from IBM Carbon Design System icons (github.com/carbon-design-system/carbon, Apache-2.0).
// IBM's separate "architecture stencils" have no redistribution licence, so only the Apache-2.0 Carbon set is used.
//   mkdir x && cd x && npm pack @iconify-json/carbon && tar xzf *.tgz   ->   IBM_ICON_DIR=x/package
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProvider } from './cloudpack.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] ?? process.env.IBM_ICON_DIR;
if (!src || !existsSync(join(src, 'icons.json'))) throw new Error('usage: node scripts/build-ibm-icons.ts <dir with carbon icons.json>');
const carbon = JSON.parse(readFileSync(join(src, 'icons.json'), 'utf8')) as { icons: Record<string, { body: string }>; width?: number; height?: number };
const BLUE = '#0f62fe';

const SUBS: [string, string, RegExp, string[]][] = [
  ['containers', 'Containers & OpenShift', /kubernetes-service|code-engine|openshift|cloud-pak|cloud-foundry|cloud-satellite|cloud-registry|hybrid-control/, ['container', 'k8s']],
  ['compute', 'Compute', /virtual-server|bare-metal|dedicated-host|power-vs|power-with|hpc|cloud-app$|dynamic-route|vsi-on/, ['compute']],
  ['network', 'Networking', /vpc$|vpc-(endpoints|client)|subnets|transit|direct-link|security-groups|internet-services|vpn|ipsec|private-path/, ['network']],
  ['storage', 'Storage', /block-storage|file-storage|vpc-images|backup|mass-data|global-storage|aspera/, ['storage']],
  ['databases', 'Databases', /databases|db2|cloudant|dbaas|netezza|data-replication/, ['database']],
  ['security', 'Security & Identity', /key-protect|secrets-manager|hsm|hyper-protect|app-id|gate-keeper|privileged|security|sysdig|quantum-safe/, ['security']],
  ['integration', 'Integration & Messaging', /event-(streams|notification|automation|processing|endpoint)|ibm-mq|api-connect|app-connect|webmethods|datastage|streamsets|sterling/, ['messaging', 'integration']],
  ['ai', 'Watson & AI', /watson|granite|ai-on-z|machine-learning|aiops/, ['ml', 'ai']],
  ['devops', 'DevOps & Observability', /continuous-delivery|toolchain|devops|logging|monitoring|observability|instana|turbonomic|auditing|alerting|databand|projects|deployable/, ['devops', 'monitoring']],
];
const OTHER: [string, string, string[]] = ['platform', 'Core services', []];
const WANT = /^(ibm-cloud(-|$)|cloud-(alerting|app|auditing|data-ops|foundry-\d|infra-migration|logging|monitoring|registry|satellite|service-management|services)|db2-database|ibm-db2|ibm-cloudant|ibm-watson|ibm-watsonx|watson|watsonx|ibm-mq$|ibm-event-|ibm-instana|ibm-turbonomic|ibm-toolchain|ibm-devops-|ibm-api-connect|ibm-power-|ibm-aspera|ibm-datastage|ibm-databand|ibm-security$|ibm-granite|ibm-deployable-architecture|ibm-private-path|ibm-vpn-for-vpc|ibm-vsi-on-vpc|ibm-dynamic-route|ibm-data-power|ibm-webmethods-api-gateway)/;
const SKIP = /ibm-db2-alt|cloud-foundry-2|ibm-cloud-(for-education|citrix|pal$|pak-(manta|netezza|watson|network))|watsonx-code-assistant|software-watsonx/;

const ACR: Record<string, string> = { vpc: 'VPC', vpn: 'VPN', hpc: 'HPC', hsm: 'HSM', dbaas: 'DBaaS', vs: 'VS', vsi: 'VSI', ai: 'AI', api: 'API', mq: 'MQ', id: 'ID', ipsec: 'IPsec', db2: 'Db2', ibm: 'IBM', aiops: 'AIOps', mgmt: 'Management', sap: 'SAP', hpc2: 'HPC', iks: 'IKS', z: 'Z' };
const title = (key: string) => key.split('-').map((w) => ACR[w] ?? (w === 'watsonx' || w === 'watson' ? w[0].toUpperCase() + w.slice(1) : w === 'cloudant' ? 'Cloudant' : w[0].toUpperCase() + w.slice(1))).join(' ').replace(/^Watsonx/, 'watsonx').replace(/ Watsonx/g, ' watsonx');
const norm = (k: string) => (/^(cloud-|watson|db2)/.test(k) ? `ibm-${k}` : k);

const CUR: Record<string, { label?: string; aliases: string[]; tags?: string[] }> = {
  'ibm-cloud': { label: 'IBM Cloud', aliases: ['ibm', 'bluemix'] },
  'ibm-cloud-kubernetes-service': { label: 'IBM Cloud Kubernetes Service', aliases: ['iks', 'ibm kubernetes', 'kubernetes service', 'kubernetes'], tags: ['k8s'] },
  'ibm-cloud-code-engine': { aliases: ['code engine', 'serverless', 'ibm serverless'], tags: ['serverless'] },
  'ibm-cloud-vpc': { label: 'IBM Cloud VPC', aliases: ['vpc', 'virtual private cloud', 'ibm vpc'] },
  'ibm-cloud-virtual-server-vpc': { label: 'IBM Cloud Virtual Server for VPC', aliases: ['vsi', 'virtual server', 'vm', 'ibm vsi'] },
  'ibm-cloud-virtual-server-classic': { label: 'IBM Cloud Virtual Server (Classic)', aliases: ['classic vsi', 'virtual server classic'] },
  'ibm-cloud-bare-metal-servers-vpc': { label: 'IBM Cloud Bare Metal Servers for VPC', aliases: ['bare metal', 'bm'] },
  'ibm-cloud-transit-gateway': { aliases: ['tgw', 'transit gateway'] },
  'ibm-cloud-security-groups': { aliases: ['sg', 'security group'] },
  'ibm-cloud-internet-services': { aliases: ['cis', 'cdn', 'dns', 'waf'], tags: ['cdn'] },
  'ibm-cloud-key-protect': { aliases: ['kms', 'key management'] },
  'ibm-cloud-secrets-manager': { aliases: ['secrets'] },
  'ibm-cloud-event-streams': { aliases: ['kafka', 'event streams'], tags: ['kafka', 'streaming'] },
  'ibm-event-streams': { label: 'IBM Event Streams', aliases: ['kafka'], tags: ['kafka', 'streaming'] },
  'ibm-cloud-databases': { aliases: ['icd', 'managed databases', 'postgres', 'redis', 'mongodb'] },
  'ibm-cloud-logging': { aliases: ['log analysis', 'logdna'] },
  'ibm-cloud-direct-link-2-connect': { aliases: ['direct link', 'dl2'] },
  'ibm-cloud-direct-link-2-dedicated': { aliases: ['direct link', 'dl2'] },
  'ibm-cloud-continuous-delivery': { aliases: ['cd', 'pipeline'], tags: ['ci-cd'] },
  'ibm-cloud-vpc-file-storage': { aliases: ['file storage', 'nfs'] },
  'ibm-cloud-vpc-block-storage-snapshots': { aliases: ['block storage', 'snapshot'] },
  'ibm-db2': { label: 'IBM Db2', aliases: ['db2'], tags: ['sql'] },
  'ibm-db2-warehouse': { label: 'IBM Db2 Warehouse', aliases: ['db2 warehouse'], tags: ['data-warehouse'] },
  'ibm-cloudant': { label: 'IBM Cloudant', aliases: ['cloudant', 'couchdb'], tags: ['nosql'] },
  'ibm-mq': { label: 'IBM MQ', aliases: ['mq', 'websphere mq'], tags: ['queue'] },
  'ibm-watsonx-assistant': { aliases: ['assistant', 'chatbot'] },
  'ibm-instana': { label: 'IBM Instana', aliases: ['instana', 'apm'], tags: ['monitoring'] },
  'ibm-cloud-vpc-endpoints': { aliases: ['vpe', 'private endpoint'] },
};

const items: any[] = [];
const seen = new Set<string>();
for (const raw of Object.keys(carbon.icons).sort()) {
  if (!WANT.test(raw) || SKIP.test(raw)) continue;
  const key = norm(raw);
  const sub = SUBS.find(([, , re]) => re.test(key)) ?? [OTHER[0], OTHER[1], null, OTHER[2]];
  const cur = CUR[key];
  const label = cur?.label ?? title(key.replace(/^ibm-cloud-/, 'ibm-cloud ').replace(/ /g, '-')).replace(/^IBM Cloud-/, 'IBM Cloud ').replace(/-/g, ' ');
  const small = (t: string) => t.replace(/ (And|For|To|On|With|Of)(?= )/g, (m) => m.toLowerCase()).replace(/Cloud Foundry 1/, 'Cloud Foundry').replace(/Devops/, 'DevOps').replace(/Openscale/, 'OpenScale').replace(/Webmethods/, 'webMethods').replace(/Datastage/, 'DataStage').replace(/Data Power/, 'DataPower');
  const lbl0 = label.startsWith('IBM') || label.startsWith('Watson') || label.startsWith('watson') ? label : `IBM ${label}`;
  const lbl = cur?.label ? lbl0 : small(lbl0);
  if (seen.has(lbl)) continue;
  seen.add(lbl);
  const body = carbon.icons[raw].body.replace(/currentColor/g, BLUE);
  const plain = lbl.replace(/^IBM (Cloud )?/, '').toLowerCase();
  items.push({
    label: lbl, sub: { id: sub[0], label: sub[1] }, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${body}</svg>`,
    aliases: [...new Set([...(cur?.aliases ?? []), plain])].filter((a) => a !== lbl.toLowerCase()), tags: [...sub[3], ...(cur?.tags ?? [])],
  });
}
const r = writeProvider(root, { provider: 'ibm', providerLabel: 'IBM Cloud', tags: ['cloud', 'managed', 'ibm-cloud'], items, subOrder: ['containers', 'compute', 'network', 'storage', 'databases', 'security', 'integration', 'ai', 'devops', 'platform'] });
console.log(`ibm: ${r.count} items in ${r.packs} packs`);
if (r.problems.length) console.log('skipped:\n  ' + r.problems.join('\n  '));
