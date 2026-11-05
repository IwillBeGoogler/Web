/**
 * Hand-maintained MAPPING from calculator price ids to the provider's own pricing API records. It holds NO prices: the numbers come
 * from `prices.generated.json`, written by `npm run prices:update` (scripts/prices/update-prices.ts) from the official AWS Price List
 * bulk files, the Azure Retail Prices API and the GCP Cloud Billing Catalog API. Add a calculator price by adding an entry here and
 * running the script; it fails loudly when a query matches nothing or is ambiguous.
 */
export const HOURS_PER_MONTH = 730;
export const SECONDS_PER_MONTH = 2_592_000; // 30 days

export type Provider = 'aws' | 'gcp' | 'azure';
export type PriceUnit = 'instance-month' | 'per-million-requests' | 'per-gb-month' | 'per-gb-transfer';

export const DEFAULT_REGION: Record<Provider, string> = { aws: 'us-east-1', azure: 'eastus', gcp: 'us-central1' };

/** value of a CSV column: exact string, or a pattern. `AWS_REGION_PREFIX` makes the optional "USE1-" usage-type prefix of other regions match. */
export type Match = string | RegExp;
const P = '(?:[A-Z]{2,4}\\d-)?';
const usage = (rest: string) => new RegExp(`^${P}${rest}$`);

export interface AwsQuery {
  /** Price List offer code, e.g. AmazonEC2 */
  offer: string;
  /** all columns must match (OnDemand rows only) */
  where: Record<string, Match>;
  /** 'first' = the tier starting at 0, 'firstPaid' = the first tier with a price above 0 (free allowances are skipped) */
  tier?: 'first' | 'firstPaid';
}
export interface AzureQuery {
  serviceName: string;
  armSkuName?: string;
  productName?: string;
  skuName?: string;
  meterName?: string;
  /** Linux list price: drop Windows, Spot and Low Priority rows */
  linuxOnly?: boolean;
}
export interface GcpQuery {
  /** Cloud Billing service id, e.g. 6F81-5844-456A (Compute Engine) */
  serviceId: string;
  /** one SKU, or several that add up (vCPU + RAM): `qty` multiplies the SKU's unit price */
  parts: Array<{ description: Match; resourceGroup: string; qty: number }>;
}
export interface PriceMapEntry {
  id: string;
  provider: Provider;
  label: string;
  unit: PriceUnit;
  aws?: AwsQuery;
  azure?: AzureQuery;
  gcp?: GcpQuery;
}

const ec2 = (type: string): AwsQuery => ({
  offer: 'AmazonEC2',
  where: { 'Product Family': 'Compute Instance', 'Instance Type': type, 'Operating System': 'Linux', Tenancy: 'Shared', 'Pre Installed S/W': 'NA', 'License Model': 'No License required', CapacityStatus: 'Used', usageType: usage(`BoxUsage:${type.replace('.', '\\.')}`) },
});
const rds = (type: string): AwsQuery => ({
  offer: 'AmazonRDS',
  where: { 'Instance Type': type, 'Database Engine': 'PostgreSQL', 'Deployment Option': 'Single-AZ', 'Product Family': 'Database Instance', usageType: usage(`InstanceUsage:${type.replace(/\./g, '\\.')}`) },
});
const cache = (type: string): AwsQuery => ({
  offer: 'AmazonElastiCache',
  where: { 'Instance Type': type, 'Cache Engine': 'Redis', usageType: usage(`NodeUsage:${type.replace(/\./g, '\\.')}`) },
});
const aws = (id: string, label: string, unit: PriceUnit, q: AwsQuery): PriceMapEntry => ({ id, provider: 'aws', label, unit, aws: q });
const az = (id: string, label: string, unit: PriceUnit, q: AzureQuery): PriceMapEntry => ({ id, provider: 'azure', label, unit, azure: q });
const gcp = (id: string, label: string, unit: PriceUnit, q: GcpQuery): PriceMapEntry => ({ id, provider: 'gcp', label, unit, gcp: q });

const GCE = '6F81-5844-456A';
const GCS = '95FF-2EF5-5EA1';

