import { printPage } from './dsl/print';
import { absRects } from './layout';
import type { CNode, CPage } from './types';

export const EXPORT_FORMATS = ['mermaid', 'plantuml', 'sql', 'svg', 'json', 'sdd'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const isTable = (n: CNode) => n.type === 'table';
const isClass = (n: CNode) => n.type === 'class';
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mId = (id: string) => id.replace(/[^A-Za-z0-9_]/g, '_');
const mText = (s: string) => s.replace(/"/g, '#quot;').replace(/\n/g, ' ');

function mermaidFlow(p: CPage): string {
  const lines = ['flowchart LR'];
  const kids = new Map<string | undefined, CNode[]>();
  for (const n of p.nodes) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n]);
  const emit = (n: CNode, ind: string) => {
    if (kids.has(n.id)) {
      lines.push(`${ind}subgraph ${mId(n.id)}["${mText(n.data.label)}"]`);
      for (const k of kids.get(n.id)!) emit(k, ind + '  ');
      lines.push(`${ind}end`);
    } else lines.push(`${ind}${mId(n.id)}["${mText(n.data.label)}"]`);
  };
  for (const n of kids.get(undefined) ?? []) emit(n, '  ');
  for (const e of p.edges) lines.push(`  ${mId(e.source)} -->${e.label ? `|${mText(e.label)}|` : ''} ${mId(e.target)}`);
  return lines.join('\n') + '\n';
}

const CARD: Record<string, string> = { '1:1': '||--||', '1:N': '||--o{', 'N:1': '}o--||', 'N:M': '}o--o{' };
function mermaidEr(p: CPage): string {
  const lines = ['erDiagram'];
  const name = new Map(p.nodes.map((n) => [n.id, n.data.label]));
  for (const n of p.nodes.filter(isTable)) {
    lines.push(`  ${mId(n.data.label)} {`);
    for (const c of n.data.columns ?? []) lines.push(`    ${String(c.type || 'text').replace(/\W+/g, '_')} ${mId(c.name)}${c.pk ? ' PK' : c.fk ? ' FK' : c.unique ? ' UK' : ''}`);
    lines.push('  }');
  }
  for (const e of p.edges) {
    const r = e.data?.relation;
    if (!r || !name.has(e.source) || !name.has(e.target)) continue;
    lines.push(`  ${mId(name.get(e.source)!)} ${CARD[r.cardinality] ?? '}o--||'} ${mId(name.get(e.target)!)} : "${mText(r.name ?? r.fromCol ?? 'rel')}"`);
  }
  return lines.join('\n') + '\n';
}

function mermaidClass(p: CPage): string {
  const lines = ['classDiagram'];
  for (const n of p.nodes.filter(isClass)) {
    lines.push(`  class ${mId(n.data.label)} {`);
    for (const a of n.data.attributes ?? []) lines.push(`    ${a.visibility ?? ''}${a.name}${a.type ? ' ' + a.type : ''}`);
    for (const o of n.data.operations ?? []) lines.push(`    ${o.visibility ?? ''}${o.name}(${(o.params ?? []).map((q: { name: string }) => q.name).join(', ')})`);
    lines.push('  }');
  }
  const label = new Map(p.nodes.map((n) => [n.id, n.data.label]));
  const arrow: Record<string, string> = { inheritance: '<|--', realization: '<|..', composition: '*--', aggregation: 'o--', association: '-->', dependency: '..>' };
  for (const e of p.edges) {
    const k = e.data?.uml?.kind;
    if (!k || !arrow[k]) continue;
    const [s, t] = k === 'inheritance' || k === 'realization' ? [e.target, e.source] : [e.source, e.target];
    lines.push(`  ${mId(label.get(s) ?? s)} ${arrow[k]} ${mId(label.get(t) ?? t)}`);
  }
  return lines.join('\n') + '\n';
}

