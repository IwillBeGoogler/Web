// Generates the brand-icon packs + catalog metadata from scripts/catalog.mjs.
//   node scripts/gen-icons.mjs          write files
//   node scripts/gen-icons.mjs --check  only report unresolved logos
// Output:
//   src/data/icons/packs/<section>.generated.ts   (lazy-loaded icon bodies)
//   src/data/icons/index.generated.ts             (item id -> icon ref, pack loaders)
//   src/data/catalog.generated.ts                 (items + sections)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as si from 'simple-icons';
import { sanitizeSvg, isUnsafe, scopeIds } from './sanitize.mjs';
import { DEFS, SECTIONS, PARENT_LOGO, BRANDED_GENERIC } from './catalog.mjs';
import { auditSvgBody } from '../src/lib/svgAudit.ts';
import { computeTags } from './tags.mjs';

/** White-only vendor logos (made for dark backgrounds) are recoloured to a neutral dark so they stay visible. */
function recolorWhite(r) {
  const audit = auditSvgBody(r.body, r.viewBox);
  if (!audit.problems.some((p) => p.startsWith('white-only'))) return r;
  const body = r.body.replace(/(fill\s*[=:]\s*"?)(#fff(?:fff)?|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/gi, '$1#2d3340').replace(/(stroke\s*[=:]\s*"?)(#fff(?:fff)?|white)/gi, '$1#2d3340');
  recolored.push(d_id_hint);
  return { ...r, body };
}
/** Logos drawn in a small part of a big viewBox are cropped to their drawn bounding box (+4% margin). */
function tighten(r) {
  const a = auditSvgBody(r.body, r.viewBox);
  if (!a.bbox || !a.problems.some((p) => p.startsWith('tiny'))) return r;
  const b = a.bbox;
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const side = Math.max(w, h) * 1.08;
  const x = b.x0 - (side - w) / 2, y = b.y0 - (side - h) / 2;
  return { ...r, viewBox: `${+x.toFixed(2)} ${+y.toFixed(2)} ${+side.toFixed(2)} ${+side.toFixed(2)}` };
}
let d_id_hint = '';
const recolored = [];

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const sets = {
  logos: require('@iconify-json/logos/icons.json'),
  devicon: require('@iconify-json/devicon/icons.json'),
};
const siBySlug = new Map(Object.values(si).filter((i) => i && i.slug).map((i) => [i.slug, i]));

function iconify(kind, name) {
  const set = sets[kind];
  let ic = set.icons[name];
  if (!ic && set.aliases?.[name]) ic = { ...set.icons[set.aliases[name].parent], ...set.aliases[name] };
  if (!ic) return null;
  const w = ic.width ?? set.width ?? 16;
  const h = ic.height ?? set.height ?? 16;
  return sanitizeSvg(`<svg viewBox="0 0 ${w} ${h}">${ic.body}</svg>`);
}
function simple(slug) {
  const i = siBySlug.get(slug);
  return i ? { viewBox: '0 0 24 24', body: `<path d="${i.path}" fill="#${i.hex}"/>` } : null;
}
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function file(name) {
  const p = join(root, 'src/assets/logos', name);
  if (name.endsWith('.svg')) return sanitizeSvg(readFileSync(p, 'utf8'));
  const buf = readFileSync(p);
  const { w, h } = pngSize(buf);
  return sanitizeSvg(`<svg viewBox="0 0 ${w} ${h}"><image width="${w}" height="${h}" href="data:image/png;base64,${buf.toString('base64')}"/></svg>`);
}
// file name -> upstream URL, from src/assets/logos/SOURCES.md (a vendored file without a row there counts as handmade)
const sourceRows = new Map();
for (const line of readFileSync(join(root, 'src/assets/logos/SOURCES.md'), 'utf8').split('\n')) {
  const c = line.split('|').map((x) => x.trim());
  if (c.length > 3 && /\.(svg|png)$/.test(c[1])) sourceRows.set(c[1], c.find((x) => /^https?:\/\//.test(x)) ?? '');
}
function provenance(def, srcKey) {
  const parent = PARENT_LOGO[def.id];
  const mk = (source, origin, branded = true) => ({ source, origin, branded });
  if (def.source.startsWith('g:')) return BRANDED_GENERIC.includes(def.id) ? mk('handmade', def.source) : mk('generic', def.source, false);
  const [kind, ...rest] = srcKey.split(':');
  const name = rest.join(':');
  if (parent) return mk('parent-project', parent);
  if (kind === 'logos') return mk('iconify-logos', srcKey);
  if (kind === 'devicon') return mk('devicon', srcKey);
  if (kind === 'si') return mk('simple-icons', srcKey);
  const url = sourceRows.get(name) || sourceRows.get(name.replace(/\.(svg|png)$/, ''));
  if (!url) return mk('handmade', srcKey);
  if (/cncf\/landscape/.test(url)) return mk('cncf-landscape', url);
  if (/apache\.org\/logos/.test(url)) return mk('asf', url);
  if (/dashboard-icons|selfhst\/icons/.test(url)) return mk('dashboard-icons', url);
  return mk('vendor-repo', url);
}
const sources = {};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function resolve(def) {
  const [kind, name] = def.source ? [def.source.slice(0, def.source.indexOf(':')), def.source.slice(def.source.indexOf(':') + 1)] : [null, null];
  let r = null;
  if (kind === 'logos' || kind === 'devicon') r = iconify(kind, name);
  else if (kind === 'si') r = simple(name);
  else if (kind === 'file') r = file(name);
  if (r) return { r, srcKey: def.source };
  // auto-detect fallbacks
  const tries = [
    ['logos', `${def.id}-icon`], ['logos', def.id], ['logos', `${slug(def.label)}-icon`], ['logos', slug(def.label)],
    ['devicon', def.id], ['devicon', slug(def.label)], ['si', slug(def.label)], ['si', slug(def.id)],
  ];
  for (const [k, n] of tries) {
    const x = k === 'si' ? simple(n) : iconify(k, n);
    if (x) return { r: x, srcKey: `${k}:${n}`, auto: true };
  }
  return null;
}

// ---- parse defs ----
const defs = DEFS.split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
  const [id, label, aliases, source, port] = l.split('|').map((x) => x?.trim());
  return { id, label, aliases: aliases ? aliases.split(',').map((a) => a.trim()).filter(Boolean) : [], source: source || '', port: port || '' };
});

// first top-level section containing the id => its pack
const packOf = new Map();
// one pack (lazy chunk) per sub-category keeps every generated chunk small
for (const s of SECTIONS) for (const sub of s.subs) for (const id of sub.ids) if (!packOf.has(id)) packOf.set(id, `${s.id}-${sub.id}`.replace(/[^a-z0-9-]/gi, '-'));

const packs = {}; // pack -> { key: icon }
const refs = {}; // item id -> 'g:xxx' | 'pack/key'
const partOf = new Map();
const srcOwner = new Map(); // srcKey -> ref
const unresolved = [];
/** generic stand-ins for items whose logo cannot be resolved (see the UNRESOLVED report) */
const FALLBACK = {
  manticore: 'search', greenplum: 'data-warehouse', lmdb: 'database', proxysql: 'reverse-proxy', micronaut: 'service', echo: 'service',
  zeromq: 'queue', fivetran: 'stream-processor', 'ibm-cloud': 'cloud', postmark: 'email', collectd: 'server', statsd: 'server',
  papertrail: 'server', 'incident-io': 'third-party-api', logrocket: 'third-party-api', maxwell: 'stream-processor', canal: 'stream-processor',
  meltano: 'stream-processor', estuary: 'stream-processor', striim: 'stream-processor', conduktor: 'service', sqoop: 'stream-processor',
  squid: 'reverse-proxy', litespeed: 'server', restic: 'file-storage', kvm: 'server',
};
const autoPicked = [];
for (const d of defs) {
  if (d.source.startsWith('g:')) {
    refs[d.id] = d.source;
    sources[d.id] = provenance(d, d.source);
    continue;
  }
  d_id_hint = d.id;
  const res = resolve(d);
  if (res) res.r = tighten(recolorWhite(res.r));
  if (!res) {
    // no logo anywhere: keep the item with a matching generic icon instead of dropping it from the catalog
    unresolved.push(`${d.id} (${d.source || 'auto'}) -> g:${FALLBACK[d.id] ?? 'service'}`);
    refs[d.id] = `g:${FALLBACK[d.id] ?? 'service'}`;
    sources[d.id] = provenance(d, refs[d.id]);
    continue;
  }
  sources[d.id] = provenance(d, res.srcKey);
  if (res.auto) autoPicked.push(`${d.id} -> ${res.srcKey}`);
  if (isUnsafe(res.r.body)) throw new Error(`unsafe markup in ${d.id}`);
  const existing = srcOwner.get(res.srcKey);
  if (existing) {
    refs[d.id] = existing;
    continue;
  }
  const base = packOf.get(d.id) ?? 'misc';
  const bytes = JSON.stringify(res.r).length;
  let part = partOf.get(base) ?? { n: 1, size: 0 };
  if (part.size + bytes > 260_000 && part.size > 0) part = { n: part.n + 1, size: 0 }; // keep every lazy chunk under ~260 kB
  part.size += bytes;
  partOf.set(base, part);
  const pack = part.n > 1 ? `${base}-${part.n}` : base;
  (packs[pack] ??= {})[d.id] = { ...res.r, body: scopeIds(res.r.body, `i-${d.id}`) };
  refs[d.id] = `${pack}/${d.id}`;
  srcOwner.set(res.srcKey, refs[d.id]);
}
if (recolored.length) console.log('recoloured white-only logos:', recolored.join(', '));
if (autoPicked.length) console.log('auto-detected:\n  ' + autoPicked.join('\n  '));
if (unresolved.length) console.log(`UNRESOLVED -> generic icon (${unresolved.length}):\n  ` + unresolved.join('\n  '));
if (check) {
  console.log(`defs ${defs.length}, resolved ${Object.keys(refs).length}`);
  process.exit(0);
}

// ---- write ----
const dir = join(root, 'src/data/icons/packs');
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(dir)) if (f.endsWith('.generated.ts')) writeFileSync(join(dir, f), 'export default {};\n'); // reset stale (no rm)
for (const [pack, icons] of Object.entries(packs)) {
  writeFileSync(join(dir, `${pack}.generated.ts`), `// GENERATED by scripts/gen-icons.mjs - do not edit.\nimport type { BrandIcon } from '../types';\nconst icons: Record<string, BrandIcon> = ${JSON.stringify(icons)};\nexport default icons;\n`);
}
const packNames = Object.keys(packs);
const index = `// GENERATED by scripts/gen-icons.mjs - do not edit.
import type { BrandIcon } from './types';
/** item id -> 'g:<genericIconId>' | '<pack>/<key>' */
export const ICON_REF: Record<string, string> = ${JSON.stringify(refs, null, 1)};
export const PACK_LOADERS: Record<string, () => Promise<{ default: Record<string, BrandIcon> }>> = {
${packNames.map((p) => `  ${JSON.stringify(p)}: () => import('./packs/${p}.generated'),`).join('\n')}
};
`;
writeFileSync(join(root, 'src/data/icons/index.generated.ts'), index);
writeFileSync(
  join(root, 'src/data/icons/sources.generated.ts'),
  `// GENERATED by scripts/gen-icons.mjs - do not edit. Provenance of every catalog icon (see src/data/iconSources.ts).\nimport type { IconSourceEntry } from '../iconSources';\nexport const ICON_SOURCES: Record<string, IconSourceEntry> = ${JSON.stringify(Object.fromEntries(Object.entries(sources).filter(([id]) => id in refs)), null, 1)};\n`,
);

const known = new Set(Object.keys(refs));
const locs = new Map();
for (const s of SECTIONS) for (const b of s.subs) for (const id of b.ids) locs.set(id, [...(locs.get(id) ?? []), { section: s.id, sub: b.id }]);
const items = defs.filter((d) => known.has(d.id)).map((d) => ({ id: d.id, label: d.label, aliases: d.aliases, tags: computeTags(d, locs.get(d.id) ?? []), ...(d.port ? { subtitle: d.port } : {}) }));
const sections = SECTIONS.map((s) => ({
  id: s.id,
  label: s.label,
  subs: s.subs
    .map((b) => ({ id: b.id, label: b.label, ids: [...new Set(b.ids.filter((i) => known.has(i)))], ...(b.shapes ? { shapes: true } : {}), ...(b.helpers ? { helpers: true } : {}) }))
    .filter((b) => b.ids.length || b.shapes || b.helpers),
})).filter((s) => s.subs.length);
writeFileSync(join(root, 'scripts/.skipped.txt'), unresolved.join('\n'));
writeFileSync(
  join(root, 'src/data/catalog.generated.ts'),
  `// GENERATED by scripts/gen-icons.mjs from scripts/catalog.mjs - do not edit.\nexport interface CatalogDef { id: string; label: string; aliases: string[]; tags: string[]; subtitle?: string }\nexport interface CatalogSub { id: string; label: string; ids: string[]; shapes?: boolean; helpers?: boolean }\nexport interface CatalogSectionDef { id: string; label: string; subs: CatalogSub[] }\nexport const CATALOG_DEFS: CatalogDef[] = ${JSON.stringify(items)};\nexport const CATALOG_SECTIONS: CatalogSectionDef[] = ${JSON.stringify(sections)};\n`,
);
// prebuilt search index: lowercase names/aliases + inverted tag index (so search never touches the SVG packs)
const lc = (x) => x.toLowerCase();
const tagIndex = {};
items.forEach((it, i) => { for (const t of it.tags) (tagIndex[t] ??= []).push(i); });
writeFileSync(
  join(root, 'src/data/search-index.generated.ts'),
  `// GENERATED by scripts/gen-icons.mjs - do not edit.\nexport interface SearchIndexData { ids: string[]; names: string[]; aliases: string[][]; tags: string[][]; tagIndex: Record<string, number[]> }\nexport const SEARCH_INDEX: SearchIndexData = ${JSON.stringify({ ids: items.map((i) => i.id), names: items.map((i) => lc(i.label)), aliases: items.map((i) => i.aliases.map(lc)), tags: items.map((i) => i.tags), tagIndex })};\n`,
);
console.log(`wrote ${Object.keys(refs).length} refs, ${Object.values(packs).reduce((n, p) => n + Object.keys(p).length, 0)} icons in ${packNames.length} packs`);