export const PRICE_MAP: PriceMapEntry[] = [
  aws('aws:ec2:t3.micro', 'EC2 t3.micro', 'instance-month', ec2('t3.micro')),
  aws('aws:ec2:t3.small', 'EC2 t3.small', 'instance-month', ec2('t3.small')),
  aws('aws:ec2:t3.medium', 'EC2 t3.medium', 'instance-month', ec2('t3.medium')),
  aws('aws:ec2:t3.large', 'EC2 t3.large', 'instance-month', ec2('t3.large')),
  aws('aws:ec2:m5.large', 'EC2 m5.large', 'instance-month', ec2('m5.large')),
  aws('aws:ec2:m5.xlarge', 'EC2 m5.xlarge', 'instance-month', ec2('m5.xlarge')),
  aws('aws:ec2:c5.large', 'EC2 c5.large', 'instance-month', ec2('c5.large')),
  aws('aws:ec2:r5.large', 'EC2 r5.large', 'instance-month', ec2('r5.large')),
  aws('aws:rds:db.t3.medium', 'RDS PostgreSQL db.t3.medium (single-AZ)', 'instance-month', rds('db.t3.medium')),
  aws('aws:rds:db.m5.large', 'RDS PostgreSQL db.m5.large (single-AZ)', 'instance-month', rds('db.m5.large')),
  aws('aws:rds:db.r5.large', 'RDS PostgreSQL db.r5.large (single-AZ)', 'instance-month', rds('db.r5.large')),
  aws('aws:elasticache:cache.t3.medium', 'ElastiCache Redis cache.t3.medium', 'instance-month', cache('cache.t3.medium')),
  aws('aws:elasticache:cache.m5.large', 'ElastiCache Redis cache.m5.large', 'instance-month', cache('cache.m5.large')),
  aws('aws:alb', 'Application Load Balancer (hourly part, without LCU)', 'instance-month', { offer: 'AWSELB', where: { usageType: usage('LoadBalancerUsage'), operation: 'LoadBalancing:Application' } }),
  aws('aws:nat-gateway', 'NAT gateway (hourly part)', 'instance-month', { offer: 'AmazonEC2', where: { 'Product Family': 'NAT Gateway', usageType: usage('NatGateway-Hours') } }),
  aws('aws:s3:standard', 'S3 Standard storage', 'per-gb-month', { offer: 'AmazonS3', where: { usageType: usage('TimedStorage-ByteHrs'), 'Storage Class': 'General Purpose' }, tier: 'first' }),
  aws('aws:ebs:gp3', 'EBS gp3 volume', 'per-gb-month', { offer: 'AmazonEC2', where: { 'Product Family': 'Storage', 'Volume API Name': 'gp3', usageType: usage('EBS:VolumeUsage\\.gp3') } }),
  aws('aws:sqs:standard', 'SQS Standard requests', 'per-million-requests', { offer: 'AWSQueueService', where: { usageType: usage('Requests-RBP'), 'Queue Type': 'Standard' }, tier: 'first' }),
  aws('aws:lambda:requests', 'Lambda requests (without duration)', 'per-million-requests', { offer: 'AWSLambda', where: { usageType: usage('Request'), Group: 'AWS-Lambda-Requests' } }),
  aws('aws:dynamodb:on-demand-write', 'DynamoDB on-demand writes', 'per-million-requests', { offer: 'AmazonDynamoDB', where: { usageType: usage('WriteRequestUnits'), Group: 'DDB-WriteUnits' } }),
  aws('aws:data-transfer:out', 'Data transfer out to the internet (first paid tier)', 'per-gb-transfer', { offer: 'AWSDataTransfer', where: { usageType: usage('DataTransfer-Out-Bytes'), 'Transfer Type': 'AWS Outbound' }, tier: 'firstPaid' }),
  gcp('gcp:gce:e2-medium', 'Compute Engine e2-medium (1 vCPU billed + 4 GB)', 'instance-month', {
    serviceId: GCE,
    parts: [{ description: /^E2 Instance Core running in /, resourceGroup: 'CPU', qty: 1 }, { description: /^E2 Instance Ram running in /, resourceGroup: 'RAM', qty: 4 }],
  }),
  gcp('gcp:gce:n2-standard-2', 'Compute Engine n2-standard-2 (2 vCPU + 8 GB)', 'instance-month', {
    serviceId: GCE,
    parts: [{ description: /^N2 Instance Core running in /, resourceGroup: 'CPU', qty: 2 }, { description: /^N2 Instance Ram running in /, resourceGroup: 'RAM', qty: 8 }],
  }),
  gcp('gcp:gcs:standard', 'Cloud Storage Standard', 'per-gb-month', { serviceId: GCS, parts: [{ description: /^Standard Storage /, resourceGroup: 'RegionalStorage', qty: 1 }] }),
  az('azure:vm:b2s', 'Virtual machine B2s', 'instance-month', { serviceName: 'Virtual Machines', armSkuName: 'Standard_B2s', linuxOnly: true }),
  az('azure:vm:d2s-v5', 'Virtual machine D2s v5', 'instance-month', { serviceName: 'Virtual Machines', armSkuName: 'Standard_D2s_v5', linuxOnly: true }),
  az('azure:blob:hot', 'Blob Storage hot (LRS)', 'per-gb-month', { serviceName: 'Storage', productName: 'General Block Blob v2', meterName: 'Hot LRS Data Stored' }),
];

/** price assumed for a component that has no `sku` of its own (shown as "assumed" in the UI) */
export const DEFAULT_SKU_BY_ICON: Record<string, string> = {
  'aws-amazon-ec2': 'aws:ec2:t3.medium', server: 'aws:ec2:t3.medium', service: 'aws:ec2:t3.medium',
  'aws-amazon-rds': 'aws:rds:db.t3.medium', postgresql: 'aws:rds:db.t3.medium', mysql: 'aws:rds:db.t3.medium',
  'aws-amazon-elasticache': 'aws:elasticache:cache.t3.medium', redis: 'aws:elasticache:cache.t3.medium',
  'aws-elastic-load-balancing': 'aws:alb', 'load-balancer': 'aws:alb', nat: 'aws:nat-gateway',
  s3: 'aws:s3:standard', 'object-storage': 'aws:s3:standard', sqs: 'aws:sqs:standard', 'aws-lambda': 'aws:lambda:requests',
  'gcp-compute-engine': 'gcp:gce:e2-medium', gcs: 'gcp:gcs:standard', 'azure-virtual-machine': 'azure:vm:b2s', 'azure-blob': 'azure:blob:hot',
};
