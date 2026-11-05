// node scripts/build-azure-icons.ts <extracted Azure_Public_Service_Icons dir>   (https://learn.microsoft.com/azure/architecture/icons)
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProvider, normLabel } from './cloudpack.mjs';
import { CATALOG_DEFS } from '../src/data/catalog.generated.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] ?? process.env.AZURE_ICON_DIR;
if (!base) throw new Error('usage: node scripts/build-azure-icons.ts <extracted Azure icons dir>');
const icons = join(base, existsSync(join(base, 'Azure_Public_Service_Icons')) ? 'Azure_Public_Service_Icons/Icons' : 'Icons');
if (!existsSync(icons)) throw new Error(`no Icons folder in ${base}`);

const CATS: Record<string, { label: string; tags: string[] }> = {
  'ai + machine learning': { label: 'AI & Machine Learning', tags: ['ml', 'ai'] },
  analytics: { label: 'Analytics', tags: ['analytics'] },
  'app services': { label: 'App Services', tags: ['web'] },
  'azure ecosystem': { label: 'Azure Ecosystem', tags: [] },
  blockchain: { label: 'Blockchain', tags: ['blockchain'] },
  compute: { label: 'Compute', tags: ['compute'] },
  containers: { label: 'Containers', tags: ['container'] },
  databases: { label: 'Databases', tags: ['database'] },
  'developer tools': { label: 'Developer Tools', tags: ['devtools'] },
  devops: { label: 'DevOps', tags: ['ci-cd'] },
  general: { label: 'General', tags: [] },
  'hybrid + multicloud': { label: 'Hybrid & Multicloud', tags: ['hybrid'] },
  identity: { label: 'Identity', tags: ['security', 'identity'] },
  integration: { label: 'Integration', tags: ['integration', 'messaging'] },
  iot: { label: 'Internet of Things', tags: ['iot'] },
  'management + governance': { label: 'Management & Governance', tags: ['management'] },
  migrate: { label: 'Migration', tags: ['migration'] },
  migration: { label: 'Migration', tags: ['migration'] },
  'mixed reality': { label: 'Mixed Reality', tags: [] },
  mobile: { label: 'Mobile', tags: ['mobile'] },
  monitor: { label: 'Monitor', tags: ['monitoring'] },
  networking: { label: 'Networking', tags: ['network'] },
  'new icons': { label: 'New services', tags: [] },
  other: { label: 'Other services', tags: [] },
  security: { label: 'Security', tags: ['security'] },
  storage: { label: 'Storage', tags: ['storage'] },
  web: { label: 'Web', tags: ['web', 'frontend'] },
};
/** friendlier names + aliases (also matches the legacy catalog labels so old ids get the official icon) */
const CURATED: Record<string, { label: string; aliases?: string[]; tags?: string[] }> = {
  'Virtual-Machine': { label: 'Azure Virtual Machine', aliases: ['vm', 'virtual machine'] },
  'Kubernetes-Services': { label: 'Azure AKS', aliases: ['aks', 'kubernetes service', 'k8s'], tags: ['k8s'] },
  'Container-Registries': { label: 'Azure Container Registry', aliases: ['acr', 'registry'] },
  'Azure-Cosmos-DB': { label: 'Azure Cosmos DB', aliases: ['cosmos', 'cosmosdb'], tags: ['nosql'] },
  'Storage-Accounts': { label: 'Azure Storage account', aliases: ['storage', 'azure storage'] },
  'Blob-Block': { label: 'Azure Blob Storage', aliases: ['blob', 'azure storage'] },
  'Service-Bus': { label: 'Azure Service Bus', aliases: ['service bus', 'asb'], tags: ['queue'] },
  'Event-Hubs': { label: 'Azure Event Hubs', aliases: ['event hubs'], tags: ['streaming'] },
  'Event-Grid-Topics': { label: 'Azure Event Grid', aliases: ['event grid'] },
  Monitor: { label: 'Azure Monitor', aliases: ['monitor', 'application insights'] },
  Repos: { label: 'Azure Repos', aliases: ['ado repos', 'azure devops repos'], tags: ['scm'] },
  Pipelines: { label: 'Azure Pipelines', aliases: ['ado pipelines', 'pipelines'], tags: ['ci-cd'] },
  'Function-Apps': { label: 'Azure Functions', aliases: ['functions', 'faas', 'lambda'], tags: ['serverless'] },
  'App-Services': { label: 'Azure App Service', aliases: ['app service', 'web app'] },
  'SQL-Database': { label: 'Azure SQL Database', aliases: ['azure sql', 'mssql'], tags: ['sql'] },
  'SQL-Managed-Instance': { label: 'Azure SQL Managed Instance', aliases: ['sql mi'], tags: ['sql'] },
  'Virtual-Networks': { label: 'Azure Virtual Network', aliases: ['vnet', 'virtual network'] },
  'Load-Balancers': { label: 'Azure Load Balancer', aliases: ['load balancer', 'lb'] },
  'Application-Gateways': { label: 'Azure Application Gateway', aliases: ['app gateway', 'agw'] },
  'Front-Door-and-CDN-Profiles': { label: 'Azure Front Door', aliases: ['front door', 'cdn'], tags: ['cdn'] },
  'API-Management-Services': { label: 'Azure API Management', aliases: ['apim', 'api gateway'] },
  'Key-Vaults': { label: 'Azure Key Vault', aliases: ['key vault', 'secrets', 'kms'] },
  'Azure-Database-for-PostgreSQL-Server': { label: 'Azure Database for PostgreSQL', aliases: ['postgres', 'postgresql'], tags: ['sql'] },
  'Azure-Database-for-MySQL-Server': { label: 'Azure Database for MySQL', aliases: ['mysql'], tags: ['sql'] },
  'Cache-Redis': { label: 'Azure Cache for Redis', aliases: ['redis'], tags: ['cache'] },
  'DNS-Zones': { label: 'Azure DNS', aliases: ['dns'] },
  'Resource-Groups': { label: 'Resource group', aliases: ['rg'] },
  Subscriptions: { label: 'Subscription', aliases: ['subscription'] },
  'Management-Groups': { label: 'Management group', aliases: ['management group'] },
  'Data-Factories': { label: 'Azure Data Factory', aliases: ['adf', 'data factory'] },
  'Synapse-Analytics': { label: 'Azure Synapse Analytics', aliases: ['synapse'] },
  'Azure-Databricks': { label: 'Azure Databricks', aliases: ['databricks'] },
  'Entra-ID': { label: 'Microsoft Entra ID', aliases: ['azure ad', 'aad', 'active directory'] },
};

