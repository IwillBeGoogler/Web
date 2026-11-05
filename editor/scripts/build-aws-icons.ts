// node scripts/build-aws-icons.ts <path-to-extracted-AWS-icon-package>   (or AWS_ICON_DIR=...)
// Reads the OFFICIAL AWS Architecture Icons (service icons, 64px SVG + group icons) and generates the lazy per-category packs.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProvider, slug, normLabel } from './cloudpack.mjs';
import { CATALOG_DEFS } from '../src/data/catalog.generated.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] ?? process.env.AWS_ICON_DIR;
if (!src || !existsSync(src)) throw new Error('usage: node scripts/build-aws-icons.ts <extracted AWS Architecture Icons dir>');
const pkg = (prefix: string) => readdirSync(src).find((d) => d.startsWith(prefix));
const svcDir = join(src, pkg('Architecture-Service-Icons')!);
const grpDir = join(src, pkg('Architecture-Group-Icons')!);
const resDir = pkg('Resource-Icons') ? join(src, pkg('Resource-Icons')!) : null;

const CATS: Record<string, { label: string; tags: string[] }> = {
  Analytics: { label: 'Analytics', tags: ['analytics'] },
  'Application-Integration': { label: 'Application Integration', tags: ['integration', 'messaging'] },
  'Artificial-Intelligence': { label: 'AI & Machine Learning', tags: ['ml', 'ai'] },
  Blockchain: { label: 'Blockchain', tags: ['blockchain'] },
  'Business-Applications': { label: 'Business Applications', tags: ['saas'] },
  'Cloud-Financial-Management': { label: 'Cloud Financial Management', tags: ['finops'] },
  Compute: { label: 'Compute', tags: ['compute'] },
  Containers: { label: 'Containers', tags: ['container'] },
  'Customer-Enablement': { label: 'Customer Enablement', tags: ['support'] },
  Databases: { label: 'Databases', tags: ['database'] },
  'Developer-Tools': { label: 'Developer Tools', tags: ['devtools'] },
  'End-User-Computing': { label: 'End User Computing', tags: ['desktop'] },
  'Front-End-Web-Mobile': { label: 'Front-End Web & Mobile', tags: ['frontend', 'mobile'] },
  Games: { label: 'Games', tags: ['games'] },
  'General-Icons': { label: 'General', tags: [] },
  'Internet-of-Things': { label: 'Internet of Things', tags: ['iot'] },
  'Management-Tools': { label: 'Management & Governance', tags: ['management'] },
  'Media-Services': { label: 'Media Services', tags: ['media'] },
  'Migration-Modernization': { label: 'Migration & Modernization', tags: ['migration'] },
  'Networking-Content-Delivery': { label: 'Networking & Content Delivery', tags: ['network'] },
  'Quantum-Technologies': { label: 'Quantum Technologies', tags: ['quantum'] },
  Satellite: { label: 'Satellite', tags: ['satellite'] },
  'Security-Identity': { label: 'Security, Identity & Compliance', tags: ['security', 'identity'] },
  Storage: { label: 'Storage', tags: ['storage'] },
};
/** friendlier names + search aliases for the services people actually type */
const CURATED: Record<string, { label: string; aliases: string[]; tags?: string[] }> = {
  'Amazon-Managed-Workflows-for-Apache-Airflow': { label: 'Amazon MWAA', aliases: ['mwaa', 'managed airflow', 'airflow', 'managed workflows for apache airflow'] },
  'Amazon-Simple-Storage-Service': { label: 'Amazon S3', aliases: ['s3', 'bucket', 'simple storage service'] },
  'Amazon-Simple-Storage-Service-Glacier': { label: 'Amazon S3 Glacier', aliases: ['glacier', 'archive'] },
  'Amazon-Simple-Queue-Service': { label: 'Amazon SQS', aliases: ['sqs', 'simple queue service'], tags: ['queue'] },
  'Amazon-Simple-Notification-Service': { label: 'Amazon SNS', aliases: ['sns', 'simple notification service'], tags: ['pubsub'] },
  'Amazon-Elastic-Kubernetes-Service': { label: 'Amazon EKS', aliases: ['eks', 'elastic kubernetes service'], tags: ['k8s'] },
  'Amazon-Elastic-Container-Service': { label: 'Amazon ECS', aliases: ['ecs', 'elastic container service'] },
  'Amazon-Elastic-Container-Registry': { label: 'Amazon ECR', aliases: ['ecr', 'container registry'] },
  'Amazon-Elastic-Block-Store': { label: 'Amazon EBS', aliases: ['ebs', 'block store', 'volume'] },
  'Amazon-Virtual-Private-Cloud': { label: 'Amazon VPC', aliases: ['vpc', 'virtual private cloud'] },
  'Elastic-Load-Balancing': { label: 'Elastic Load Balancing', aliases: ['elb', 'alb', 'nlb', 'load balancer'] },
  'AWS-Identity-and-Access-Management': { label: 'AWS IAM', aliases: ['iam', 'identity and access management'] },
  'AWS-Key-Management-Service': { label: 'AWS KMS', aliases: ['kms', 'key management service'] },
  'Amazon-Managed-Streaming-for-Apache-Kafka': { label: 'Amazon MSK', aliases: ['msk', 'kafka', 'managed streaming for kafka'], tags: ['kafka', 'streaming'] },
  'Amazon-OpenSearch-Service': { label: 'Amazon OpenSearch Service', aliases: ['opensearch', 'elasticsearch'], tags: ['search'] },
  'AWS-Cloud-Development-Kit': { label: 'AWS CDK', aliases: ['cdk', 'cloud development kit'], tags: ['iac'] },
  'AWS-Database-Migration-Service': { label: 'AWS DMS', aliases: ['dms', 'database migration service'] },
  'Amazon-EC2': { label: 'Amazon EC2', aliases: ['ec2', 'virtual machine', 'vm', 'instance'] },
  'AWS-Lambda': { label: 'AWS Lambda', aliases: ['lambda', 'function', 'faas'] },
  'Amazon-DynamoDB': { label: 'Amazon DynamoDB', aliases: ['dynamo', 'ddb'], tags: ['nosql'] },
  'Amazon-RDS': { label: 'Amazon RDS', aliases: ['rds', 'relational database service'], tags: ['sql'] },
  'Amazon-Aurora': { label: 'Amazon Aurora', aliases: ['aurora'], tags: ['sql'] },
  'Amazon-ElastiCache': { label: 'Amazon ElastiCache', aliases: ['elasticache', 'redis', 'memcached'], tags: ['cache'] },
  'Amazon-Route-53': { label: 'Amazon Route 53', aliases: ['route53', 'dns'] },
  'Amazon-CloudFront': { label: 'Amazon CloudFront', aliases: ['cloudfront', 'cdn'], tags: ['cdn'] },
  'Amazon-API-Gateway': { label: 'Amazon API Gateway', aliases: ['apigw', 'api gateway'] },
  'AWS-Step-Functions': { label: 'AWS Step Functions', aliases: ['step functions', 'state machine'] },
  'Amazon-Cognito': { label: 'Amazon Cognito', aliases: ['cognito', 'user pool'] },
  'AWS-WAF': { label: 'AWS WAF', aliases: ['waf', 'web application firewall'] },
  'AWS-Fargate': { label: 'AWS Fargate', aliases: ['fargate'] },
  'Amazon-Kinesis-Data-Streams': { label: 'Amazon Kinesis Data Streams', aliases: ['kinesis streams'], tags: ['streaming'] },
  'Amazon-Data-Firehose': { label: 'Amazon Data Firehose', aliases: ['firehose', 'kinesis firehose'], tags: ['streaming'] },
};
const GROUPS: Record<string, { label: string; dashed?: boolean }> = {
  'AWS-Account_32': { label: 'AWS account' },
  'AWS-Cloud-logo_32': { label: 'AWS Cloud' },
  'AWS-Cloud_32': { label: 'AWS Cloud (no logo)' },
  'AWS-IoT-Greengrass-Deployment_32': { label: 'IoT Greengrass deployment' },
  'Auto-Scaling-group_32': { label: 'Auto Scaling group', dashed: true },
  'Corporate-data-center_32': { label: 'Corporate data center' },
  'EC2-instance-contents_32': { label: 'EC2 instance contents' },
  'Private-subnet_32': { label: 'Private subnet' },
  'Public-subnet_32': { label: 'Public subnet' },
  'Region_32': { label: 'Region', dashed: true },
  'Server-contents_32': { label: 'Server contents' },
  'Spot-Fleet_32': { label: 'Spot Fleet', dashed: true },
  'Virtual-private-cloud-VPC_32': { label: 'VPC' },
};

