import pkg from '../../package.json';

/** Project links shown on the landing page. */
export const REPO_URL = 'https://github.com/bakhod1r/system-design-diagram';
export const VERSION: string = pkg.version;
export const MARQUEE_ICONS = ['aws', 'gcp', 'azure', 'kubernetes', 'kafka', 'postgresql', 'grafana', 'prometheus', 'redis', 'docker', 'terraform', 'nginx', 'mongodb', 'elasticsearch', 'rabbitmq', 'github', 'cloudflare', 'vault'];
/** templates highlighted in the carousel (in this order, when present) */
export const SHOWCASE = ['monitoring-medium', 'aws-3-tier', 'k8s-app', 'devops-cicd', 'gcp-serverless', 'azure-web-app', 'monitoring-stack'];