function toMermaid(p: CPage): string {
  if (p.nodes.some(isTable)) return mermaidEr(p);
  if (p.nodes.some(isClass)) return mermaidClass(p);
  return mermaidFlow(p);
}

function toPlantUml(p: CPage): string {
  const lines = ['@startuml'];
  const label = new Map(p.nodes.map((n) => [n.id, n.data.label]));
  if (p.nodes.some(isClass)) {
    for (const n of p.nodes.filter(isClass)) {
      lines.push(`${n.data.kind === 'interface' ? 'interface' : n.data.kind === 'abstract' ? 'abstract class' : n.data.kind === 'enum' ? 'enum' : 'class'} ${mId(n.data.label)} {`);
      for (const a of n.data.attributes ?? []) lines.push(`  ${a.visibility ?? ''}${a.name}${a.type ? ' : ' + a.type : ''}`);
      for (const o of n.data.operations ?? []) lines.push(`  ${o.visibility ?? ''}${o.name}()`);
      lines.push('}');
    }
    const arrow: Record<string, string> = { inheritance: '<|--', realization: '<|..', composition: '*--', aggregation: 'o--', association: '-->', dependency: '..>' };
    for (const e of p.edges) {
      const k = e.data?.uml?.kind;
      if (!k || !arrow[k]) continue;
      const [s, t] = k === 'inheritance' || k === 'realization' ? [e.target, e.source] : [e.source, e.target];
      lines.push(`${mId(label.get(s) ?? s)} ${arrow[k]} ${mId(label.get(t) ?? t)}`);
    }
  } else {
    const kids = new Map<string | undefined, CNode[]>();
    for (const n of p.nodes) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n]);
    const emit = (n: CNode, ind: string) => {
      if (kids.has(n.id)) {
        lines.push(`${ind}rectangle "${n.data.label.replace(/"/g, "'")}" as ${mId(n.id)} {`);
        for (const k of kids.get(n.id)!) emit(k, ind + '  ');
        lines.push(`${ind}}`);
      } else lines.push(`${ind}rectangle "${n.data.label.replace(/"/g, "'")}" as ${mId(n.id)}`);
    };
    for (const n of kids.get(undefined) ?? []) emit(n, '');
    for (const e of p.edges) lines.push(`${mId(e.source)} --> ${mId(e.target)}${e.label ? ` : ${e.label}` : ''}`);
  }
  lines.push('@enduml');
  return lines.join('\n') + '\n';
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
function toSql(p: CPage): string {
  const tables = p.nodes.filter(isTable);
  if (!tables.length) return '-- no tables on this page\n';
  const byName = new Map(tables.map((t) => [t.data.label, t]));
  const deps = (t: CNode) => (t.data.columns ?? []).map((c: { fk?: { table: string } }) => c.fk?.table).filter((n: string | undefined): n is string => !!n && n !== t.data.label && byName.has(n));
  const done = new Set<string>();
  const order: CNode[] = [];
  const visit = (t: CNode, stack: Set<string>) => {
    if (done.has(t.data.label) || stack.has(t.data.label)) return;
    stack.add(t.data.label);
    for (const d of deps(t)) visit(byName.get(d)!, stack);
    done.add(t.data.label);
    order.push(t);
  };
  tables.forEach((t) => visit(t, new Set()));
  const out: string[] = [];
  for (const t of order) {
    const cols: { name: string; type: string; pk: boolean; unique: boolean; nullable: boolean; default?: string; fk?: { table: string; column: string; onDelete?: string } }[] = t.data.columns ?? [];
    const lines = cols.map((c) => `  ${q(c.name)} ${c.type || 'text'}${c.nullable || c.pk ? '' : ' NOT NULL'}${c.unique && !c.pk ? ' UNIQUE' : ''}${c.default ? ` DEFAULT ${c.default}` : ''}`);
    const pks = cols.filter((c) => c.pk).map((c) => q(c.name));
    if (pks.length) lines.push(`  PRIMARY KEY (${pks.join(', ')})`);
    for (const c of cols) if (c.fk) lines.push(`  FOREIGN KEY (${q(c.name)}) REFERENCES ${q(c.fk.table)} (${q(c.fk.column)})${c.fk.onDelete ? ` ON DELETE ${c.fk.onDelete}` : ''}`);
    out.push(`CREATE TABLE ${q(t.data.label)} (\n${lines.join(',\n')}\n);`);
    for (const ix of t.data.indexes ?? []) out.push(`CREATE ${ix.unique ? 'UNIQUE ' : ''}INDEX ${q(ix.name ?? `${t.data.label}_${ix.columns.join('_')}_idx`)} ON ${q(t.data.label)} (${ix.columns.map(q).join(', ')});`);
  }
  return out.join('\n\n') + '\n';
}

