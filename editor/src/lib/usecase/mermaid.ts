import { emptyUseCaseModel, type UcCase, type UcRelKind, type UseCaseModel } from './types';

const q = (s: string) => s.replace(/"/g, "'").replace(/\n/g, ' ');
const MULT = /^\s*([0-9.*n]*) : ([0-9.*n]*)(?:\s+(.+))?\s*$/;

/**
 * Use case diagram drawn as a Mermaid flowchart (Mermaid has no use case diagram): actors are hexagons, use cases stadiums,
 * system boundaries subgraphs; include / extend are dotted arrows labelled with their stereotype. Multiplicities are written
 * as `from : to` in the edge label.
 */
export function renderUseCaseMermaid(model: UseCaseModel): string {
  const id = new Map<string, string>();
  model.actors.forEach((a, i) => id.set(a.id, `A${i + 1}`));
  model.cases.forEach((c, i) => id.set(c.id, `U${i + 1}`));
  model.boundaries.forEach((b, i) => id.set(b.id, `S${i + 1}`));
  const lines = ['flowchart LR'];
  for (const a of model.actors) lines.push(`  ${id.get(a.id)}{{"${q(a.name)}"}}:::actor`);
  const node = (c: UcCase, pad: string) => lines.push(`${pad}${id.get(c.id)}(["${q(c.name)}${c.extensionPoints?.length ? `<br/>extension points: ${c.extensionPoints.map(q).join(', ')}` : ''}"])`);
  const bset = new Set(model.boundaries.map((b) => b.id));
  for (const b of model.boundaries) {
    lines.push(`  subgraph ${id.get(b.id)}["${q(b.name)}"]`);
    for (const c of model.cases) if (c.boundary === b.id) node(c, '    ');
    lines.push('  end');
  }
  for (const c of model.cases) if (!c.boundary || !bset.has(c.boundary)) node(c, '  ');
  for (const r of model.relations) {
    const a = id.get(r.from), b = id.get(r.to);
    if (!a || !b) continue;
    const mult = r.fromMult || r.toMult ? `${q(r.fromMult ?? '')} : ${q(r.toMult ?? '')}` : '';
    const edge = (op: string, label: string) => lines.push(`  ${a} ${op}${label ? `|"${label}"|` : ''} ${b}`);
    if (r.kind === 'include') edge('-.->', '«include»');
    else if (r.kind === 'extend') edge('-.->', '«extend»');
    else if (r.kind === 'generalization') edge('-->', '«generalization»');
    else edge('---', [mult, r.label ? q(r.label) : ''].filter(Boolean).join(' '));
  }
  lines.push('  classDef actor fill:#e6f6f4,stroke:#0f9d8f');
  return lines.join('\n') + '\n';
}

export const looksLikeUseCaseMermaid = (text: string): boolean => {
  const t = text.trim();
  if (!/^(%%.*\n|\s)*(flowchart|graph)\b/i.test(t)) return false;
  return /\{\{[^}]*\}\}\s*:::\s*actor|:::actor|«include»|«extend»|<<include>>|<<extend>>|\bactor\b/i.test(t);
};

interface Tok { id: string; text?: string; shape?: string; cls?: string }
const NODE = /^(\w+)(?:\(\[(.*?)\]\)|\{\{(.*?)\}\}|\(\((.*?)\)\)|\[\/(.*?)\/\]|\[\[(.*?)\]\]|\[(.*?)\]|\((.*?)\)|>(.*?)\])?(?:\s*:::\s*(\w+))?/;
const OP = /^\s*(==>|===|-\.->|-\.-|-->|---)(?:\s*\|\s*"?(.*?)"?\s*\|)?/;
const OP_TEXT = /^\s*(?:--|-\.|==)\s+"?(.+?)"?\s+(-->|---|\.->|==>)/;
const strip = (s?: string) => s?.replace(/^"|"$/g, '').trim();

function readNode(s: string): { tok: Tok; rest: string } | undefined {
  const m = s.trimStart().match(NODE);
  if (!m) return undefined;
  const gi = m.slice(2, 10).findIndex((x) => x !== undefined);
  const order = ['stadium', 'hexagon', 'circle', 'trap', 'sub', 'rect', 'round', 'flag'];
  return { tok: { id: m[1], ...(gi >= 0 ? { text: strip(m[2 + gi]), shape: order[gi] } : {}), ...(m[10] ? { cls: m[10] } : {}) }, rest: s.trimStart().slice(m[0].length) };
}

