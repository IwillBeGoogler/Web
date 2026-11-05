import { quote, word } from './lex';
import { printActivity, printClasses, printComponents, printDeployment, printObjects, printTiming, printPackages, printStates, printUseCases, GROUP_VARIANTS } from './print2';
import { DSL_VERSION } from './types';
import type { CEdge, CNode, CPage } from '../types';

const PRINTABLE = new Set(['icon', 'group']);
const isRel = (e: CEdge) => !!e.data?.relation || !!e.data?.uml;

/** nodes the text format owns: icon/group nodes whose whole parent chain is also icon/group */
export function ownedArchNodes(page: Pick<CPage, 'nodes'>): CNode[] {
  const byId = new Map(page.nodes.map((n) => [n.id, n]));
  const ok = (n: CNode, seen = new Set<string>()): boolean => {
    if (!PRINTABLE.has(n.type) || seen.has(n.id) || (n.type === 'group' && GROUP_VARIANTS.includes(n.data.variant))) return false;
    seen.add(n.id);
    if (!n.parentId) return true;
    const p = byId.get(n.parentId);
    return !!p && ok(p, seen);
  };
  return page.nodes.filter((n) => ok(n));
}
export const ownedArchEdges = (page: CPage): CEdge[] => {
  const ids = new Set(ownedArchNodes(page).map((n) => n.id));
  return page.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && !isRel(e));
};

