import { ACTIVITY_KINDS, emptyActivityModel, type ActFlow, type ActNode, type ActivityKind, type ActivityModel } from './types';

const q = (s: string) => s.replace(/"/g, "'").replace(/\n/g, '<br/>');
const strip = (s?: string) => s?.replace(/^"|"$/g, '').trim();

/**
 * Activity diagram drawn as a Mermaid flowchart (Mermaid has no activity diagram): actions are rounded boxes, decisions diamonds,
 * object nodes `[[ ]]`, send / accept signals flag / trapezoid shapes; initial / final / flow final / fork bars / notes carry a
 * `:::class` so they come back as the same element. Swimlanes are subgraphs, guards are the edge labels.
 */
export function renderActivityMermaid(model: ActivityModel): string {
  const id = new Map<string, string>();
  model.nodes.forEach((n, i) => id.set(n.id, `N${i + 1}`));
  model.lanes.forEach((l, i) => id.set(l.id, `L${i + 1}`));
  const lines = [`flowchart ${model.orientation === 'h' ? 'LR' : 'TD'}`];
  const node = (n: ActNode, pad: string) => {
    const t = q(n.name) || ' ';
    const i = id.get(n.id)!;
    switch (n.kind) {
      case 'initial': return lines.push(`${pad}${i}((" ")):::initial`);
      case 'final': return lines.push(`${pad}${i}(((" "))):::final`);
      case 'flowFinal': return lines.push(`${pad}${i}((" ")):::flowFinal`);
      case 'fork': return lines.push(`${pad}${i}[" "]:::fork`);
      case 'note': return lines.push(`${pad}${i}["${t}"]:::note`);
      case 'decision': return lines.push(`${pad}${i}{"${t}"}`);
      case 'object': return lines.push(`${pad}${i}[["${t}${n.state ? `<br/>[${q(n.state)}]` : ''}"]]`);
      case 'send': return lines.push(`${pad}${i}>"${t}"]`);
      case 'accept': return lines.push(`${pad}${i}[/"${t}"\\]`);
      default: return lines.push(`${pad}${i}("${t}")`);
    }
  };
  const lset = new Set(model.lanes.map((l) => l.id));
  for (const l of model.lanes) {
    lines.push(`  subgraph ${id.get(l.id)}["${q(l.name)}"]`);
    for (const n of model.nodes) if (n.lane === l.id) node(n, '    ');
    lines.push('  end');
  }
  for (const n of model.nodes) if (!n.lane || !lset.has(n.lane)) node(n, '  ');
  for (const f of model.flows) {
    const a = id.get(f.from), b = id.get(f.to);
    if (!a || !b) continue;
    lines.push(f.note ? `  ${a} -.- ${b}` : `  ${a} -->${f.guard ? `|"${q(f.guard)}"|` : ''} ${b}`);
  }
  return lines.join('\n') + '\n';
}

/** Is the text a Mermaid flowchart that was drawn as an activity diagram (initial / final / fork markers)? Plain flowcharts are left alone. */
export const looksLikeActivityMermaid = (text: string): boolean =>
  /^(%%.*\n|\s)*(flowchart|graph)\b/i.test(text.trim()) && /:::\s*(initial|final|flowFinal|fork)\b|\(\(\("[^"]*"\)\)\)/.test(text);

const SHAPES: [RegExp, string][] = [
  [/^\(\(\((.*?)\)\)\)/, 'dcircle'], [/^\(\((.*?)\)\)/, 'circle'], [/^\(\[(.*?)\]\)/, 'round'], [/^\[\[(.*?)\]\]/, 'sub'],
  [/^\[\/(.*?)\\\]/, 'trap'], [/^\[\/(.*?)\/\]/, 'para'], [/^\[\\(.*?)\\\]/, 'para'], [/^\[(.*?)\]/, 'rect'],
  [/^\{\{(.*?)\}\}/, 'hex'], [/^\{(.*?)\}/, 'diamond'], [/^\((.*?)\)/, 'round'], [/^>(.*?)\]/, 'flag'],
];
interface Tok { id: string; text?: string; shape?: string; cls?: string }
const OP = /^\s*(==>|===|-\.->|-\.-|-->|---)(?:\s*\|\s*"?(.*?)"?\s*\|)?/;
const OP_TEXT = /^\s*(?:--|-\.|==)\s+"?(.+?)"?\s+(-->|---|\.->|==>)/;

function readNode(s: string): { tok: Tok; rest: string } | undefined {
  const t = s.trimStart();
  const m = t.match(/^(\w+)/);
  if (!m) return undefined;
  let rest = t.slice(m[0].length);
  const tok: Tok = { id: m[1] };
  for (const [re, shape] of SHAPES) {
    const h = rest.match(re);
    if (h) { tok.shape = shape; tok.text = strip(h[1]) ?? ''; rest = rest.slice(h[0].length); break; }
  }
  const c = rest.match(/^\s*:::\s*(\w+)/);
  if (c) { tok.cls = c[1]; rest = rest.slice(c[0].length); }
  return { tok, rest };
}

const kindOf = (t: Tok, cls?: string): ActivityKind => {
  const c = t.cls ?? cls;
  if (c && (ACTIVITY_KINDS as string[]).includes(c)) return c as ActivityKind;
  switch (t.shape) {
    case 'dcircle': return 'final';
    case 'circle': return !t.text?.trim() ? 'initial' : 'action';
    case 'diamond': case 'hex': return 'decision';
    case 'sub': return 'object';
    case 'flag': return 'send';
    case 'trap': case 'para': return 'accept';
    default: return 'action';
  }
};

/** Parse a Mermaid flowchart as an activity diagram (best effort): subgraphs are swimlanes, diamonds decisions, `:::initial` / `:::final` / `:::fork` ... pick the element. */
export function parseActivityMermaid(text: string): { model: ActivityModel; warnings: string[] } {
  const model = emptyActivityModel();
  const warnings: string[] = [];
  const nodes = new Map<string, ActNode>();
  const classes = new Map<string, string>();
  const sub: string[] = [];
  const subIds = new Map<string, string>();
  const lines = text.split(/\r?\n/).map((l) => l.replace(/%%.*$/, '').trim()).filter(Boolean);
  for (const l of lines) { const m = l.match(/^class\s+([\w,]+)\s+(\w+)/); if (m) for (const i of m[1].split(',')) classes.set(i, m[2]); }
  const define = (t: Tok): ActNode => {
    const known = nodes.get(t.id);
    const lane = sub.length ? sub[sub.length - 1] : undefined;
    const parts = (t.text ?? '').split(/<br\s*\/?>/i).map((s) => s.trim());
    const kind = kindOf(t, classes.get(t.id));
    const stateM = kind === 'object' ? parts.slice(1).join(' ').match(/^\[(.*)\]$/) : null;
    const name = kind === 'object' ? parts[0] : parts.join('\n').trim();
    const pseudo = kind === 'initial' || kind === 'final' || kind === 'flowFinal' || kind === 'fork';
    if (known) {
      if (t.shape) { known.kind = kind; known.name = pseudo ? '' : name; if (stateM) known.state = stateM[1]; }
      if (!known.lane && lane) known.lane = lane;
      return known;
    }
    const known0 = !!(t.shape || t.cls || classes.has(t.id));
    const n: ActNode = {
      id: t.id, kind: known0 ? kind : 'action',
      name: pseudo || (known0 && kind === 'decision' && !t.shape) ? '' : t.shape ? name : t.id,
      ...(lane ? { lane } : {}), ...(stateM ? { state: stateM[1] } : {}),
    };
    nodes.set(t.id, n);
    model.nodes.push(n);
    return n;
  };
  for (const line of lines) {
    const dir = line.match(/^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)\b/i);
    if (dir) { if (/^(LR|RL)$/i.test(dir[1])) model.orientation = 'h'; continue; }
    if (/^(flowchart|graph)\b/i.test(line) || /^(classDef|class|style|linkStyle|direction|click)\b/.test(line)) continue;
    const g = line.match(/^subgraph\s+(\w+)\s*(?:\[\s*"?(.*?)"?\s*\])?$/) ?? line.match(/^subgraph\s+(.+)$/);
    if (g) {
      const name = strip(g[2] ?? g[1])!;
      const key = g[1] + '|' + name;
      let id = subIds.get(key);
      if (!id) { id = `s${model.lanes.length + 1}`; model.lanes.push({ id, name }); subIds.set(key, id); }
      sub.push(id);
      continue;
    }
    if (line === 'end') { sub.pop(); continue; }
    const first = readNode(line);
    if (!first) { warnings.push(`Skipped: ${line}`); continue; }
    let prev = define(first.tok);
    let rest = first.rest;
    while (rest.trim()) {
      let op = rest.match(OP);
      let label = strip(op?.[2]);
      let head = op?.[1];
      let used = op?.[0].length ?? 0;
      if (!op) {
        const t = rest.match(OP_TEXT);
        if (!t) { warnings.push(`Skipped: ${line}`); break; }
        label = strip(t[1]); head = t[2]; used = t[0].length; op = t;
      }
      const next = readNode(rest.slice(used));
      if (!next) { warnings.push(`Skipped: ${line}`); break; }
      const to = define(next.tok);
      rest = next.rest;
      const note = prev.kind === 'note' || to.kind === 'note' || head === '-.-';
      const guard = label?.replace(/^\[|\]$/g, '').trim();
      const f: ActFlow = note ? { from: prev.id, to: to.id, note: true } : { from: prev.id, to: to.id, ...(guard ? { guard } : {}) };
      model.flows.push(f);
      prev = to;
    }
  }
  model.lanes = model.lanes.filter((l) => model.nodes.some((n) => n.lane === l.id));
  return { model, warnings };
}
