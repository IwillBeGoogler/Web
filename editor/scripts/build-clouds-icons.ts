// node scripts/build-clouds-icons.ts   Other clouds & platforms (Oracle, IBM, Alibaba, DigitalOcean, Cloudflare, Hetzner, OpenStack, ...).
// Logos come from the bundled Iconify `logos` set and simple-icons (vendors that publish no icon kit with a free licence).
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProvider, normLabel } from './cloudpack.mjs';
import { CATALOG_DEFS } from '../src/data/catalog.generated.ts';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logos = require('@iconify-json/logos/icons.json');
const si = Object.values(require('simple-icons') as Record<string, { slug: string; path: string; hex: string }>).filter((i) => i && i.slug);
const siBySlug = new Map(si.map((i) => [i.slug, i]));

function svgFrom(source: string): string {
  const [kind, name] = source.split(':');
  if (kind === 'si') {
    const i = siBySlug.get(name);
    if (!i) throw new Error(`simple-icons has no ${name}`);
    return `<svg viewBox="0 0 24 24"><path d="${i.path}" fill="#${i.hex === '000000' ? '2d3340' : i.hex}"/></svg>`;
  }
  let ic = logos.icons[name];
  if (!ic && logos.aliases?.[name]) ic = { ...logos.icons[logos.aliases[name].parent], ...logos.aliases[name] };
  if (!ic) throw new Error(`logos has no ${name}`);
  return `<svg viewBox="0 0 ${ic.width ?? logos.width ?? 16} ${ic.height ?? logos.height ?? 16}">${ic.body}</svg>`;
}

const P = { id: 'providers', label: 'Cloud providers' };
const E = { id: 'edge', label: 'Edge, PaaS & CDN' };
const V = { id: 'private', label: 'Private cloud & virtualization' };
const L: { label: string; source: string; sub: typeof P; aliases: string[]; tags: string[] }[] = [
  { label: 'Oracle Cloud Infrastructure', source: 'logos:oracle', sub: P, aliases: ['oci', 'oracle cloud'], tags: ['oracle'] },
  { label: 'IBM Cloud', source: 'logos:ibm', sub: P, aliases: ['ibm', 'bluemix'], tags: ['ibm'] },
  { label: 'Alibaba Cloud', source: 'si:alibabacloud', sub: P, aliases: ['aliyun', 'alicloud'], tags: ['alibaba'] },
  { label: 'DigitalOcean', source: 'logos:digital-ocean-icon', sub: P, aliases: ['droplet', 'do', 'digital ocean'], tags: ['digitalocean'] },
  { label: 'Hetzner', source: 'si:hetzner', sub: P, aliases: ['hetzner cloud', 'hcloud'], tags: ['hetzner'] },
  { label: 'Akamai Connected Cloud (Linode)', source: 'logos:linode', sub: P, aliases: ['linode', 'akamai cloud'], tags: ['akamai', 'linode'] },
  { label: 'Scaleway', source: 'si:scaleway', sub: P, aliases: ['scw'], tags: ['scaleway'] },
  { label: 'Vultr', source: 'logos:vultr', sub: P, aliases: [], tags: ['vultr'] },
  { label: 'UpCloud', source: 'si:upcloud', sub: P, aliases: [], tags: ['upcloud'] },
  { label: 'Exoscale', source: 'si:exoscale', sub: P, aliases: [], tags: ['exoscale'] },
  { label: 'IONOS Cloud', source: 'si:ionos', sub: P, aliases: ['ionos', '1&1'], tags: ['ionos'] },
  { label: 'Rackspace', source: 'logos:rackspace-icon', sub: P, aliases: [], tags: ['rackspace'] },
  { label: 'Cloudflare', source: 'si:cloudflare', sub: E, aliases: ['cf', 'cloudflare dns'], tags: ['cloudflare', 'cdn', 'edge', 'network'] },
  { label: 'Cloudflare Workers', source: 'si:cloudflareworkers', sub: E, aliases: ['workers', 'edge functions'], tags: ['cloudflare', 'serverless', 'edge'] },
  { label: 'Cloudflare Pages', source: 'si:cloudflarepages', sub: E, aliases: ['pages'], tags: ['cloudflare', 'frontend', 'edge'] },
  { label: 'Akamai', source: 'logos:akamai', sub: E, aliases: ['akamai cdn'], tags: ['akamai', 'cdn', 'edge'] },
  { label: 'Fastly', source: 'si:fastly', sub: E, aliases: [], tags: ['fastly', 'cdn', 'edge'] },
  { label: 'Fly.io', source: 'si:flydotio', sub: E, aliases: ['fly', 'flyio'], tags: ['flyio', 'paas'] },
  { label: 'Netlify', source: 'si:netlify', sub: E, aliases: [], tags: ['netlify', 'paas', 'frontend'] },
  { label: 'Vercel', source: 'si:vercel', sub: E, aliases: [], tags: ['vercel', 'paas', 'frontend'] },
  { label: 'Heroku', source: 'logos:heroku-icon', sub: E, aliases: [], tags: ['heroku', 'paas'] },
  { label: 'Backblaze B2', source: 'si:backblaze', sub: E, aliases: ['b2', 'backblaze'], tags: ['backblaze', 'storage'] },
  { label: 'Wasabi', source: 'si:wasabi', sub: E, aliases: ['wasabi hot cloud storage'], tags: ['wasabi', 'storage'] },
  { label: 'OpenStack', source: 'logos:openstack-icon', sub: V, aliases: ['nova', 'neutron', 'cinder', 'horizon'], tags: ['openstack', 'open-source', 'self-hosted', 'iaas'] },
  { label: 'Red Hat OpenShift', source: 'logos:openshift', sub: V, aliases: ['openshift', 'ocp', 'okd'], tags: ['openshift', 'redhat', 'k8s', 'container'] },
  { label: 'VMware', source: 'logos:vmware', sub: V, aliases: ['vsphere', 'esxi', 'vcenter'], tags: ['vmware', 'virtualization', 'self-hosted'] },
  { label: 'Proxmox VE', source: 'si:proxmox', sub: V, aliases: ['proxmox'], tags: ['proxmox', 'virtualization', 'open-source', 'self-hosted'] },
  { label: 'Nutanix', source: 'si:nutanix', sub: V, aliases: ['ahv'], tags: ['nutanix', 'virtualization', 'self-hosted'] },
];
const legacy = new Map<string, string>(CATALOG_DEFS.map((d) => [normLabel(d.label), d.id]));
const items = L.map((x) => ({ label: x.label, sub: x.sub, svg: svgFrom(x.source), aliases: x.aliases, tags: x.tags }));
const r = writeProvider(root, { provider: 'platforms', file: 'clouds', providerLabel: 'Other clouds & platforms', tags: ['cloud'], items, legacyLabels: legacy, subOrder: ['providers', 'edge', 'private'] });
console.log(`clouds: ${r.count} items in ${r.packs} packs (${r.overrides} legacy ids upgraded)`);
if (r.problems.length) console.log('skipped:\n  ' + r.problems.join('\n  '));