const attrVal = (v: string) => (/^[A-Za-z0-9_.#/+-]+$/.test(v) ? v : quote(v));

function printArch(page: CPage, out: string[]): void {
  const owned = ownedArchNodes(page);
  const ids = new Set(owned.map((n) => n.id));
  const kids = new Map<string | undefined, CNode[]>();
  for (const n of owned) {
    const key = n.parentId && ids.has(n.parentId) ? n.parentId : undefined;
    kids.set(key, [...(kids.get(key) ?? []), n]);
  }
  const attrs = (n: CNode): string => {
    const a: string[] = [];
    const icon = n.data.iconId ?? n.data.groupIcon;
    if (icon) a.push(`icon=${attrVal(String(icon))}`);
    if (n.data.subtitle) a.push(`sub=${quote(String(n.data.subtitle))}`);
    return a.length ? ' ' + a.join(' ') : '';
  };
  const emit = (n: CNode, ind: string): void => {
    const head = `${ind}${n.type === 'group' ? 'group' : 'node'} ${word(n.id)} ${quote(String(n.data.label ?? ''))}${attrs(n)}`;
    if (n.type === 'group') {
      out.push(`${head} {`);
      for (const k of kids.get(n.id) ?? []) emit(k, ind + '  ');
      out.push(`${ind}}`);
    } else out.push(head);
  };
  for (const n of kids.get(undefined) ?? []) emit(n, '');
  const edges = ownedArchEdges(page);
  if (edges.length) out.push('');
  for (const e of edges) {
    const arrows = e.data?.arrows;
    const op = arrows === 'none' ? '--' : arrows === 'both' ? '<->' : arrows === 'start' ? '<-' : '->';
    const a: string[] = [];
    if (e.data?.preset) a.push(`preset=${attrVal(String(e.data.preset))}`);
    if (e.data?.dashed || e.data?.strokeStyle === 'dashed') a.push('dashed');
    if (e.data?.color && !e.data?.preset) a.push(`color=${attrVal(String(e.data.color))}`);
    out.push(`${word(e.source)} ${op} ${word(e.target)}${e.label ? ` ${quote(String(e.label))}` : ''}${a.length ? ' ' + a.join(' ') : ''}`);
  }
}

const colAttrs = (c: any, refText: string | null): string => {
  const a: string[] = [];
  if (c.pk) a.push('pk');
  if (c.generated === 'autoincrement' || c.generated === 'identity') a.push('increment');
  if (!c.nullable && !c.pk) a.push('not null');
  if (c.unique && !c.pk) a.push('unique');
  if (c.default !== undefined && c.default !== '') a.push(`default: ${/^[-\w.()]+$/.test(String(c.default)) ? c.default : quote(String(c.default))}`);
  if (c.comment) a.push(`note: ${quote(String(c.comment))}`);
  if (refText) a.push(`ref: ${refText}`);
  return a.length ? ` [${a.join(', ')}]` : '';
};
const OPS: Record<string, string> = { '1:N': '>', 'N:1': '<', '1:1': '-', 'N:M': '<>' };

export function relationOps(page: CPage) {
  const byId = new Map(page.nodes.map((n) => [n.id, n]));
  const out: { child: CNode; childCol?: any; parent: CNode; parentCol?: any; op: string; edge: CEdge; inline: boolean }[] = [];
  for (const e of page.edges) {
    const r = e.data?.relation;
    if (!r) continue;
    const parent = byId.get(e.source);
    const child = byId.get(e.target);
    if (!parent || !child || parent.type !== 'table' || child.type !== 'table' || r.group) continue; // composite keys stay on the canvas
    const childCol = (child.data.columns ?? []).find((c: any) => c.id === r.toCol);
    const parentCol = (parent.data.columns ?? []).find((c: any) => c.id === r.fromCol);
    const card = r.cardinality as string;
    const inline = !!childCol && !!parentCol && !!childCol.fk && childCol.fk.table === parent.data.label && (card === '1:N' || card === '1:1') && !r.group;
    out.push({ child, childCol, parent, parentCol, op: card === 'N:1' ? '>' : OPS[card] === '>' ? '>' : OPS[card], edge: e, inline });
  }
  return out;
}

function printTables(page: CPage, out: string[]): void {
  const tables = page.nodes.filter((n) => n.type === 'table');
  if (!tables.length) return;
  const rels = relationOps(page);
  const inlineFor = new Map<string, string>(); // `${tableNodeId}:${colId}` -> "> t.c"
  for (const r of rels) if (r.inline) inlineFor.set(`${r.child.id}:${r.childCol.id}`, `${r.op} ${word(r.parent.data.label)}.${word(r.parentCol.name)}`);
  for (const t of tables) {
    const kind = t.data.tableKind === 'enum' ? 'enum' : t.data.tableKind === 'view' ? 'view' : 'table';
    out.push('', `${kind} ${word(t.data.label)} {`);
    for (const c of t.data.columns ?? []) {
      if (kind === 'enum') out.push(`  ${word(c.name)}`);
      else out.push(`  ${word(c.name)} ${c.type || 'text'}${colAttrs(c, inlineFor.get(`${t.id}:${c.id}`) ?? null)}`);
    }
    if (t.data.indexes?.length) {
      out.push('  indexes {');
      for (const ix of t.data.indexes) out.push(`    ${ix.columns.length > 1 ? `(${ix.columns.join(', ')})` : ix.columns[0]}${ix.unique || ix.name ? ` [${[ix.unique ? 'unique' : '', ix.name ? `name: ${quote(ix.name)}` : ''].filter(Boolean).join(', ')}]` : ''}`);
      out.push('  }');
    }
    out.push('}');
  }
  const standalone = rels.filter((r) => !r.inline);
  if (standalone.length) out.push('');
  for (const r of standalone) {
    if (!r.childCol || !r.parentCol) {
      out.push(`// relation ${r.parent.data.label} ${OPS[r.edge.data!.relation.cardinality] ?? '<>'} ${r.child.data.label} has no columns; not expressible`);
      continue;
    }
    out.push(`ref: ${word(r.child.data.label)}.${word(r.childCol.name)} ${r.op} ${word(r.parent.data.label)}.${word(r.parentCol.name)}`);
  }
}

function printSeq(n: CNode, out: string[]): void {
  const d = n.data as any;
  out.push('', `seq ${word(n.id)} ${quote(String(d.label ?? 'Sequence'))} {`);
  if (d.autonumber) out.push('  autonumber');
  for (const p of d.participants ?? []) out.push(`  ${p.kind} ${word(p.id)}${p.name !== p.id ? ` as ${quote(p.name)}` : ''}${p.modelId ? ` model=${p.modelId}` : ''}`);
  const ARROW: Record<string, string> = { sync: '->', async: '->>', return: '-->', create: '-->>', destroy: '-x' };
  const walk = (items: any[], ind: string) => {
    for (const it of items) {
      if (it.type === 'message') out.push(`${ind}${word(it.from)} ${ARROW[it.kind] ?? '->'} ${word(it.to)}${it.text ? `: ${it.text}` : ''}`);
      else if (it.type === 'note') out.push(`${ind}note ${it.side === 'left' ? 'left of' : it.side === 'right' ? 'right of' : 'over'} ${it.over.map(word).join(', ')}: ${it.text}`);
      else if (it.type === 'fragment') {
        const sw: Record<string, string> = { alt: 'else', opt: 'else', loop: 'else', par: 'and', break: 'else', critical: 'option' };
        it.sections.forEach((s: any, i: number) => {
          out.push(`${ind}${i === 0 ? it.op : sw[it.op]}${s.guard ? ' ' + s.guard : ''}`);
          walk(s.items, ind + '  ');
        });
        out.push(`${ind}end`);
      }
    }
  };
  walk(d.items ?? [], '  ');
  out.push('}');
}

/** The canonical text of a page. Deterministic: same page, same text. */
export function printPage(page: CPage, title = page.name): string {
  const out: string[] = [`#!sdd ${DSL_VERSION}`, `diagram ${quote(title)}`, ''];
  printArch(page, out);
  printTables(page, out);
  for (const n of page.nodes) if (n.type === 'sequence') printSeq(n, out);
  printClasses(page, out);
  printStates(page, out);
  printUseCases(page, out);
  printComponents(page, out);
  printActivity(page, out);
  printDeployment(page, out);
  printPackages(page, out);
  printObjects(page, out);
  printTiming(page, out);
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}