const items: any[] = [];
for (const dir of readdirSync(svcDir).filter((d) => d.startsWith('Arch_')).sort()) {
  const key = dir.slice(5);
  const cat = CATS[key] ?? { label: key.replace(/-/g, ' '), tags: [] };
  const sub = { id: slug(key), label: cat.label };
  const d64 = join(svcDir, dir, '64');
  if (!existsSync(d64)) continue;
  for (const f of readdirSync(d64).filter((x) => x.endsWith('_64.svg') && !/_(Dark|Light)_64/.test(x)).sort()) {
    const raw = f.replace(/^Arch_/, '').replace(/_64\.svg$/, '');
    const cur = CURATED[raw];
    const label = cur?.label ?? raw.replace(/-/g, ' ');
    const plain = label.replace(/^(Amazon|AWS) /, '');
    items.push({
      label, sub, svg: readFileSync(join(d64, f), 'utf8'),
      aliases: [...new Set([...(cur?.aliases ?? []), ...(plain !== label ? [plain.toLowerCase()] : [])])],
      tags: [...cat.tags, ...(cur?.tags ?? [])],
    });
  }
}
// group icons: official colours; dashed outline for Region / Auto Scaling / Spot Fleet
const gsub = { id: 'groups', label: 'Groups & containers' };
for (const [file, g] of Object.entries(GROUPS)) {
  const p = join(grpDir, `${file}.svg`);
  if (!existsSync(p)) continue;
  const svg = readFileSync(p, 'utf8');
  const color = (svg.match(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/) ?? [])[1] ?? '#232F3E';
  items.push({
    id: `aws-group-${slug(g.label)}`, label: g.label, sub: gsub, svg, kind: 'group', aliases: ['group', 'boundary', g.label.toLowerCase()],
    tags: ['group', 'boundary', 'network'],
    preset: { width: 420, height: 280, data: { label: g.label, stroke: color, strokeStyle: g.dashed ? 'dashed' : 'solid', strokeWidth: 1.5, fill: color, fillOpacity: 4, border: true } },
  });
}
// resource-level icons (Resource-Icons_*/Res_<Category>/Res_<Service>_<Resource>_48.svg); appended after the services of the same sub
const RES_CAT: Record<string, string> = { IoT: 'Internet-of-Things', 'Management-Governance': 'Management-Tools' };
const svcLabel = (service: string) => CURATED[service]?.label ?? service.replace(/-/g, ' ');
if (resDir) {
  for (const dir of readdirSync(resDir).filter((d) => d.startsWith('Res_')).sort()) {
    const key0 = dir.slice(4);
    const key = RES_CAT[key0] ?? key0;
    const cat = CATS[key] ?? { label: key.replace(/-/g, ' '), tags: [] };
    const sub = { id: slug(key), label: cat.label };
    const dirPath = join(resDir, dir);
    const light = join(dirPath, 'Res_48_Light'); // General-Icons ships Dark/Light variants: take Light
    const files = existsSync(light) ? readdirSync(light).map((f) => join(light, f)) : readdirSync(dirPath).filter((f) => f.endsWith('.svg')).map((f) => join(dirPath, f));
    for (const full of files.filter((f) => f.endsWith('_48.svg') || f.endsWith('_48_Light.svg')).sort()) {
      const raw = full.split('/').pop()!.replace(/^Res_/, '').replace(/_48(_Light)?\.svg$/, '');
      const [service, ...restParts] = raw.split('_');
      const resource = (restParts.length ? restParts.join(' ') : service).replace(/-/g, ' ');
      const sName = restParts.length ? svcLabel(service) : '';
      const cur = CURATED[service];
      // drop a leading resource word already in the service label ("AWS Lambda" + "Lambda Function" -> "AWS Lambda Function")
      const tail = sName.replace(/^(Amazon|AWS) /, '').toLowerCase().split(/\s+/);
      const rw = resource.split(' ');
      const resTrim = rw.length > 1 && tail[tail.length - 1] === rw[0].toLowerCase() ? rw.slice(1).join(' ') : resource;
      const label = sName ? (resource.toLowerCase().startsWith(sName.toLowerCase()) ? resource : `${sName} ${resTrim}`) : resource;
      const plainSvc = sName.replace(/^(Amazon|AWS) /, '');
      items.push({
        id: `aws-res-${slug(raw.replace(/_/g, ' '))}`, label, sub, svg: readFileSync(full, 'utf8'),
        aliases: [...new Set([resource.toLowerCase(), ...(plainSvc ? [`${plainSvc.toLowerCase()} ${resource.toLowerCase()}`] : []), ...(cur?.aliases ?? []).slice(0, 2).filter((a) => !resource.toLowerCase().includes(a)).map((a) => `${a} ${resource.toLowerCase()}`)])],
        tags: [...cat.tags, 'resource'],
      });
    }
  }
}
// extras that the pack lacks: reuse an existing icon (survive rebuilds)
const EXTRA = [
  { id: 'aws-glue-schema-registry', reuseIconId: 'aws-glue', label: 'AWS Glue Schema Registry', sub: { id: 'analytics', label: 'Analytics' },
    aliases: ['glue schema registry', 'aws schema registry', 'msk schema registry', 'schema registry aws'], tags: ['analytics', 'kafka', 'streaming'] },
];
items.push(...EXTRA);
const legacy = new Map<string, string>(CATALOG_DEFS.filter((d) => d.tags.includes('aws')).map((d) => [normLabel(d.label), d.id]));
const subOrder = ['groups', 'compute', 'containers', 'databases', 'storage', 'networking-content-delivery', 'security-identity', 'application-integration', 'analytics', 'artificial-intelligence', 'developer-tools', 'management-tools'];
const rest = [...new Set(items.map((i) => i.sub.id))].filter((s) => !subOrder.includes(s)).sort();
const r = writeProvider(root, { provider: 'aws', providerLabel: 'AWS', tags: ['cloud', 'managed'], items, legacyLabels: legacy, subOrder: [...subOrder, ...rest] });
console.log(`aws: ${r.count} items in ${r.packs} packs (${r.overrides} legacy ids now use the official icon)`);
if (r.problems.length) console.log('skipped:\n  ' + r.problems.join('\n  '));