const items: any[] = [];
const seen = new Set<string>();
for (const dir of readdirSync(icons).sort()) {
  if (dir === 'menu' || dir === 'intune') continue;
  const cat = CATS[dir] ?? { label: dir, tags: [] };
  const full = join(icons, dir);
  for (const f of readdirSync(full).filter((x) => x.endsWith('.svg')).sort()) {
    const raw = f.replace(/^\d+\s*-icon-service-/, '').replace(/\.svg$/, '');
    const cur = CURATED[raw];
    const label = cur?.label ?? raw.replace(/-/g, ' ').replace(/\(([^)]*)\)/g, '($1)').trim();
    const key = normLabel(label);
    if (seen.has(key)) continue; // the pack repeats icons across folders
    seen.add(key);
    items.push({ label, sub: { id: dir.replace(/[^a-z0-9]+/g, '-'), label: cat.label }, svg: readFileSync(join(full, f), 'utf8'), aliases: cur?.aliases ?? [], tags: [...cat.tags, ...(cur?.tags ?? [])] });
  }
}
const icon = (dir: string, name: string) => readFileSync(join(icons, dir, readdirSync(join(icons, dir)).find((f) => f.endsWith(`-icon-service-${name}.svg`))!), 'utf8');
for (const [id, label, dir, name, dashed] of [
  ['azure-group-subscription', 'Azure subscription', 'general', 'Subscriptions', false],
  ['azure-group-resource-group', 'Resource group', 'general', 'Resource-Groups', true],
  ['azure-group-vnet', 'Virtual network (VNet)', 'networking', 'Virtual-Networks', true],
  ['azure-group-subnet', 'Subnet', 'networking', 'Subnet', true],
] as const)
  items.push({ id, label, sub: { id: 'groups', label: 'Groups & containers' }, svg: icon(dir, name), kind: 'group', aliases: ['group', 'boundary'], tags: ['group', 'boundary'], preset: { width: 420, height: 280, data: { label, stroke: '#0078D4', strokeStyle: dashed ? 'dashed' : 'solid', strokeWidth: 1.5, fill: '#0078D4', fillOpacity: 4, border: true } } });
const legacy = new Map<string, string>(CATALOG_DEFS.filter((d) => d.tags.includes('azure')).map((d) => [normLabel(d.label), d.id]));
const order = ['groups', 'compute', 'containers', 'databases', 'storage', 'networking', 'security', 'identity', 'integration', 'ai-machine-learning', 'analytics', 'devops', 'app-services', 'web', 'monitor', 'management-governance'];
const r = writeProvider(root, { provider: 'azure', providerLabel: 'Microsoft Azure', tags: ['cloud', 'managed', 'microsoft'], items, legacyLabels: legacy, subOrder: [...order, ...[...new Set(items.map((i) => i.sub.id))].filter((s) => !order.includes(s)).sort()] });
console.log(`azure: ${r.count} items in ${r.packs} packs (${r.overrides} legacy ids upgraded)`);
if (r.problems.length) console.log(`skipped ${r.problems.length}:\n  ` + r.problems.slice(0, 12).join('\n  '));
