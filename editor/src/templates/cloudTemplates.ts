import { builder, cloudDef } from './builder';
import type { Template } from './monitoringStack';

const id = (p: string, label: string) => cloudDef(p, label).iconId;

/** AWS 3-tier web app: Route 53 -> CloudFront (+S3) -> ALB (public subnet) -> EC2 (private) -> RDS / ElastiCache (private). */
export function aws3Tier() {
  const b = builder();
  b.text('title', 'AWS 3-tier web application', 0, -90, 700, 40, { fontSize: 28, bold: true, textColor: '#1f2430' });
  b.icon('users', 'Users', 'users', 0, 300);
  b.icon('r53', 'Amazon Route 53', id('aws', 'Amazon Route 53'), 190, 300, undefined, { subtitle: 'DNS' });
  b.icon('cf', 'Amazon CloudFront', id('aws', 'Amazon CloudFront'), 380, 300, undefined, { subtitle: 'CDN' });
  b.icon('s3', 'Amazon S3', id('aws', 'Amazon S3'), 380, 90, undefined, { subtitle: 'static assets' });
  b.group('cloud', cloudDef('aws', 'AWS Cloud', 'group'), 580, 0, 1040, 700, undefined, 'AWS Cloud · us-east-1');
  b.group('vpc', cloudDef('aws', 'VPC', 'group'), 20, 50, 1000, 630, 'cloud', 'VPC 10.0.0.0/16');
  b.group('pub', cloudDef('aws', 'Public subnet', 'group'), 20, 50, 220, 540, 'vpc');
  b.icon('alb', 'Elastic Load Balancing', id('aws', 'Elastic Load Balancing'), 50, 220, 'pub', { subtitle: 'ALB :443' });
  b.group('app', cloudDef('aws', 'Private subnet', 'group'), 280, 50, 300, 540, 'vpc', 'Private subnet · app tier');
  b.icon('ec2a', 'Amazon EC2', id('aws', 'Amazon EC2'), 90, 100, 'app', { subtitle: 'app server · AZ a' });
  b.icon('ec2b', 'Amazon EC2', id('aws', 'Amazon EC2'), 90, 330, 'app', { subtitle: 'app server · AZ b' });
  b.group('data', cloudDef('aws', 'Private subnet', 'group'), 620, 50, 340, 540, 'vpc', 'Private subnet · data tier');
  b.icon('rds', 'Amazon RDS', id('aws', 'Amazon RDS'), 110, 80, 'data', { subtitle: 'primary' });
  b.icon('rdsr', 'Amazon RDS', id('aws', 'Amazon RDS'), 110, 260, 'data', { subtitle: 'read replica' });
  b.icon('cache', 'Amazon ElastiCache', id('aws', 'Amazon ElastiCache'), 110, 420, 'data', { subtitle: 'Redis' });
  b.link('users', 'r53', { label: 'DNS', pins: ['right', 'left'] });
  b.link('r53', 'cf', { pins: ['right', 'left'] });
  b.link('cf', 's3', { label: 'static', pins: ['top', 'bottom'], dashed: true });
  b.link('cf', 'alb', { label: 'HTTPS', pins: ['right', 'left'] });
  b.link('alb', 'ec2a', { label: 'HTTP :8080', pins: ['right', 'left'] });
  b.link('alb', 'ec2b', { pins: ['right', 'left'] });
  b.link('ec2a', 'rds', { label: 'SQL', pins: ['right', 'left'] });
  b.link('ec2b', 'rds', { pins: ['right', 'left'] });
  b.link('ec2b', 'cache', { label: 'cache', pins: ['right', 'left'] });
  b.link('rds', 'rdsr', { label: 'replication', pins: ['bottom', 'top'], dashed: true });
  return b.done();
}

