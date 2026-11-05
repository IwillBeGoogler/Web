// node scripts/build-cncf-icons.ts <landscape.yml> <artwork-tree.json> [cache-dir]
// CNCF graduated + incubating projects: names/maturity from the landscape, color icons from github.com/cncf/artwork.
//   landscape.yml : https://raw.githubusercontent.com/cncf/landscape/master/landscape.yml
//   artwork tree  : https://api.github.com/repos/cncf/artwork/git/trees/main?recursive=1
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProvider, normLabel } from './cloudpack.mjs';
import { CATALOG_DEFS } from '../src/data/catalog.generated.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [yml, treeFile, cacheArg] = [process.argv[2], process.argv[3], process.argv[4]];
if (!yml || !treeFile) throw new Error('usage: node scripts/build-cncf-icons.ts <landscape.yml> <artwork-tree.json> [cache-dir]');
const cache = cacheArg ?? join(root, 'node_modules/.cache/cncf-icons');
mkdirSync(cache, { recursive: true });

// projects: "- item:\n name: X ... project: graduated"
const text = readFileSync(yml, 'utf8');
const projects: { name: string; maturity: string; homepage?: string }[] = [];
for (const block of text.split(/\n\s*- item:\n/).slice(1)) {
  const name = (block.match(/^\s*name:\s*(.+)$/m) ?? [])[1]?.trim().replace(/^['"]|['"]$/g, '');
  const maturity = (block.match(/^\s*project:\s*(\w+)$/m) ?? [])[1];
  if (name && (maturity === 'graduated' || maturity === 'incubating')) projects.push({ name, maturity });
}
const tree: { path: string }[] = JSON.parse(readFileSync(treeFile, 'utf8')).tree;
const art = new Map<string, string>(); // normalised slug -> path
for (const t of tree) {
  const m = t.path.match(/^projects\/([^/]+)\/icon\/color\/[^/]+-icon-color\.svg$/);
  if (m) art.set(normLabel(m[1]), t.path);
}
const ALIAS: Record<string, string> = { 'cri-o': 'crio', 'cloud custodian': 'cloudcustodian', 'open policy agent (opa)': 'openpolicyagent', 'the update framework (tuf)': 'tuf', 'in-toto': 'intoto', 'cloudevents': 'cloudevents', 'containerd': 'containerd', 'grpc': 'grpc', 'kubeedge': 'kubeedge', 'rook': 'rook', 'vitess': 'vitess' };

const legacy = new Map<string, string>(CATALOG_DEFS.map((d) => [normLabel(d.label), d.id]));
const items: any[] = [];
const missing: string[] = [];
for (const p of projects) {
  const tags = ['cncf', 'open-source', 'self-hosted', p.maturity, 'cloud-native'];
  const sub = { id: p.maturity, label: p.maturity === 'graduated' ? 'Graduated projects' : 'Incubating projects' };
  if (legacy.has(normLabel(p.name))) {
    items.push({ label: p.name, sub, svg: '', aliases: [], tags }); // already in the catalog with its logo: listed here, icon kept
    continue;
  }
  const key = normLabel(ALIAS[p.name.toLowerCase()] ?? p.name);
  const path = art.get(key) ?? art.get(normLabel(p.name.replace(/\s*\(.*\)/, '')));
  if (!path) {
    missing.push(p.name);
    continue;
  }
  const f = join(cache, path.replace(/[^a-z0-9.]+/gi, '_'));
  let svg: string;
  if (existsSync(f)) svg = readFileSync(f, 'utf8');
  else {
    const res = await fetch(`https://raw.githubusercontent.com/cncf/artwork/main/${path}`);
    if (!res.ok) {
      missing.push(`${p.name} (HTTP ${res.status})`);
      continue;
    }
    svg = await res.text();
    writeFileSync(f, svg);
  }
  items.push({ label: p.name, sub, svg, aliases: [], tags });
}
const r = writeProvider(root, { provider: 'cncf', providerLabel: 'CNCF', tags: ['cloud-native'], items, legacyLabels: legacy, keepLegacyIcons: true, subOrder: ['graduated', 'incubating'] });
console.log(`cncf: ${r.count} of ${projects.length} graduated/incubating projects (${missing.length} have no color icon in cncf/artwork)`);
if (missing.length) console.log('no icon: ' + missing.join(', '));
if (r.problems.length) console.log('skipped:\n  ' + r.problems.join('\n  '));