/** Parse a Mermaid flowchart as a use case diagram (best effort): hexagons / `:::actor` are actors, everything else a use case. */
export function parseUseCaseMermaid(text: string): { model: UseCaseModel; warnings: string[] } {
  const model = emptyUseCaseModel();
  const warnings: string[] = [];
  const nodes = new Map<string, { type: 'actor' | 'case'; id: string }>();
  const classes = new Map<string, string>(); // node id -> class
  const sub: string[] = [];
  const subIds = new Map<string, string>();
  const define = (t: Tok) => {
    const known = nodes.get(t.id);
    const actor = t.shape === 'hexagon' || t.cls === 'actor' || classes.get(t.id) === 'actor';
    if (known && !t.text) return known;
    if (known) {
      if (known.type === 'case') { const c = model.cases.find((x) => x.id === known.id)!; if (!c.boundary && sub.length) c.boundary = sub[sub.length - 1]; }
      return known;
    }
    const raw = t.text ?? t.id;
    if (actor) {
      model.actors.push({ id: t.id, name: raw.replace(/<br\s*\/?>/gi, ' ').trim() });
      nodes.set(t.id, { type: 'actor', id: t.id });
    } else {
      const parts = raw.split(/<br\s*\/?>/i).map((s) => s.trim());
      const eps = parts.slice(1).flatMap((p) => { const m = p.match(/^extension points?\s*:?\s*(.*)$/i); return m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : []; });
      model.cases.push({ id: t.id, name: parts[0], ...(eps.length ? { extensionPoints: eps } : {}), ...(sub.length ? { boundary: sub[sub.length - 1] } : {}) });
      nodes.set(t.id, { type: 'case', id: t.id });
    }
    return nodes.get(t.id)!;
  };
  const lines = text.split(/\r?\n/).map((l) => l.replace(/%%.*$/, '').trim()).filter(Boolean);
  // classes first, so `class A actor` / `A:::actor` order does not matter
  for (const l of lines) { const m = l.match(/^class\s+([\w,]+)\s+(\w+)/); if (m) for (const id of m[1].split(',')) classes.set(id, m[2]); }
  for (const line of lines) {
    if (/^(flowchart|graph)\b/i.test(line) || /^(classDef|class|style|linkStyle|direction|click)\b/.test(line)) continue;
    let m = line.match(/^subgraph\s+(\w+)\s*(?:\[\s*"?(.*?)"?\s*\])?$/) ?? line.match(/^subgraph\s+(.+)$/);
    if (m) {
      const name = strip(m[2] ?? m[1])!;
      const key = m[1] + '|' + name;
      let id = subIds.get(key);
      if (!id) { id = `s${model.boundaries.length + 1}`; model.boundaries.push({ id, name }); subIds.set(key, id); }
      sub.push(id);
      continue;
    }
    if (line === 'end') { sub.pop(); continue; }
    // a chain of nodes and links
    let cur = readNode(line);
    if (!cur) { warnings.push(`Skipped: ${line}`); continue; }
    let prev = define(cur.tok);
    let rest = cur.rest;
    while (rest.trim()) {
      let op = rest.match(OP);
      let label = strip(op?.[2]);
      let head = op?.[1];
      let used = op?.[0].length ?? 0;
      if (!op) {
        const t = rest.match(OP_TEXT);
        if (!t) { warnings.push(`Skipped: ${line}`); break; }
        label = strip(t[1]); head = t[2]; used = t[0].length;
        op = t;
      }
      const next = readNode(rest.slice(used));
      if (!next) { warnings.push(`Skipped: ${line}`); break; }
      const to = define(next.tok);
      rest = next.rest;
      const dotted = head === '-.->' || head === '-.-';
      let kind: UcRelKind = 'association';
      const lab = label ?? '';
      if (/include/i.test(lab)) kind = 'include';
      else if (/extend/i.test(lab)) kind = 'extend';
      else if (/generali[sz]/i.test(lab)) kind = 'generalization';
      else if (dotted && !lab) kind = 'include';
      const mm = kind === 'association' ? lab.match(MULT) : null;
      model.relations.push({
        from: prev.id, to: to.id, kind,
        ...(kind === 'association' && (mm ? mm[3] : lab) ? { label: mm ? mm[3] : lab } : {}),
        ...(mm?.[1] ? { fromMult: mm[1] } : {}),
        ...(mm?.[2] ? { toMult: mm[2] } : {}),
      });
      prev = to;
    }
  }
  // a boundary without use cases is dropped
  model.boundaries = model.boundaries.filter((b) => model.cases.some((c) => c.boundary === b.id));
  return { model, warnings };
}