/** GCP serverless: Cloud Load Balancing -> Cloud Run -> Firestore / Pub/Sub -> Cloud Functions -> Cloud Storage / Cloud SQL. */
export function gcpServerless() {
  const b = builder();
  b.text('title', 'Google Cloud serverless backend', 0, -90, 700, 40, { fontSize: 28, bold: true, textColor: '#1f2430' });
  b.icon('users', 'Users', 'users', 0, 250);
  b.group('proj', cloudDef('gcp', 'Google Cloud project', 'group'), 230, 0, 940, 560, undefined, 'Google Cloud project');
  b.icon('lb', 'Cloud Load Balancing', id('gcp', 'Cloud Load Balancing'), 40, 250, 'proj', { subtitle: 'HTTPS' });
  b.icon('run', 'Cloud Run', id('gcp', 'Cloud Run'), 270, 90, 'proj', { subtitle: 'API service' });
  b.icon('fs', 'Firestore', id('gcp', 'Firestore'), 510, 90, 'proj', { subtitle: 'documents' });
  b.icon('ps', 'Google Pub/Sub', id('gcp', 'Google Pub/Sub'), 270, 250, 'proj', { subtitle: 'orders topic' });
  b.icon('fn', 'Cloud Functions', id('gcp', 'Cloud Functions'), 510, 250, 'proj', { subtitle: 'worker' });
  b.icon('gcs', 'Google Cloud Storage', id('gcp', 'Google Cloud Storage'), 750, 250, 'proj', { subtitle: 'exports' });
  b.icon('sql', 'Cloud SQL', id('gcp', 'Cloud SQL'), 750, 90, 'proj', { subtitle: 'reporting' });
  b.icon('sched', 'Cloud Scheduler', id('gcp', 'Cloud Scheduler'), 270, 410, 'proj', { subtitle: 'nightly' });
  b.link('users', 'lb', { label: 'HTTPS', pins: ['right', 'left'] });
  b.link('lb', 'run', { label: 'REST', pins: ['right', 'left'] });
  b.link('run', 'fs', { pins: ['right', 'left'] });
  b.link('run', 'ps', { label: 'publish', pins: ['bottom', 'top'] });
  b.link('ps', 'fn', { label: 'trigger', pins: ['right', 'left'] });
  b.link('fn', 'gcs', { label: 'write', pins: ['right', 'left'] });
  b.link('fn', 'sql', { label: 'SQL', pins: ['top', 'left'] });
  b.link('sched', 'ps', { label: 'cron', pins: ['top', 'bottom'], dashed: true });
  return b.done();
}

/** Azure web app: Front Door -> Application Gateway -> App Service / Functions -> SQL / Redis / Blob; Key Vault + App Insights. */
export function azureWebApp() {
  const b = builder();
  b.text('title', 'Azure web application', 0, -90, 700, 40, { fontSize: 28, bold: true, textColor: '#1f2430' });
  b.icon('users', 'Users', 'users', 0, 280);
  b.group('rg', cloudDef('azure', 'Resource group', 'group'), 230, 0, 1080, 700, undefined, 'Resource group · rg-webapp-prod');
  b.icon('fd', 'Azure Front Door', id('azure', 'Azure Front Door'), 40, 280, 'rg', { subtitle: 'global edge + WAF' });
  b.icon('kv', 'Azure Key Vault', id('azure', 'Azure Key Vault'), 40, 70, 'rg', { subtitle: 'secrets' });
  b.icon('ai', 'Application Insights', id('azure', 'Application Insights'), 40, 520, 'rg');
  b.group('vnet', cloudDef('azure', 'Virtual network (VNet)', 'group'), 220, 50, 830, 620, 'rg', 'Virtual network 10.0.0.0/16');
  b.group('s1', cloudDef('azure', 'Subnet', 'group'), 20, 50, 200, 540, 'vnet', 'snet-gateway');
  b.icon('agw', 'Azure Application Gateway', id('azure', 'Azure Application Gateway'), 40, 220, 's1', { subtitle: 'WAF v2' });
  b.group('s2', cloudDef('azure', 'Subnet', 'group'), 260, 50, 240, 540, 'vnet', 'snet-app');
  b.icon('app', 'Azure App Service', id('azure', 'Azure App Service'), 60, 110, 's2', { subtitle: 'web app' });
  b.icon('fn', 'Azure Functions', id('azure', 'Azure Functions'), 60, 340, 's2', { subtitle: 'jobs' });
  b.group('s3', cloudDef('azure', 'Subnet', 'group'), 540, 50, 260, 540, 'vnet', 'snet-data');
  b.icon('sql', 'Azure SQL Database', id('azure', 'Azure SQL Database'), 70, 70, 's3', { subtitle: 'primary' });
  b.icon('redis', 'Azure Cache for Redis', id('azure', 'Azure Cache for Redis'), 70, 230, 's3');
  b.icon('blob', 'Azure Blob Storage', id('azure', 'Azure Blob Storage'), 70, 390, 's3', { subtitle: 'uploads' });
  b.link('users', 'fd', { label: 'HTTPS', pins: ['right', 'left'] });
  b.link('fd', 'agw', { pins: ['right', 'left'] });
  b.link('agw', 'app', { label: 'HTTPS', pins: ['right', 'left'] });
  b.link('app', 'sql', { label: 'SQL', pins: ['right', 'left'] });
  b.link('app', 'redis', { label: 'cache', pins: ['right', 'left'] });
  b.link('fn', 'blob', { label: 'blobs', pins: ['right', 'left'] });
  b.link('app', 'kv', { label: 'secrets', pins: ['left', 'right'], dashed: true });
  b.link('app', 'ai', { label: 'telemetry', pins: ['bottom', 'right'], dashed: true });
  return b.done();
}

