import { resolveIcon } from '../catalog';
import type { InfraRes } from './types';
import { imageBase } from './util';
import { GENERATED_ICON_RULES } from './icons.generated';

export interface IconRule { match: string; icons: string[] }

/** original type (case-insensitive regex) -> catalog ids, first one that exists wins; checked by tests so a typo cannot hide */
export const HAND_ICON_RULES: IconRule[] = [
  // AWS: Terraform names and CloudFormation types
  { match: '^(aws_instance|aws::ec2::instance|aws_launch_template|aws_autoscaling_group|aws::autoscaling::autoscalinggroup)$', icons: ['aws-amazon-ec2', 'server'] },
  { match: '^(aws_lb|aws_alb|aws_elb|aws::elasticloadbalancing(v2)?::loadbalancer)$', icons: ['aws-elastic-load-balancing', 'load-balancer'] },
  { match: '^(aws_db_instance|aws_rds_cluster|aws_rds_cluster_instance|aws::rds::dbinstance|aws::rds::dbcluster)$', icons: ['aws-amazon-rds', 'database'] },
  { match: '^(aws_s3_bucket|aws::s3::bucket)$', icons: ['s3', 'object-storage'] },
  { match: '^(aws_sqs_queue|aws::sqs::queue)$', icons: ['sqs', 'queue'] },
  { match: '^(aws_sns_topic|aws::sns::topic)$', icons: ['sns', 'pubsub'] },
  { match: '^(aws_lambda_function|aws::lambda::function|aws_lambda_layer_version)$', icons: ['aws-lambda', 'function'] },
  { match: '^(aws_dynamodb_table|aws::dynamodb::table)$', icons: ['dynamodb', 'nosql'] },
  { match: '^(aws_cloudfront_distribution|aws::cloudfront::distribution)$', icons: ['aws-amazon-cloudfront', 'cdn'] },
  { match: '^(aws_route53_zone|aws::route53::hostedzone)$', icons: ['aws-amazon-route-53', 'dns'] },
  { match: '^(aws_elasticache_\\w+|aws::elasticache::\\w+)$', icons: ['aws-amazon-elasticache', 'cache'] },
  { match: '^(aws_internet_gateway|aws::ec2::internetgateway)$', icons: ['internet'] },
  { match: '^(aws_nat_gateway|aws::ec2::natgateway)$', icons: ['nat'] },
  { match: '^(aws_api_gateway_\\w+|aws_apigatewayv2_\\w+|aws::apigateway::\\w+|aws::apigatewayv2::\\w+)$', icons: ['aws-api-gateway', 'api-gateway'] },
  { match: '^(aws_eks_cluster|aws::eks::cluster)$', icons: ['eks', 'kubernetes'] },
  { match: '^(aws_ecs_\\w+|aws::ecs::\\w+)$', icons: ['aws-amazon-ecs', 'container'] },
  { match: '^(aws_kinesis_\\w+|aws::kinesis::\\w+)$', icons: ['kinesis', 'stream-processor'] },
  { match: '^(aws_msk_cluster|aws::msk::cluster)$', icons: ['aws-amazon-msk', 'kafka'] },
  { match: '^(aws_glue_registry|aws_glue_schema|aws::glue::registry|aws::glue::schema)$', icons: ['aws-glue-schema-registry', 'schema-registry'] },
  { match: '^(aws_wafv2_\\w+|aws_waf_\\w+|aws::wafv2::\\w+)$', icons: ['aws-waf', 'waf'] },
  { match: '^(aws_kms_key|aws::kms::key)$', icons: ['aws-kms', 'secrets'] },
  { match: '^(aws_secretsmanager_secret|aws::secretsmanager::secret)$', icons: ['aws-secrets-manager', 'secrets'] },
  { match: '^(aws_acm_certificate|aws::certificatemanager::certificate)$', icons: ['aws-certificate-manager', 'certificate'] },
  { match: '^(aws_efs_\\w+|aws::efs::\\w+)$', icons: ['aws-amazon-efs', 'file-storage'] },
  { match: '^(aws_ebs_volume|aws::ec2::volume)$', icons: ['aws-amazon-ebs', 'file-storage'] },
  { match: '^(aws_opensearch_domain|aws_elasticsearch_domain|aws::opensearchservice::domain)$', icons: ['aws-amazon-opensearch-service', 'search'] },
  { match: '^(aws_cognito_\\w+|aws::cognito::\\w+)$', icons: ['auth-service', 'identity-provider'] },
  { match: '^(aws_cloudwatch_(?!event_)\\w+|aws::cloudwatch::\\w+)$', icons: ['cloudwatch', 'service'] },
  { match: '^(aws_sfn_state_machine|aws::stepfunctions::statemachine)$', icons: ['aws-step-functions', 'service'] },
  { match: '^module$', icons: ['cloud', 'service'] },
  // Google Cloud
  { match: '^google_compute_instance(_template|_group_manager)?$', icons: ['gcp-compute-engine', 'server'] },
  { match: '^google_sql_database_instance$', icons: ['cloud-sql', 'database'] },
  { match: '^google_storage_bucket$', icons: ['gcs', 'object-storage'] },
  { match: '^google_pubsub_\\w+$', icons: ['gcp-pubsub', 'pubsub'] },
  { match: '^google_container_cluster$', icons: ['gke', 'kubernetes'] },
  { match: '^google_cloud_run_\\w+$', icons: ['gcp-cloud-run', 'container'] },
  { match: '^google_cloudfunctions2?_function$', icons: ['gcp-cloud-functions', 'function'] },
  { match: '^google_redis_instance$', icons: ['gcp-memorystore', 'cache'] },
  { match: '^google_compute_(forwarding_rule|backend_service|url_map|global_forwarding_rule)$', icons: ['gcp-cloud-load-balancing', 'load-balancer'] },
  { match: '^google_bigquery_\\w+$', icons: ['bigquery', 'data-warehouse'] },
  { match: '^google_spanner_\\w+$', icons: ['spanner', 'database'] },
  // Azure
  { match: '^azurerm_(linux_|windows_)?virtual_machine$', icons: ['azure-virtual-machine', 'server'] },
  { match: '^azurerm_storage_account$', icons: ['azure-blob', 'object-storage'] },
  { match: '^azurerm_(mssql|sql|postgresql|mysql|mariadb)_\\w+$', icons: ['azure-sql-database', 'database'] },
  { match: '^azurerm_cosmosdb_\\w+$', icons: ['cosmosdb', 'nosql'] },
  { match: '^azurerm_redis_cache$', icons: ['azure-cache-for-redis', 'cache'] },
  { match: '^azurerm_kubernetes_cluster$', icons: ['aks', 'kubernetes'] },
  { match: '^azurerm_(linux_|windows_)?function_app$', icons: ['azure-functions', 'function'] },
  { match: '^azurerm_(app_service|linux_web_app|windows_web_app)$', icons: ['azure-app-service', 'service'] },
  { match: '^azurerm_(lb|application_gateway)$', icons: ['azure-load-balancer', 'load-balancer'] },
  { match: '^azurerm_servicebus_\\w+$', icons: ['service-bus', 'queue'] },
  // Docker Compose
  { match: '^compose-volume$', icons: ['file-storage'] },
];