function toSvg(p: CPage): string {
  const rects = absRects(p);
  const all = [...rects.values()];
  const pad = 24;
  const minX = all.length ? Math.min(...all.map((r) => r.x)) - pad : 0;
  const minY = all.length ? Math.min(...all.map((r) => r.y)) - pad : 0;
  const w = all.length ? Math.max(...all.map((r) => r.x + r.width)) + pad - minX : 100;
  const h = all.length ? Math.max(...all.map((r) => r.y + r.height)) + pad - minY : 100;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}" font-family="system-ui, sans-serif" font-size="13">`, '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#2d3340"/></marker></defs>', `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#fff"/>`];
  const groups = p.nodes.filter((n) => p.nodes.some((c) => c.parentId === n.id) || n.type === 'group');
  const order = [...groups, ...p.nodes.filter((n) => !groups.includes(n))];
  for (const n of order) {
    const r = rects.get(n.id)!;
    const isG = groups.includes(n);
    out.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="8" fill="${isG ? '#f5f7fa' : '#ffffff'}" stroke="#2d3340" ${isG ? 'stroke-dasharray="6 4" ' : ''}stroke-width="1.5"/>`);
    out.push(`<text x="${r.x + (isG ? 12 : r.width / 2)}" y="${r.y + (isG ? 22 : r.height / 2 + 4)}" text-anchor="${isG ? 'start' : 'middle'}" fill="#1f2430">${xml(n.data.label)}</text>`);
  }
  for (const e of p.edges) {
    const a = rects.get(e.source);
    const b = rects.get(e.target);
    if (!a || !b) continue;
    const ax = a.x + a.width / 2, ay = a.y + a.height / 2, bx = b.x + b.width / 2, by = b.y + b.height / 2;
    const clip = (r: typeof a, tx: number, ty: number, cx: number, cy: number) => {
      const dx = tx - cx, dy = ty - cy;
      const s = Math.min(dx ? r.width / 2 / Math.abs(dx) : Infinity, dy ? r.height / 2 / Math.abs(dy) : Infinity, 1);
      return [cx + dx * s, cy + dy * s];
    };
    const [x1, y1] = clip(a, bx, by, ax, ay);
    const [x2, y2] = clip(b, ax, ay, bx, by);
    out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2d3340" stroke-width="1.5" marker-end="url(#a)"/>`);
    if (e.label) out.push(`<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 4}" text-anchor="middle" fill="#2d3340">${xml(e.label)}</text>`);
  }
  out.push('</svg>');
  return out.join('\n') + '\n';
}

export function exportPage(page: CPage, format: ExportFormat): string {
  switch (format) {
    case 'mermaid': return toMermaid(page);
    case 'plantuml': return toPlantUml(page);
    case 'sql': return toSql(page);
    case 'svg': return toSvg(page);
    case 'sdd': return printPage(page, page.name);
    case 'json': return JSON.stringify({ id: page.id, name: page.name, nodes: page.nodes, edges: page.edges }, null, 2);
  }
}