/** Kubernetes app: Ingress -> Service -> Pods (Deployment + HPA) with ConfigMap, a StatefulSet database and its PVC. */
export function k8sApp() {
  const b = builder();
  b.text('title', 'Kubernetes application', 0, -90, 700, 40, { fontSize: 28, bold: true, textColor: '#1f2430' });
  b.icon('users', 'Users', 'users', 0, 270);
  b.group('cluster', cloudDef('k8s', 'Kubernetes cluster', 'group'), 230, 0, 1050, 700, undefined, 'Kubernetes cluster');
  b.group('ns', cloudDef('k8s', 'Namespace', 'group'), 20, 50, 1010, 630, 'cluster', 'namespace: shop');
  b.icon('ing', 'Ingress', id('k8s', 'Ingress'), 40, 270, 'ns', { subtitle: 'nginx' });
  b.icon('svc', 'Service', id('k8s', 'Service'), 230, 270, 'ns', { subtitle: 'web :80' });
  b.icon('p1', 'Pod', id('k8s', 'Pod'), 440, 80, 'ns', { subtitle: 'web-1' });
  b.icon('p2', 'Pod', id('k8s', 'Pod'), 440, 270, 'ns', { subtitle: 'web-2' });
  b.icon('p3', 'Pod', id('k8s', 'Pod'), 440, 460, 'ns', { subtitle: 'web-3' });
  b.icon('dep', 'Deployment', id('k8s', 'Deployment'), 650, 80, 'ns', { subtitle: 'web' });
  b.icon('hpa', 'Horizontal Pod Autoscaler', id('k8s', 'Horizontal Pod Autoscaler'), 650, 270, 'ns', { subtitle: '3-10 pods' });
  b.icon('cm', 'ConfigMap', id('k8s', 'ConfigMap'), 650, 460, 'ns');
  b.icon('sts', 'StatefulSet', id('k8s', 'StatefulSet'), 860, 270, 'ns', { subtitle: 'postgres' });
  b.icon('pvc', 'Persistent Volume Claim', id('k8s', 'Persistent Volume Claim'), 860, 460, 'ns', { subtitle: '20Gi' });
  b.link('users', 'ing', { label: 'HTTPS', pins: ['right', 'left'] });
  b.link('ing', 'svc', { pins: ['right', 'left'] });
  for (const p of ['p1', 'p2', 'p3']) b.link('svc', p, { pins: ['right', 'left'] });
  b.link('dep', 'p1', { label: 'manages', pins: ['left', 'right'], dashed: true });
  b.link('hpa', 'dep', { label: 'scales', pins: ['top', 'bottom'], dashed: true });
  b.link('cm', 'p3', { label: 'env', pins: ['left', 'right'], dashed: true });
  b.link('p2', 'sts', { label: 'SQL :5432', pins: ['right', 'left'] }); // label sits on the longest straight segment
  b.link('sts', 'pvc', { label: 'volume', pins: ['bottom', 'top'] });
  return b.done();
}