/** hand-written rules win, generated per-service rules (scripts/gen-infra-icons.mjs) fill the rest */
export const ICON_RULES: IconRule[] = [...HAND_ICON_RULES, ...GENERATED_ICON_RULES];

/** container image (base name) -> product icon */
export const IMAGE_ICONS: Record<string, string> = {
  redis: 'redis', valkey: 'redis', postgres: 'postgresql', postgresql: 'postgresql', mysql: 'mysql', mariadb: 'mariadb', mongo: 'mongodb', mongodb: 'mongodb',
  rabbitmq: 'rabbitmq', kafka: 'kafka', nginx: 'nginx', elasticsearch: 'elasticsearch', opensearch: 'opensearch', memcached: 'memcached',
  prometheus: 'prometheus', grafana: 'grafana', traefik: 'traefik', haproxy: 'haproxy', minio: 'minio', etcd: 'etcd', zookeeper: 'zookeeper',
  cassandra: 'cassandra', clickhouse: 'clickhouse', influxdb: 'influxdb', vault: 'vault', consul: 'consul', envoy: 'envoy', loki: 'loki',
};

const compiled = ICON_RULES.map((r) => ({ re: new RegExp(r.match, 'i'), icons: r.icons }));
const firstKnown = (ids: string[] | undefined): string | undefined => ids?.find((i) => resolveIcon(i));

/** catalog id for a resource: its own hint, then the type rules, then a generic service */
export function iconFor(res: Pick<InfraRes, 'type' | 'icons' | 'kind'>): string {
  return firstKnown(res.icons) ?? firstKnown(compiled.find((r) => r.re.test(res.type))?.icons) ?? 'service';
}
export function iconForImage(image: string | undefined): string | undefined {
  if (!image) return undefined;
  const id = IMAGE_ICONS[imageBase(image)];
  return id && resolveIcon(id) ? id : undefined;
}
