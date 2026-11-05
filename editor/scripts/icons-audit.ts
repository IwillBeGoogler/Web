// Dev-only: node scripts/icons-audit.ts   (npm run icons:audit)
// Prints every catalog item whose icon is missing, empty, invisible (white / currentColor) or a fallback.
import { ICON_REF } from '../src/data/icons/index.generated.ts';
import { CATALOG_DEFS } from '../src/data/catalog.generated.ts';
import { auditSvgBody } from '../src/lib/svgAudit.ts';
import { GENERIC_ICONS } from '../src/data/icons/generic.ts';
import { ICON_SOURCES } from '../src/data/icons/sources.generated.ts';
import { auditIconSources } from '../src/data/iconSources.ts';

const packs = new Map<string, Record<string, { viewBox: string; body: string }>>();
async function pack(name: string) {
  if (!packs.has(name)) packs.set(name, (await import(`../src/data/icons/packs/${name}.generated.ts`)).default);
  return packs.get(name)!;
}

const rows: string[][] = [];
for (const d of CATALOG_DEFS) {
  const ref = ICON_REF[d.id];
  if (!ref) {
    rows.push([d.id, d.label, 'missing', 'no icon ref']);
    continue;
  }
  if (ref.startsWith('g:')) {
    const g = GENERIC_ICONS[ref.slice(2)];
    if (!g || !g.paths.length) rows.push([d.id, d.label, 'generic', `unknown generic icon ${ref}`]);
    continue;
  }
  const [pk, key] = [ref.slice(0, ref.indexOf('/')), ref.slice(ref.indexOf('/') + 1)];
  const icon = (await pack(pk))[key];
  if (!icon) {
    rows.push([d.id, d.label, 'missing', `${ref} not in pack`]);
    continue;
  }
  const r = auditSvgBody(icon.body, icon.viewBox);
  if (!r.ok) rows.push([d.id, d.label, 'broken', r.problems.join('; ')]);
}
// provenance: branded items must come from an allowlisted official source (never `handmade`)
for (const p of auditIconSources(ICON_SOURCES, CATALOG_DEFS.map((d) => d.id))) rows.push([p.id, CATALOG_DEFS.find((d) => d.id === p.id)?.label ?? p.id, 'source', `${p.source}: ${p.problem}`]);
// generic glyphs (also used for shapes / notes / groups in the palette and command palette) must all be well-formed
for (const [id, g] of Object.entries(GENERIC_ICONS)) if (!g.paths.length || g.paths.some((d) => !d.startsWith('M'))) rows.push([id, g.title, 'generic', 'malformed path data']);
if (!rows.length) console.log(`icons OK: ${CATALOG_DEFS.length} items checked`);
else {
  console.log(`${rows.length} icon problem(s) in ${CATALOG_DEFS.length} items\n`);
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) console.log(`${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}  ${r[3]}`);
  process.exitCode = 1;
}