/** DevOps CI/CD: Git -> Jenkins (Sonar, Trivy, Docker build) -> Harbor -> Argo CD -> Kubernetes -> Prometheus / Grafana. */
export function devopsCicd() {
  const b = builder();
  b.text('title', 'DevOps CI/CD pipeline', 0, -300, 700, 40, { fontSize: 28, bold: true, textColor: '#1f2430' });
  b.plainGroup('src', 'Source', 0, 60, 200, 260, { variant: 'dashed' });
  b.icon('gh', 'GitHub', 'github', 40, 80, 'src', { subtitle: 'app + gitops repos' });
  b.icon('dev', 'Developer', 'user', 40, 400);
  b.plainGroup('ci', 'Continuous integration', 270, 0, 330, 440, { variant: 'dashed' });
  b.icon('jk', 'Jenkins', 'jenkins', 20, 160, 'ci', { subtitle: 'pipeline' });
  b.icon('sq', 'SonarQube', 'sonarqube', 190, 50, 'ci', { subtitle: 'quality gate' });
  b.icon('tv', 'Trivy', 'trivy', 190, 170, 'ci', { subtitle: 'image scan' });
  b.icon('dk', 'Docker', 'docker', 190, 290, 'ci', { subtitle: 'build' });
  b.icon('slack', 'Slack', 'slack', 380, -200, undefined, { subtitle: 'notifications' });
  b.plainGroup('reg', 'Registry', 680, 100, 200, 240, { variant: 'dashed' });
  b.icon('hb', 'Harbor', 'harbor', 40, 70, 'reg', { subtitle: 'images' });
  b.plainGroup('cd', 'Continuous delivery', 960, 100, 200, 240, { variant: 'dashed' });
  b.icon('argo', 'Argo CD', 'argocd', 40, 70, 'cd', { subtitle: 'gitops sync' });
  b.plainGroup('rt', 'Runtime', 1240, 60, 240, 320, { variant: 'dashed' });
  b.icon('k8s', 'Kubernetes', 'kubernetes', 60, 100, 'rt', { subtitle: 'production' });
  b.plainGroup('obs', 'Observability', 1240, 480, 280, 260, { variant: 'dashed' });
  b.icon('prom', 'Prometheus', 'prometheus', 20, 80, 'obs');
  b.icon('graf', 'Grafana', 'grafana', 140, 80, 'obs');
  b.link('dev', 'gh', { label: 'git push', pins: ['top', 'bottom'] });
  b.link('gh', 'jk', { label: 'webhook', pins: ['right', 'left'] });
  b.link('jk', 'sq', { pins: ['right', 'left'] });
  b.link('jk', 'tv', { pins: ['right', 'left'] });
  b.link('jk', 'dk', { pins: ['right', 'left'] });
  b.link('jk', 'slack', { label: 'notify', pins: ['top', 'bottom'], dashed: true });
  b.link('dk', 'hb', { label: 'push image', pins: ['right', 'left'] });
  b.link('hb', 'argo', { label: 'new tag', pins: ['right', 'left'] });
  b.link('argo', 'k8s', { label: 'sync', pins: ['right', 'left'] });
  b.link('k8s', 'prom', { label: 'metrics', pins: ['bottom', 'top'] });
  b.link('prom', 'graf', { pins: ['right', 'left'] });
  return b.done();
}

export const TEMPLATES: Template[] = [
  { id: 'aws-3-tier', name: 'AWS 3-tier web app', build: aws3Tier },
  { id: 'gcp-serverless', name: 'GCP serverless backend', build: gcpServerless },
  { id: 'azure-web-app', name: 'Azure web app', build: azureWebApp },
  { id: 'k8s-app', name: 'Kubernetes app', build: k8sApp },
  { id: 'devops-cicd', name: 'DevOps CI/CD pipeline', build: devopsCicd },
];
